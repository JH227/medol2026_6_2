const fs = require('fs');
const path = require('path');

// 手动解析 PLY 二进制文件并转换为 .splat 格式
const PLY_FORMAT = {
  HEADER_END: 'end_header',
  VERTEX: 'vertex',
  PROPERTY: 'property',
  ELEMENT: 'element',
  FLOAT: 'float',
  UCHAR: 'uchar'
};

function parsePlyHeader(buffer) {
  const headerText = [];
  let offset = 0;
  const textDecoder = new TextDecoder();

  while (offset < buffer.length) {
    const end = buffer.indexOf(0x0A, offset); // \n
    if (end === -1) break;
    const line = textDecoder.decode(buffer.slice(offset, end)).trim();
    headerText.push(line);
    offset = end + 1;
    if (line === PLY_FORMAT.HEADER_END) break;
  }

  const headerEndPos = offset;
  const header = { elements: {}, properties: {}, vertexCount: 0 };

  let currentElement = null;
  for (const line of headerText) {
    const parts = line.split(/\s+/);
    if (parts[0] === PLY_FORMAT.ELEMENT) {
      currentElement = parts[1];
      header.elements[currentElement] = { count: parseInt(parts[2]) };
      header.properties[currentElement] = [];
      if (currentElement === 'vertex') {
        header.vertexCount = parseInt(parts[2]);
      }
    } else if (parts[0] === PLY_FORMAT.PROPERTY && currentElement) {
      header.properties[currentElement].push({
        type: parts[1],
        name: parts[2]
      });
    }
  }

  return { header, headerEndPos };
}

function propertySize(type) {
  if (type === 'float' || type === 'int' || type === 'uint') return 4;
  if (type === 'uchar') return 1;
  if (type === 'double') return 8;
  return 4;
}

function convertPlyToSplat(plyPath, splatPath) {
  console.log(`Reading: ${plyPath}`);
  const buffer = fs.readFileSync(plyPath);
  
  const { header, headerEndPos } = parsePlyHeader(buffer);
  console.log(`Vertices: ${header.vertexCount.toLocaleString()}`);
  console.log(`Properties:`, header.properties['vertex'] ? header.properties['vertex'].map(p => p.name).join(', ') : 'N/A');

  const props = header.properties['vertex'] || [];
  
  // Calculate vertex byte size
  let vertexSize = 0;
  const propOffsets = {};
  for (const prop of props) {
    propOffsets[prop.name] = vertexSize;
    vertexSize += propertySize(prop.type);
  }

  const dataOffset = headerEndPos;
  const vertexCount = header.vertexCount;

  const SPLAT_SIZE = 32;
  const splatBuffer = Buffer.alloc(vertexCount * SPLAT_SIZE);

  // Get property offsets
  let xOff = 0, yOff = 4, zOff = 8;
  let fdc0Off, fdc1Off, fdc2Off, opOff;
  let s0Off, s1Off, s2Off, r0Off, r1Off, r2Off, r3Off;

  for (const prop of props) {
    const off = propOffsets[prop.name];
    if (prop.name === 'x') xOff = off;
    if (prop.name === 'y') yOff = off;
    if (prop.name === 'z') zOff = off;
    if (prop.name === 'f_dc_0') fdc0Off = off;
    if (prop.name === 'f_dc_1') fdc1Off = off;
    if (prop.name === 'f_dc_2') fdc2Off = off;
    if (prop.name === 'opacity') opOff = off;
    if (prop.name === 'scale_0') s0Off = off;
    if (prop.name === 'scale_1') s1Off = off;
    if (prop.name === 'scale_2') s2Off = off;
    if (prop.name === 'rot_0') r0Off = off;
    if (prop.name === 'rot_1') r1Off = off;
    if (prop.name === 'rot_2') r2Off = off;
    if (prop.name === 'rot_3') r3Off = off;
  }

  const SH_C0 = 0.28209479177387814;

  function shToColor(sh0, sh1, sh2) {
    return [
      Math.round(Math.max(0, Math.min(255, (sh0 * SH_C0 + 0.5) * 255))),
      Math.round(Math.max(0, Math.min(255, (sh1 * SH_C0 + 0.5) * 255))),
      Math.round(Math.max(0, Math.min(255, (sh2 * SH_C0 + 0.5) * 255)))
    ];
  }

  // Scale from PLY: exp(scale) to get actual scale
  const sOff = [s0Off, s1Off, s2Off];
  const rOff = [r0Off, r1Off, r2Off, r3Off];

  for (let i = 0; i < vertexCount; i++) {
    const vtxOffset = dataOffset + i * vertexSize;
    const splatBase = i * SPLAT_SIZE;

    // Position
    splatBuffer.writeFloatLE(buffer.readFloatLE(vtxOffset + xOff), splatBase);
    splatBuffer.writeFloatLE(buffer.readFloatLE(vtxOffset + yOff), splatBase + 4);
    splatBuffer.writeFloatLE(buffer.readFloatLE(vtxOffset + zOff), splatBase + 8);

    // Scale - use exp(scale) or default
    let sx = 0.01, sy = 0.01, sz = 0.01;
    if (s0Off !== undefined) {
      sx = Math.exp(buffer.readFloatLE(vtxOffset + s0Off));
      sy = Math.exp(buffer.readFloatLE(vtxOffset + s1Off));
      sz = Math.exp(buffer.readFloatLE(vtxOffset + s2Off));
    }
    splatBuffer.writeFloatLE(sx, splatBase + 12);
    splatBuffer.writeFloatLE(sy, splatBase + 16);
    splatBuffer.writeFloatLE(sz, splatBase + 20);

    // Color from SH DC
    const [r, g, b] = shToColor(
      buffer.readFloatLE(vtxOffset + fdc0Off),
      buffer.readFloatLE(vtxOffset + fdc1Off),
      buffer.readFloatLE(vtxOffset + fdc2Off)
    );
    splatBuffer.writeUInt8(r, splatBase + 24);
    splatBuffer.writeUInt8(g, splatBase + 25);
    splatBuffer.writeUInt8(b, splatBase + 26);

    // Opacity
    let alpha = 128;
    if (opOff !== undefined) {
      const rawOp = buffer.readFloatLE(vtxOffset + opOff);
      alpha = Math.round(1 / (1 + Math.exp(-rawOp)) * 255);
      alpha = Math.max(0, Math.min(255, alpha));
    }
    splatBuffer.writeUInt8(alpha, splatBase + 27);

    // Rotation quaternion
    if (r0Off !== undefined) {
      const r0 = buffer.readFloatLE(vtxOffset + r0Off);
      const r1 = buffer.readFloatLE(vtxOffset + r1Off);
      const r2 = buffer.readFloatLE(vtxOffset + r2Off);
      const r3 = buffer.readFloatLE(vtxOffset + r3Off);
      // Normalize and pack to uint8
      const len = Math.sqrt(r0*r0 + r1*r1 + r2*r2 + r3*r3) || 1;
      splatBuffer.writeUInt8(Math.round((r0/len * 0.5 + 0.5) * 255), splatBase + 28);
      splatBuffer.writeUInt8(Math.round((r1/len * 0.5 + 0.5) * 255), splatBase + 29);
      splatBuffer.writeUInt8(Math.round((r2/len * 0.5 + 0.5) * 255), splatBase + 30);
      splatBuffer.writeUInt8(Math.round((r3/len * 0.5 + 0.5) * 255), splatBase + 31);
    } else {
      splatBuffer.writeUInt8(128, splatBase + 28);
      splatBuffer.writeUInt8(128, splatBase + 29);
      splatBuffer.writeUInt8(128, splatBase + 30);
      splatBuffer.writeUInt8(255, splatBase + 31);
    }

    if ((i + 1) % 500000 === 0) {
      console.log(`  Progress: ${i+1}/${vertexCount} (${Math.round((i+1)/vertexCount*100)}%)`);
    }
  }

  fs.writeFileSync(splatPath, splatBuffer);
  const fileSize = fs.statSync(splatPath).size;
  console.log(`\nConversion complete!`);
  console.log(`Output: ${splatPath}`);
  console.log(`Size: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Splats: ${vertexCount.toLocaleString()}`);
}

const input = process.argv[2];
const output = process.argv[3] || input.replace(/\.ply$/i, '.splat');

if (!input) {
  console.log('Usage: node convert.js <input.ply> [output.splat]');
  process.exit(1);
}

convertPlyToSplat(input, output);

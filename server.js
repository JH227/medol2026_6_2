const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { join } = require('path');
const https = require('https');

const app = express();
const http = createServer(app);
const io = new Server(http);

app.use(express.static(join(__dirname, 'public')));

// CORS 代理：从 GitHub Release 获取模型文件  
app.get('/model/minisu.splat', (req, res) => {
  const modelUrl = 'https://github.com/JH227/medol2026_6_2/releases/download/v0.1/minisu.splat';
  https.get(modelUrl, { headers: { 'User-Agent': 'Railway/1.0' } }, (proxyRes) => {
    // 处理重定向
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      https.get(proxyRes.headers.location, { headers: { 'User-Agent': 'Railway/1.0' } }, (finalRes) => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Length', finalRes.headers['content-length'] || '105624544');
        finalRes.pipe(res);
      }).on('error', () => { res.status(500).send('Model fetch error'); });
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Length', proxyRes.headers['content-length'] || '105624544');
    proxyRes.pipe(res);
  }).on('error', () => { res.status(500).send('Model fetch error'); });
});

const rooms = {};

function genCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  let currentRoom, currentUser;

  socket.on('join', ({ roomCode, name }) => {
    const code = roomCode.toUpperCase();
    if (!rooms[code]) rooms[code] = { users: {} };

    currentRoom = code;
    socket.join(code);

    currentUser = {
      id: socket.id,
      name: name || 'Visitor',
      pos: { x: 0, y: 1, z: 0 },
      rot: { y: 0 },
      color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
    };
    rooms[code].users[socket.id] = currentUser;

    // 发房间内已有用户列表给新人
    const users = Object.values(rooms[code].users).map(u => u.id === socket.id ? { ...u, isMe: true } : u);
    socket.emit('users', users);
    // 广播新人给其他人
    socket.to(code).emit('user-joined', currentUser);
  });

  socket.on('move', (pos) => {
    if (!currentRoom || !currentUser) return;
    currentUser.pos = pos;
    socket.to(currentRoom).emit('user-moved', { id: socket.id, pos });
  });

  // WebRTC signaling
  socket.on('signal', ({ to, data }) => {
    socket.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('mute', (muted) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('user-muted', { id: socket.id, muted });
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].users[socket.id];
      socket.to(currentRoom).emit('user-left', socket.id);
      // 房间永久保留，不删除
    }
  });
});

app.post('/api/room', express.json(), (req, res) => {
  var code = (req.body.code || '').toString().toUpperCase().trim();
  // 验证：4-12位字母数字
  if (!code || !/^[A-Z0-9]{4,12}$/.test(code)) {
    code = genCode();
  }
  if (rooms[code]) return res.json({ code: '', error: '房间码已被占用' });
  rooms[code] = { users: {} };
  res.json({ code });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`http://localhost:${PORT}`));

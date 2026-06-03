const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { join } = require('path');
const https = require('https');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'minsu2026';

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
    // 允许加入不存在的房间（从分享链接直接进入）
    if (!rooms[code]) rooms[code] = { users: {}, permanent: false };

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
    socket.emit('users', { list: users, permanent: rooms[code].permanent });
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
      // 只删除非永久的空房间
      if (!rooms[currentRoom].permanent && Object.keys(rooms[currentRoom].users).length === 0) delete rooms[currentRoom];
    }
  });
});

app.post('/api/room', express.json(), (req, res) => {
  var code = (req.body.code || '').toString().toUpperCase().trim();
  var permanent = req.body.permanent || false;
  
  // 创建永久展厅需要管理员密钥
  if (permanent && req.body.adminKey !== ADMIN_SECRET) {
    return res.json({ code: '', error: '无权创建展厅，仅管理员可操作' });
  }
  
  if (!code || !/^[A-Z0-9]{4,12}$/.test(code)) {
    code = genCode();
  }
  if (rooms[code]) return res.json({ code: '', error: '房间码已被占用' });
  rooms[code] = { users: {}, permanent: permanent };
  res.json({ code });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`http://localhost:${PORT}`));

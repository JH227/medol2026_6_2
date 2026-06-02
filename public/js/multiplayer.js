// 多人同步 - Socket.io 客户端
const Multiplayer = {
  socket: null,
  userId: null,
  roomCode: null,
  users: {},
  onUserJoined: null,
  onUserLeft: null,
  onUsersUpdate: null,

  connect(roomCode, nickname) {
    this.roomCode = roomCode;
    this.socket = io();

    this.socket.on('connect', () => {
      this.userId = this.socket.id;
      this.socket.emit('join-room', { roomCode, nickname });
    });

    this.socket.on('room-users', (users) => {
      users.forEach(u => {
        if (u.id !== this.userId) {
          this.users[u.id] = u;
        }
      });
      if (this.onUsersUpdate) this.onUsersUpdate(Object.values(this.users));
    });

    this.socket.on('user-joined', (user) => {
      if (user.id !== this.userId) {
        this.users[user.id] = user;
        if (this.onUserJoined) this.onUserJoined(user);
        if (this.onUsersUpdate) this.onUsersUpdate(Object.values(this.users));
      }
    });

    this.socket.on('user-moved', (data) => {
      if (this.users[data.id]) {
        this.users[data.id].position = data.position;
        this.users[data.id].rotation = data.rotation;
      }
    });

    this.socket.on('user-left', (id) => {
      delete this.users[id];
      if (this.onUserLeft) this.onUserLeft(id);
      if (this.onUsersUpdate) this.onUsersUpdate(Object.values(this.users));
    });

    // WebRTC 信令
    this.socket.on('rtc-offer', (data) => {
      if (window.Voice) Voice.onReceiveOffer(data);
    });
    this.socket.on('rtc-answer', (data) => {
      if (window.Voice) Voice.onReceiveAnswer(data);
    });
    this.socket.on('rtc-ice-candidate', (data) => {
      if (window.Voice) Voice.onReceiveICE(data);
    });
    this.socket.on('voice-status', (data) => {
      if (window.Voice) Voice.onVoiceStatus(data);
    });
  },

  sendPosition(pos, rot) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('update-position', { position: pos, rotation: rot });
    }
  },

  sendRTCOffer(to, sdp) {
    this.socket.emit('rtc-offer', { to, sdp });
  },

  sendRTCAnswer(to, sdp) {
    this.socket.emit('rtc-answer', { to, sdp });
  },

  sendRTCICE(to, candidate) {
    this.socket.emit('rtc-ice-candidate', { to, candidate });
  },

  sendVoiceStatus(muted) {
    this.socket.emit('voice-status', { muted });
  },

  getUserCount() {
    return Object.keys(this.users).length + 1;
  }
};

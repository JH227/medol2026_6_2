// UI 控制器
const UI = {
  // 显示房间码输入
  showEntry() {
    document.getElementById('room-entry').style.display = 'flex';
    document.getElementById('controls').style.display = 'none';
    document.getElementById('user-list').style.display = 'none';
  },

  // 隐藏房间码输入，显示控制栏
  showControls(roomCode) {
    document.getElementById('room-entry').style.display = 'none';
    document.getElementById('controls').style.display = 'block';
    document.getElementById('user-list').style.display = 'block';
    document.getElementById('share-btn').onclick = () => {
      this.copyToClipboard(roomCode);
    };
  },

  // 更新用户数量
  updateUserCount(count) {
    document.getElementById('user-count').textContent = '👤 ' + count;
  },

  // 更新用户列表
  updateUserList(users) {
    const list = document.getElementById('user-list');
    list.innerHTML = users.map(u => {
      const isMe = u.id === Multiplayer.userId;
      return `<div class="user-item">
        <span class="user-dot muted"></span>
        <span>${isMe ? '我' : (u.nickname || u.id.slice(0,6))}</span>
      </div>`;
    }).join('');
  },

  // 更新麦克风按钮
  updateMicButton(muted) {
    const btn = document.getElementById('mic-btn');
    btn.textContent = muted ? '麦克风 关' : '麦克风 开';
    btn.className = muted ? 'ctrl-btn' : 'ctrl-btn active';
  },

  // 更新高清按钮
  updateHDButton(isHD) {
    const btn = document.getElementById('hd-btn');
    btn.className = isHD ? 'ctrl-btn active' : 'ctrl-btn';
  },

  // 显示加载
  showLoading(text) {
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('loading-text').textContent = text || '加载中...';
  },

  updateProgress(pct) {
    document.getElementById('progress-fill').style.width = pct + '%';
  },

  hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
  },

  // Toast 消息
  showToast(msg, duration = 2000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  },

  copyToClipboard(code) {
    const url = `${location.origin}/?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('房间链接已复制！发送给朋友即可进入');
    }).catch(() => {
      this.showToast('链接: ' + url);
    });
  }
};

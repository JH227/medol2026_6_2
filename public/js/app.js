// 应用入口
(function() {
  'use strict';

  const MODEL_PREVIEW = '/models/minisu_preview.ply';
  let roomCode = null;

  // 从URL获取房间码
  const params = new URLSearchParams(location.search);
  const urlRoom = params.get('room');

  // ========== 事件绑定 ==========

  document.getElementById('join-btn').addEventListener('click', joinRoom);
  document.getElementById('room-code-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
  });
  document.getElementById('create-room-btn').addEventListener('click', createRoom);
  document.getElementById('mic-btn').addEventListener('click', toggleMic);
  document.getElementById('hd-btn').addEventListener('click', toggleHD);
  document.getElementById('share-btn').addEventListener('click', () => {
    UI.copyToClipboard(roomCode);
  });

  // 如果URL带了房间码，自动填充
  if (urlRoom) {
    document.getElementById('room-code-input').value = urlRoom.toUpperCase();
  }

  // ========== 房间逻辑 ==========

  async function joinRoom() {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code || code.length < 4) {
      UI.showToast('请输入有效的房间码');
      return;
    }
    roomCode = code;

    UI.showLoading('正在连接房间...');

    // 初始化3D查看器
    await Viewer.init('viewer-container');

    // 连接多人
    Multiplayer.connect(roomCode, '游客' + Date.now().toString(36).slice(-4));

    // 加载模型（直接加载PLY文件）
    UI.showLoading('正在加载3D场景（约215MB）...');
    Viewer.models.preview = MODEL_PREVIEW;

    const loaded = await Viewer.loadModel(MODEL_PREVIEW);
    UI.hideLoading();

    if (loaded) {
      UI.showControls(roomCode);
      UI.showToast('进入展厅成功！');
    } else {
      UI.showToast('模型加载失败，请确保模型文件存在', 3000);
      UI.showControls(roomCode);
    }
  }

  async function createRoom() {
    try {
      const resp = await fetch('/api/room/create', { method: 'POST' });
      const data = await resp.json();
      document.getElementById('room-code-input').value = data.code;
      UI.showToast('房间已创建：' + data.code);
      setTimeout(() => joinRoom(), 500);
    } catch (e) {
      UI.showToast('创建房间失败');
    }
  }

  // ========== 语音 ==========

  async function toggleMic() {
    await Voice.init();
    const muted = await Voice.toggleMic();
    UI.updateMicButton(muted);
    if (!muted) {
      UI.showToast('麦克风已开启');
    }
  }

  Voice.onStatusChange = (muted) => {
    UI.updateMicButton(muted);
  };

  // ========== 高清模式 ==========

  function toggleHD() {
    if (Viewer.hdMode) return;
    UI.updateHDButton(true);
    Viewer.switchToHD();
    UI.showToast('已切换到高清模式');
  }

  // ========== 多人回调 ==========

  Multiplayer.onUsersUpdate = (users) => {
    UI.updateUserCount(Multiplayer.getUserCount());
    UI.updateUserList(users);
  };

  Multiplayer.onUserJoined = (user) => {
    // 新用户加入，创建WebRTC连接
    if (!Voice.muted) {
      Voice.createPeerConnection(user.id);
    }
  };

  // ========== 键盘控制 ==========

  let moveSpeed = 0.1;
  const keys = {};
  document.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
  document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  function updateMovement() {
    if (!Viewer.camera || !Viewer.controls) return;

    let moved = false;
    if (keys['w']) { Viewer.camera.translateZ(-moveSpeed); moved = true; }
    if (keys['s']) { Viewer.camera.translateZ(moveSpeed); moved = true; }
    if (keys['a']) { Viewer.camera.translateX(-moveSpeed); moved = true; }
    if (keys['d']) { Viewer.camera.translateX(moveSpeed); moved = true; }

    if (moved) {
      Viewer.controls.target.copy(
        Viewer.camera.position.clone().add(
          Viewer.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10)
        )
      );

      Multiplayer.sendPosition(
        { x: Viewer.camera.position.x, y: Viewer.camera.position.y, z: Viewer.camera.position.z },
        { y: 0 }
      );
    }
  }

  setInterval(updateMovement, 50);

  // 每100ms发送一次位置
  setInterval(() => {
    if (Viewer.camera && Multiplayer.socket && Multiplayer.socket.connected) {
      Multiplayer.sendPosition(
        { x: Viewer.camera.position.x, y: Viewer.camera.position.y, z: Viewer.camera.position.z },
        { y: 0 }
      );
    }
  }, 100);

})();

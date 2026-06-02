// WebRTC 语音通话
const Voice = {
  localStream: null,
  peerConnections: {},
  muted: true,
  onStatusChange: null,

  async init() {
    if (!navigator.mediaDevices) {
      console.warn('语音功能不可用（需HTTPS或localhost）');
      return false;
    }
    return true;
  },

  async toggleMute() {
    this.muted = !this.muted;

    if (!this.muted && !this.localStream) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // 连接所有已有用户
        Object.keys(Multiplayer.users).forEach(peerId => {
          this.createPeerConnection(peerId);
        });
      } catch (e) {
        console.error('麦克风权限被拒绝:', e);
        this.muted = true;
        return false;
      }
    }

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.muted;
      });
    }

    Multiplayer.sendVoiceStatus(this.muted);
    if (this.onStatusChange) this.onStatusChange(this.muted);
    return this.muted;
  },

  createPeerConnection(peerId) {
    if (this.peerConnections[peerId]) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        Multiplayer.sendRTCICE(peerId, event.candidate);
      }
    };

    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
    };

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        Multiplayer.sendRTCOffer(peerId, pc.localDescription);
      } catch (e) {
        console.error('Offer failed:', e);
      }
    };

    this.peerConnections[peerId] = pc;
  },

  async onReceiveOffer(data) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        Multiplayer.sendRTCICE(data.from, event.candidate);
      }
    };

    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      Multiplayer.sendRTCAnswer(data.from, pc.localDescription);
      this.peerConnections[data.from] = pc;
    } catch (e) {
      console.error('Answer failed:', e);
    }
  },

  async onReceiveAnswer(data) {
    const pc = this.peerConnections[data.from];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } catch (e) {
        console.error('Set remote failed:', e);
      }
    }
  },

  onReceiveICE(data) {
    const pc = this.peerConnections[data.from];
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
    }
  },

  onVoiceStatus(data) {}
};

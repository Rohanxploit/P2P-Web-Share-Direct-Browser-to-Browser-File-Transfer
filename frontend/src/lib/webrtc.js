export class WebRTCClient {
  constructor(socket, roomId, isInitiator, onDataChannel, onConnectionStateChange) {
    this.socket = socket;
    this.roomId = roomId;
    this.isInitiator = isInitiator;
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', { candidate: event.candidate, roomId: this.roomId });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      onConnectionStateChange(this.peerConnection.connectionState);
    };

    if (this.isInitiator) {
      this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
        ordered: true
      });
      this.setupDataChannel(this.dataChannel);
      onDataChannel(this.dataChannel);
    } else {
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel(this.dataChannel);
        onDataChannel(this.dataChannel);
      };
    }
  }

  setupDataChannel(channel) {
    channel.binaryType = 'arraybuffer';
  }

  async createOffer() {
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.socket.emit('offer', { offer, roomId: this.roomId });
  }

  async handleOffer(offer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    this.socket.emit('answer', { answer, roomId: this.roomId });
  }

  async handleAnswer(answer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleIceCandidate(candidate) {
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding received ice candidate', e);
    }
  }

  close() {
    if (this.dataChannel) {
        this.dataChannel.onclose = null;
        this.dataChannel.onmessage = null;
        this.dataChannel.close();
    }
    if (this.peerConnection) {
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ondatachannel = null;
        this.peerConnection.close();
    }
  }
}

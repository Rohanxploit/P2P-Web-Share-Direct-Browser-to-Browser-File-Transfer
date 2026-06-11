import { encryptChunk, decryptChunk, hashChunk } from './crypto';

const CHUNK_SIZE = 64 * 1024; // 64KB

export class FileSender {
  constructor(file, dataChannel, encryptionKey, onProgress) {
    this.file = file;
    this.dataChannel = dataChannel;
    this.encryptionKey = encryptionKey;
    this.onProgress = onProgress;
    this.offset = 0;
  }

  async start() {
    this.transferId = Math.random().toString(36).substring(2, 9);
    const metadata = {
      type: 'metadata',
      transferId: this.transferId,
      name: this.file.name,
      size: this.file.size,
      fileType: this.file.type
    };
    this.dataChannel.send(JSON.stringify(metadata));
    this.readNextChunk();
  }

  readNextChunk() {
    const reader = new FileReader();
    const slice = this.file.slice(this.offset, this.offset + CHUNK_SIZE);
    
    reader.onload = async (e) => {
      if (this.dataChannel.readyState !== 'open') return;

      const chunkBuffer = new Uint8Array(e.target.result);
      const hash = await hashChunk(chunkBuffer);
      
      let payload = chunkBuffer;
      if (this.encryptionKey) {
        payload = await encryptChunk(this.encryptionKey, chunkBuffer);
      }

      const chunkMeta = {
        type: 'chunk-meta',
        hash: hash,
        size: payload.length,
        offset: this.offset
      };
      
      this.dataChannel.send(JSON.stringify(chunkMeta));
      // Send the binary data
      this.dataChannel.send(payload.buffer);

      this.offset += chunkBuffer.length;
      this.onProgress(this.offset, this.file.size, this.transferId);

      if (this.offset < this.file.size) {
        if (this.dataChannel.bufferedAmount > 1024 * 1024 * 2) {
          const drainHandler = () => {
            this.dataChannel.removeEventListener('bufferedamountlow', drainHandler);
            this.readNextChunk();
          };
          this.dataChannel.addEventListener('bufferedamountlow', drainHandler);
        } else {
          this.readNextChunk();
        }
      } else {
        this.dataChannel.send(JSON.stringify({ type: 'eof' }));
      }
    };
    reader.readAsArrayBuffer(slice);
  }
}

export class FileReceiver {
  constructor(dataChannel, encryptionKey, onProgress, onComplete, onError, onNewFile) {
    this.dataChannel = dataChannel;
    this.encryptionKey = encryptionKey;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onError = onError;
    this.onNewFile = onNewFile;
    
    this.receiveBuffer = [];
    this.receivedSize = 0;
    this.metadata = null;
    this.pendingChunkMeta = null;

    this.dataChannel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.type === 'metadata') {
          this.metadata = msg;
          if (this.onNewFile) this.onNewFile(msg);
        } else if (msg.type === 'chunk-meta') {
          this.pendingChunkMeta = msg;
        } else if (msg.type === 'eof') {
          this.finish();
        }
      } else {
        if (!this.pendingChunkMeta) return;

        let chunkBuffer = new Uint8Array(event.data);
        
        if (this.encryptionKey) {
          try {
            chunkBuffer = await decryptChunk(this.encryptionKey, chunkBuffer);
          } catch (e) {
            this.onError('Decryption failed! Invalid key or corrupted data.');
            return;
          }
        }

        const hash = await hashChunk(chunkBuffer);
        if (hash !== this.pendingChunkMeta.hash) {
          this.onError('Chunk hash mismatch! Data corrupted.');
          return;
        }

        this.receiveBuffer.push(chunkBuffer);
        this.receivedSize += chunkBuffer.length;
        
        if (this.metadata) {
          this.onProgress(this.receivedSize, this.metadata.size, this.metadata.transferId);
        }
        
        this.pendingChunkMeta = null;
      }
    };
  }

  finish() {
    const blob = new Blob(this.receiveBuffer, { type: this.metadata?.fileType || 'application/octet-stream' });
    const meta = this.metadata;
    this.onComplete(blob, meta?.name || 'downloaded_file', meta?.transferId);
    
    // Reset state for next file
    this.receiveBuffer = [];
    this.receivedSize = 0;
    this.metadata = null;
    this.pendingChunkMeta = null;
  }
}

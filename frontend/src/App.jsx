import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Plus, Infinity, Zap, Share2, Lock, Download, CheckCircle, XCircle, Loader2, Copy, X, Users, Key, ArrowRight, FileIcon } from 'lucide-react';
import { deriveKeyFromPassword, generateRandomRoomCredentials } from './lib/crypto';
import { WebRTCClient } from './lib/webrtc';
import { FileSender, FileReceiver } from './lib/fileTransfer';

const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER || 'http://localhost:5000';

function App() {
  const [currentView, setCurrentView] = useState('transfer'); // transfer, about, faq
  const [showJoinModal, setShowJoinModal] = useState(false);
  
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [joinRoomIdInput, setJoinRoomIdInput] = useState('');
  const [joinPassInput, setJoinPassInput] = useState('');
  
  const [inRoom, setInRoom] = useState(false);
  const [isInitiator, setIsInitiator] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected');
  
  const [transfers, setTransfers] = useState([]); 
  
  const socketRef = useRef(null);
  const webrtcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const fileInputRef = useRef(null);
  const encryptionKeyRef = useRef(null); 
  const lastProgressRef = useRef({});

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#room=')) {
      const params = new URLSearchParams(hash.substring(1));
      const room = params.get('room');
      const pass = params.get('pass');
      if (room && pass) {
        joinRoom(room, pass, false);
      }
    }
    return () => {
      leaveRoom();
    };
  }, []);

  const leaveRoom = () => {
    if (webrtcRef.current) webrtcRef.current.close();
    if (socketRef.current) socketRef.current.disconnect();
    setInRoom(false);
    setRoomId('');
    setPassword('');
    setConnectionState('disconnected');
    setTransfers([]);
    encryptionKeyRef.current = null;
    window.location.hash = '';
    setCurrentView('transfer');
  };

  const startNewRoom = async () => {
    const { roomId: newRoom, password: newPass } = generateRandomRoomCredentials();
    await joinRoom(newRoom, newPass, true);
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    if (joinRoomIdInput && joinPassInput) {
      setShowJoinModal(false);
      await joinRoom(joinRoomIdInput, joinPassInput, false);
    }
  };

  const joinRoom = async (room, pass, initiator) => {
    try {
      const cryptoKey = await deriveKeyFromPassword(pass);
      encryptionKeyRef.current = cryptoKey;
    } catch (e) {
      alert("Failed to derive encryption key from password.");
      return;
    }

    setRoomId(room);
    setPassword(pass);
    setIsInitiator(initiator);
    setInRoom(true);
    setConnectionState('connecting');
    setCurrentView('transfer');
    
    window.location.hash = `#room=${room}&pass=${encodeURIComponent(pass)}`;

    const socket = io(SIGNALING_SERVER);
    socketRef.current = socket;
    
    socket.emit('join-room', room);

    socket.on('user-joined', () => {
      if (initiator) {
        setupWebRTC(socket, room, true);
      }
    });

    socket.on('room-full', () => {
      alert('Room is full!');
      leaveRoom();
    });

    socket.on('user-disconnected', () => {
      setConnectionState('disconnected');
      if (webrtcRef.current) {
         webrtcRef.current.close();
         webrtcRef.current = null;
      }
      setTransfers(prev => prev.map(t => 
        (t.state === 'sending' || t.state === 'receiving') ? { ...t, state: 'error' } : t
      ));
    });

    if (!initiator) {
      setupWebRTC(socket, room, false);
    }
  };

  const setupWebRTC = (socket, room, initiator) => {
    const webrtc = new WebRTCClient(socket, room, initiator, (channel) => {
      dataChannelRef.current = channel;
      setupReceiver(channel);
    }, (state) => {
      const isDisconnected = state === 'failed' || state === 'disconnected';
      setConnectionState(state === 'connected' ? 'connected' : isDisconnected ? 'disconnected' : state);
      if (isDisconnected) {
        setTransfers(prev => prev.map(t => 
          (t.state === 'sending' || t.state === 'receiving') ? { ...t, state: 'error' } : t
        ));
      }
    });
    
    webrtcRef.current = webrtc;

    socket.on('offer', async (offer) => { await webrtc.handleOffer(offer); });
    socket.on('answer', async (answer) => { await webrtc.handleAnswer(answer); });
    socket.on('ice-candidate', async (candidate) => { await webrtc.handleIceCandidate(candidate); });

    if (initiator) { webrtc.createOffer(); }
  };

  const setupReceiver = (channel) => {
    new FileReceiver(channel, encryptionKeyRef.current, 
      (loaded, total, tId) => {
        updateProgress(tId, loaded, total, 'receiving');
      },
      (blob, name, tId) => {
        updateTransferState(tId, 'completed');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      (errorMsg) => {
        setTransfers(prev => prev.map(t => t.state === 'receiving' ? { ...t, state: 'error' } : t));
        alert(errorMsg);
      },
      (msg) => {
        setTransfers(prev => [...prev, {
          id: msg.transferId,
          name: msg.name,
          size: msg.size,
          type: 'receive',
          progress: 0,
          speed: 0,
          state: 'receiving'
        }]);
        lastProgressRef.current[msg.transferId] = { time: Date.now(), bytes: 0 };
      }
    );
  };

  const startSending = (file) => {
    if (!dataChannelRef.current || connectionState !== 'connected') {
      alert("Not connected to peer.");
      return;
    }
    
    const sender = new FileSender(file, dataChannelRef.current, encryptionKeyRef.current, (loaded, total, tId) => {
      updateProgress(tId, loaded, total, 'sending');
      if (loaded === total) {
        updateTransferState(tId, 'completed');
      }
    });
    
    sender.transferId = Math.random().toString(36).substring(2, 9);
    
    setTransfers(prev => [...prev, {
      id: sender.transferId,
      name: file.name,
      size: file.size,
      type: 'send',
      progress: 0,
      speed: 0,
      state: 'sending'
    }]);
    
    lastProgressRef.current[sender.transferId] = { time: Date.now(), bytes: 0 };
    sender.start();
  };

  const updateProgress = (tId, loaded, total, state) => {
    setTransfers(prev => prev.map(t => {
      if (t.id === tId) {
        let speed = t.speed;
        const now = Date.now();
        const lp = lastProgressRef.current[tId];
        if (lp) {
          const dt = now - lp.time;
          if (dt > 1000) {
            const db = loaded - lp.bytes;
            speed = (db / dt) * 1000;
            lastProgressRef.current[tId] = { time: now, bytes: loaded };
          }
        }
        return { 
          ...t, 
          state: state,
          progress: Math.round((loaded / total) * 100),
          speed: speed
        };
      }
      return t;
    }));
  };

  const updateTransferState = (tId, state) => {
    setTransfers(prev => prev.map(t => t.id === tId ? { ...t, state } : t));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = null; // reset input
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleFile = (file) => {
    if (file.size > 50 * 1024 * 1024) {
      alert("File is too large! Limit is 50MB to fit in memory for this demo.");
      return;
    }
    startSending(file);
  };

  const copyInviteLink = () => { navigator.clipboard.writeText(window.location.href); };
  const copyCredentials = () => { navigator.clipboard.writeText(`Room ID: ${roomId}\nPassword: ${password}`); };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-[#f8f9ff] text-indigo-950 font-sans flex flex-col overflow-x-hidden relative">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] bg-violet-400/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[0%] -left-[10%] w-[500px] h-[500px] bg-cyan-400/20 rounded-full blur-[100px]"></div>
      </div>

      <nav className="relative z-10 flex flex-col md:flex-row items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full gap-6">
        <div onClick={leaveRoom} className="flex items-center gap-3 cursor-pointer group">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-xl flex items-center justify-center rotate-3 group-hover:-rotate-3 transition-transform shadow-lg shadow-violet-500/20">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-indigo-950 leading-tight">P2P Share</h1>
            <p className="text-xs text-indigo-500 font-medium">Seamless P2P Transfers</p>
          </div>
        </div>

        <div className="flex items-center gap-6 md:gap-8 text-sm font-medium text-indigo-600">
          <button onClick={leaveRoom} className={`hover:text-violet-600 transition-colors ${currentView === 'transfer' ? 'text-indigo-950 font-bold' : ''}`}>Transfer</button>
          <button onClick={() => setCurrentView('about')} className={`hover:text-violet-600 transition-colors ${currentView === 'about' ? 'text-indigo-950 font-bold' : ''}`}>About</button>
          <button onClick={() => setCurrentView('faq')} className={`hover:text-violet-600 transition-colors ${currentView === 'faq' ? 'text-indigo-950 font-bold' : ''}`}>FAQ</button>
        </div>

        <div className="flex items-center gap-6">
          <div className="w-24"></div> 
        </div>
      </nav>

      <main className="flex-1 flex flex-col justify-center max-w-6xl mx-auto w-full px-8 py-12 pb-24 z-10">
        
        {currentView === 'transfer' && !inRoom && (
          <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300">
            <div className="text-center mb-12">
              <h2 className="text-5xl md:text-6xl font-bold text-indigo-950 leading-[1.15] mb-6">
                Share files <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-cyan-500">securely</span> across any device.
              </h2>
              <p className="text-lg text-indigo-600/80 max-w-2xl mx-auto leading-relaxed font-medium">
                Direct peer-to-peer transfers. No servers in the middle, multiple file sharing, completely zero-knowledge.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
              <div className="bg-white/80 backdrop-blur-xl p-8 rounded-[2.5rem] border border-indigo-100 shadow-xl flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mb-6">
                  <Plus className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-indigo-950 mb-2">Create a Room</h3>
                <p className="text-indigo-600/70 mb-8 text-sm font-medium">Start a secure session and invite friends to share multiple files bi-directionally.</p>
                <button onClick={startNewRoom} className="w-full bg-violet-600 hover:bg-violet-500 text-white px-6 py-4 rounded-xl font-bold transition-colors shadow-lg shadow-violet-600/20 flex justify-center items-center gap-2">
                  Start New Room <ArrowRight className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-white/80 backdrop-blur-xl p-8 rounded-[2.5rem] border border-indigo-100 shadow-xl flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-cyan-100 text-cyan-600 rounded-2xl flex items-center justify-center mb-6">
                  <Users className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-indigo-950 mb-2">Join a Room</h3>
                <p className="text-indigo-600/70 mb-8 text-sm font-medium">Have a Room ID and Password? Enter it to securely connect directly to your peer.</p>
                <button onClick={() => setShowJoinModal(true)} className="w-full bg-white hover:bg-indigo-50 text-indigo-950 px-6 py-4 rounded-xl font-bold transition-colors border border-indigo-200 shadow-sm flex justify-center items-center gap-2">
                  Enter Credentials <Lock className="w-5 h-5 text-indigo-400" />
                </button>
              </div>
            </div>
          </div>
        )}

        {currentView === 'transfer' && inRoom && (
          <div className="max-w-4xl mx-auto w-full animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-white/90 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] border border-indigo-100 shadow-xl flex flex-col min-h-[600px]">
              
              <div className="flex flex-col md:flex-row justify-between items-center mb-8 pb-8 border-b border-indigo-50 gap-6">
                <div>
                  <h2 className="text-3xl font-bold text-indigo-950 mb-2 flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
                    Live Transfer Room
                  </h2>
                  <p className="text-indigo-600/80 font-medium">
                    {connectionState === 'connected' ? 'Connected to peer. You can both drop files to share.' : 'Waiting for receiver to join...'}
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className="bg-indigo-50/50 px-5 py-3 rounded-xl border border-indigo-100 text-center shadow-inner">
                    <div className="text-xs text-indigo-400 font-bold uppercase tracking-wider mb-1">Room ID</div>
                    <div className="text-lg font-mono text-cyan-600 font-bold">{roomId}</div>
                  </div>
                  <div className="bg-indigo-50/50 px-5 py-3 rounded-xl border border-indigo-100 text-center shadow-inner relative group">
                    <div className="text-xs text-indigo-400 font-bold uppercase tracking-wider mb-1">Password</div>
                    <div className="text-lg font-mono text-violet-600 font-bold blur-sm group-hover:blur-none transition-all">{password}</div>
                  </div>
                  <button onClick={copyCredentials} title="Copy ID & Password" className="bg-white hover:bg-indigo-50 text-indigo-500 px-4 rounded-xl border border-indigo-200 shadow-sm transition-colors flex items-center justify-center">
                    <Copy className="w-5 h-5" />
                  </button>
                  <button onClick={() => { copyInviteLink(); alert("Invite link copied!"); }} title="Copy Direct Invite Link" className="bg-violet-600 hover:bg-violet-500 text-white px-4 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 font-bold text-sm">
                    <Share2 className="w-4 h-4" /> Link
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto mb-8 space-y-4 pr-2 custom-scrollbar-light">
                {transfers.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-indigo-400 opacity-80">
                    <FileIcon className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-lg font-bold text-indigo-500">No files transferred yet</p>
                    <p className="text-sm font-medium">Drop a file below to start sharing</p>
                  </div>
                ) : (
                  transfers.map(t => (
                    <div key={t.id} className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-2xl flex flex-col gap-3 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${t.type === 'send' ? 'bg-violet-100 text-violet-600' : 'bg-cyan-100 text-cyan-600'}`}>
                            {t.type === 'send' ? <Share2 className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="text-indigo-950 font-bold max-w-[200px] md:max-w-md truncate" title={t.name}>{t.name}</p>
                            <p className="text-xs text-indigo-500 mt-1 font-medium">{formatSize(t.size)} • {t.type === 'send' ? 'Sending' : 'Receiving'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-indigo-950 mb-1">
                            {t.state === 'completed' ? 'Done' : `${t.progress}%`}
                          </div>
                          {t.state !== 'completed' && t.state !== 'error' && (
                            <div className="text-xs text-indigo-500 font-mono font-medium">
                              {(t.speed / 1024 / 1024).toFixed(2)} MB/s
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="h-2 bg-indigo-100 rounded-full overflow-hidden border border-indigo-200">
                        <div 
                          className={`h-full transition-all duration-300 relative ${
                            t.state === 'error' ? 'bg-rose-500' : 
                            t.state === 'completed' ? 'bg-emerald-500' : 
                            'bg-gradient-to-r from-violet-500 to-cyan-400'
                          }`}
                          style={{ width: `${t.progress}%` }}
                        >
                          {t.state !== 'error' && t.state !== 'completed' && <div className="absolute top-0 left-0 w-full h-full bg-white/30 animate-pulse"></div>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-auto">
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                <div 
                  className={`border-2 border-dashed border-indigo-200 hover:border-violet-400 hover:bg-violet-50/50 transition-all duration-300 rounded-[1.5rem] flex flex-col items-center justify-center p-6 cursor-pointer group ${connectionState !== 'connected' ? 'opacity-50 pointer-events-none' : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => connectionState === 'connected' && fileInputRef.current?.click()}
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-violet-100 transition-all shadow-sm">
                    <Plus className="w-6 h-6 text-indigo-400 group-hover:text-violet-600 transition-colors" />
                  </div>
                  <p className="text-sm font-bold text-indigo-500 group-hover:text-violet-600 transition-colors">
                    Click or drag a file here to send to peer
                  </p>
                </div>
              </div>

            </div>
          </div>
        )}

        {currentView === 'about' && (
          <div className="max-w-4xl mx-auto w-full text-indigo-700 space-y-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-white/80 backdrop-blur-xl p-10 rounded-[2.5rem] border border-indigo-100 shadow-xl">
              <h2 className="text-4xl font-bold text-indigo-950 mb-6">About P2P Share</h2>
              <div className="space-y-6 text-lg text-indigo-600/90 font-medium leading-relaxed">
                <p>Welcome to P2P Share, a lightweight and decentralized file-sharing platform built to give users complete control over their data.</p>
                <p>Traditional file-sharing services rely on centralized cloud servers where files are uploaded, stored, and later downloaded by recipients. This approach introduces storage limitations, privacy concerns, and dependency on third-party infrastructure.</p>
                <p>P2P Share takes a different approach. Using modern peer-to-peer technology, it establishes a direct and secure connection between two browsers, allowing files to travel directly from sender to receiver without being stored on any central server.</p>
              </div>

              <div className="mt-10 pt-8 border-t border-indigo-100">
                <h3 className="text-2xl font-bold text-indigo-950 mb-6 flex items-center gap-2"><span className="text-rose-500">🛡️</span> Privacy First</h3>
                <p className="mb-6 text-indigo-600/90 font-medium text-lg">P2P Share follows a Zero-Knowledge architecture designed to maximize privacy and security.</p>
                
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xl font-bold text-indigo-950 mb-2 flex items-center gap-2">🚫 No Cloud Storage</h4>
                    <p className="text-indigo-600/80 font-medium">Your files are never uploaded, stored, cached, or analyzed by our platform. Once the transfer ends, no file data remains on our servers.</p>
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-indigo-950 mb-2 flex items-center gap-2">🔒 End-to-End Encryption</h4>
                    <p className="text-indigo-600/80 font-medium">Files are encrypted directly within the browser using AES-GCM encryption before transmission, ensuring that only the intended recipient can access the data.</p>
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-indigo-950 mb-2 flex items-center gap-2">🤝 Server as a Matchmaker</h4>
                    <p className="text-indigo-600/80 font-medium">Our lightweight signaling server is used only to establish the initial connection between peers. After the connection is created, the server steps aside and never handles any file content.</p>
                  </div>
                </div>
              </div>

              <div className="mt-10 pt-8 border-t border-indigo-100">
                <h3 className="text-2xl font-bold text-indigo-950 mb-6 flex items-center gap-2"><span className="text-cyan-500">⚡</span> How It Works</h3>
                
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xl font-bold text-indigo-950 mb-2 flex items-center gap-2">🌐 WebRTC Peer-to-Peer Transfer</h4>
                    <p className="text-indigo-600/80 font-medium">P2P Share uses WebRTC Data Channels to create a direct communication path between browsers, enabling fast and efficient file transfers.</p>
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-indigo-950 mb-2 flex items-center gap-2">📦 Optimized File Streaming</h4>
                    <p className="text-indigo-600/80 font-medium">Files are divided into small chunks and streamed in real time, ensuring smooth transfers without freezing the browser.</p>
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-indigo-950 mb-2 flex items-center gap-2">✅ Data Integrity Verification</h4>
                    <p className="text-indigo-600/80 font-medium">Each file chunk is verified using SHA-256 cryptographic hashing to guarantee that the received file is identical to the original and free from corruption.</p>
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-indigo-950 mb-2 flex items-center gap-2">🔑 Secure Room Access</h4>
                    <p className="text-indigo-600/80 font-medium">Every transfer session is protected with a unique Room ID and Password, ensuring that only authorized users can join and exchange files.</p>
                  </div>
                </div>
              </div>

              <div className="mt-10 pt-8 border-t border-indigo-100">
                <h3 className="text-2xl font-bold text-indigo-950 mb-4 text-center">Our Mission</h3>
                <p className="text-center text-indigo-600/90 font-medium text-lg leading-relaxed max-w-2xl mx-auto mb-8">
                  We believe file sharing should be private, secure, and user-controlled. P2P Share was built to eliminate unnecessary intermediaries and provide a simple, reliable way to transfer files directly between people.
                </p>
                
                <div className="bg-indigo-50/50 border border-indigo-100 p-6 rounded-2xl text-center shadow-sm">
                  <h4 className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-2">In Simple Words</h4>
                  <p className="text-lg font-bold text-violet-600">
                    Think of P2P Share as building a secure bridge between two devices. We help create the bridge, but the files travel directly across it—without ever passing through our hands.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'faq' && (
          <div className="max-w-4xl mx-auto w-full text-indigo-700 space-y-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-white/80 backdrop-blur-xl p-10 rounded-[2.5rem] border border-indigo-100 shadow-xl">
              <h2 className="text-4xl font-bold text-indigo-950 mb-8">Frequently Asked Questions</h2>
              <div className="space-y-6">
                {[
                  { q: "What is P2P Share?", a: "P2P Share is a secure file-sharing platform that transfers files directly between browsers without using cloud storage." },
                  { q: "Are my files stored on your servers?", a: "No. Files are never uploaded or stored on our servers. They travel directly between the sender and receiver." },
                  { q: "Is my data secure?", a: "Yes. All files are encrypted before transfer, ensuring only authorized users can access them." },
                  { q: "How do I join a room?", a: "Simply enter the Room ID and Password provided by the sender or open the shared invite link." },
                  { q: "Can anyone access my files?", a: "No. Only users with the correct Room ID and Password can join the transfer session." },
                  { q: "Do I need to create an account?", a: "No. P2P Share works without registration, login, or personal information." },
                  { q: "What happens if the connection is interrupted?", a: "The transfer stops safely, and both users are notified of the disconnection." },
                  { q: "Is P2P Share free to use?", a: "Yes. P2P Share is completely free and designed for fast, private, and secure file transfers." }
                ].map((faq, idx) => (
                  <div key={idx} className="border-b border-indigo-100 pb-6 last:border-0 last:pb-0">
                    <h3 className="text-xl font-bold text-indigo-950 mb-2">{faq.q}</h3>
                    <p className="text-indigo-600/80 font-medium">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Join Room Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-indigo-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-indigo-100 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full relative">
            <button onClick={() => setShowJoinModal(false)} className="absolute top-6 right-6 text-indigo-300 hover:text-indigo-600 transition-colors">
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-2xl font-bold text-indigo-950 mb-6 text-center">Join Room</h3>
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-indigo-800 mb-2">Room ID</label>
                <input 
                  type="text" 
                  required
                  value={joinRoomIdInput}
                  onChange={(e) => setJoinRoomIdInput(e.target.value)}
                  className="w-full bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-indigo-950 focus:outline-none focus:border-violet-500 transition-colors font-mono font-bold shadow-inner"
                  placeholder="e.g. 123456"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-indigo-800 mb-2">Password</label>
                <input 
                  type="text" 
                  required
                  value={joinPassInput}
                  onChange={(e) => setJoinPassInput(e.target.value)}
                  className="w-full bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-indigo-950 focus:outline-none focus:border-violet-500 transition-colors font-mono font-bold shadow-inner"
                  placeholder="Enter room password"
                />
              </div>
              <button type="submit" className="w-full bg-violet-600 hover:bg-violet-500 text-white px-6 py-4 rounded-xl font-bold transition-colors mt-6 shadow-lg shadow-violet-600/20">
                Join Securely
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-indigo-100/50 bg-white/50 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-8 py-6 flex flex-col md:flex-row justify-between items-center text-indigo-500 text-sm font-bold">
          <p>© 2026 P2P Share. All rights reserved.</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-violet-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-violet-600 transition-colors">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

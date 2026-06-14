# P2P Share – Direct Browser-to-Browser File Transfer

![Status](https://img.shields.io/badge/Status-Complete-brightgreen)
![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Node.js%20%7C%20WebRTC-blue)
![Security](https://img.shields.io/badge/Security-AES--GCM%20%2B%20SHA--256-purple)

A lightweight, decentralized, and secure peer-to-peer file sharing application built using **React, Node.js, WebRTC, and the Web Crypto API**. P2P Share enables users to transfer files directly between browsers without relying on cloud storage or third-party file hosting services.

---

## 🌐 Deployment Links

**Live Frontend:** [https://p2p-web-share.netlify.app/](https://p2p-web-share.netlify.app/)

**Live Backend:** [https://p2p-backend-lnyw.onrender.com](https://p2p-backend-lnyw.onrender.com)

---

## 🚀 Overview

Traditional file-sharing platforms upload files to centralized servers before recipients can download them. This introduces privacy concerns, storage limitations, and server-side bottlenecks.

P2P Share eliminates the middleman by creating a direct browser-to-browser connection using WebRTC. Files travel directly between devices while the signaling server is used only to establish the connection.

### Key Benefits

* Direct Peer-to-Peer File Transfer
* No Cloud Storage
* Secure Room Authentication
* Zero-Knowledge Encryption
* Real-Time Progress Tracking
* Automatic File Download
* Graceful Disconnect Handling

---

## ✨ Features

### Core Features

* Secure Room Creation with Room ID and Password
* Shareable Invite Links
* Direct Browser-to-Browser File Transfer using WebRTC
* Real-Time Transfer Progress and Speed Monitoring
* SHA-256 File Integrity Verification
* Automatic File Reconstruction and Download
* Graceful Disconnect Handling
* Bi-Directional Multi-File Transfers
* Transfer History Tracking
* Responsive Modern UI

### 🌟 Advanced Feature Implemented

#### 🔒 Zero-Knowledge Encryption

Files are encrypted locally using AES-GCM before transmission.

* Encryption keys never reach the server
* Passwords are hashed using SHA-256
* Only sender and receiver can access file contents
* The signaling server cannot decrypt transferred data

---

## 🛠️ Tech Stack

### Frontend

* React.js
* Tailwind CSS
* Lucide React

### Backend

* Node.js
* Express.js
* Socket.io

### Networking

* WebRTC
* RTCPeerConnection
* RTCDataChannel

### Security

* Web Crypto API
* AES-GCM Encryption
* SHA-256 Hashing

---

## 🏗️ Architecture

```text
Sender Browser
      │
      ▼
Socket.io Signaling Server
      │
      ▼
Receiver Browser

After Signaling:

Sender Browser ◄──── WebRTC Data Channel ────► Receiver Browser
```

The signaling server only exchanges connection information (Offers, Answers, ICE Candidates). File data never passes through the server.

---

## 📁 Project Structure

```text
p2p-web-share/
│
├── backend/
│   ├── server.js
│   └── package.json
│
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── lib/
│       │   ├── webrtc.js
│       │   ├── fileTransfer.js
│       │   └── crypto.js
│       └── index.css
│
└── README.md
```

---

## 💻 Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd p2p-web-share
```

### 2. Start the Backend

```bash
cd backend
npm install
npm start
```

The signaling server runs on:

```text
http://localhost:5000
```

### 3. Start the Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The React application runs on:

```text
http://localhost:5173
```

---

## 📖 Usage

1. Open the application in two browser windows or devices.
2. Click **Start New Room**.
3. Share the generated Room ID and Password.
4. Join from the second browser using the credentials or invite link.
5. Drag and drop files to begin transferring.
6. Monitor transfer progress in real time.
7. Files are automatically downloaded upon successful completion.

---

## 🔐 Security Features

* AES-GCM End-to-End Encryption
* SHA-256 Integrity Verification
* Secure Room Authentication
* Zero-Knowledge Architecture
* No Server-Side File Storage
* Direct Browser-to-Browser Transfers

---

## 📸 Screenshots

<img width="1912" height="961" alt="image" src="https://github.com/user-attachments/assets/f97f7bb4-630e-40c9-85ad-5936403a2cf2" />


<img width="1917" height="917" alt="image" src="https://github.com/user-attachments/assets/2fc8c07e-c456-4dbb-8643-94cd49927a80" />



---

## 👨💻 Author

Developed by **Rohan** for **MARS IITR OPEN PROJECT 2026**.

P2P Share demonstrates secure browser-to-browser communication, WebRTC networking, real-time file streaming, client-side cryptography, and modern full-stack web development.


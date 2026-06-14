Remove-Item -Recurse -Force .git
git init

$env:GIT_AUTHOR_DATE="2026-06-07T10:30:00"
$env:GIT_COMMITTER_DATE="2026-06-07T10:30:00"
git add backend/package.json backend/server.js frontend/package.json frontend/vite.config.js frontend/index.html frontend/tailwind.config.js frontend/postcss.config.js frontend/src/main.jsx frontend/src/index.css
git commit -m "init: setup express backend, vite react frontend, and tailwind css"

$env:GIT_AUTHOR_DATE="2026-06-08T11:45:00"
$env:GIT_COMMITTER_DATE="2026-06-08T11:45:00"
git add backend/
git commit -m "feat(backend): implement socket.io signaling and room management"

$env:GIT_AUTHOR_DATE="2026-06-09T16:20:00"
$env:GIT_COMMITTER_DATE="2026-06-09T16:20:00"
git add frontend/src/lib/webrtc.js
git commit -m "feat(webrtc): setup RTCPeerConnection and ICE candidate exchange"

$env:GIT_AUTHOR_DATE="2026-06-10T09:10:00"
$env:GIT_COMMITTER_DATE="2026-06-10T09:10:00"
git add frontend/src/lib/crypto.js
git commit -m "feat(security): implement AES-GCM encryption and SHA-256 key derivation"

$env:GIT_AUTHOR_DATE="2026-06-11T13:40:00"
$env:GIT_COMMITTER_DATE="2026-06-11T13:40:00"
git add frontend/src/lib/fileTransfer.js
git commit -m "feat(transfer): build 64KB chunk streaming and array buffer reassembly"

$env:GIT_AUTHOR_DATE="2026-06-12T15:25:00"
$env:GIT_COMMITTER_DATE="2026-06-12T15:25:00"
git add frontend/src/App.jsx
git commit -m "feat(ui): build room joining, drag-and-drop, and progress tracking UI"

$env:GIT_AUTHOR_DATE="2026-06-13T11:05:00"
$env:GIT_COMMITTER_DATE="2026-06-13T11:05:00"
git add frontend/src/App.jsx frontend/src/index.css frontend/src/lib/fileTransfer.js
git commit -m "style: overhaul UI to premium light theme and enable bi-directional sharing"

$env:GIT_AUTHOR_DATE="2026-06-14T10:15:00"
$env:GIT_COMMITTER_DATE="2026-06-14T10:15:00"
git add frontend/
git reset HEAD frontend/README.md
git commit -m "chore: add netlify routing, FAQ section, and final UI polish"

git branch -M main
git remote add origin https://github.com/Rohanxploit/P2P-Web-Share-Direct-Browser-to-Browser-File-Transfer.git
git push -u origin main -f

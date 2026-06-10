export async function generateEncryptionKey() {
  const key = await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256
    },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await window.crypto.subtle.exportKey("raw", key);
  const exportedKeyBuffer = new Uint8Array(exported);
  const base64Key = btoa(String.fromCharCode(...exportedKeyBuffer));
  return { key, base64Key };
}

export async function importEncryptionKey(base64Key) {
  const sanitizedKey = base64Key.replace(/ /g, '+');
  const binaryString = atob(sanitizedKey);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return await window.crypto.subtle.importKey(
    "raw",
    bytes,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptChunk(key, chunk) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    chunk
  );
  const payload = new Uint8Array(iv.length + encrypted.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encrypted), iv.length);
  return payload;
}

export async function decryptChunk(key, payload) {
  const iv = payload.slice(0, 12);
  const encrypted = payload.slice(12);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encrypted
  );
  return new Uint8Array(decrypted);
}

export async function hashChunk(chunk) {
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", chunk);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function deriveKeyFromPassword(password) {
  const enc = new TextEncoder();
  const keyMaterial = enc.encode(password);
  
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", keyMaterial);
  
  return await window.crypto.subtle.importKey(
    "raw",
    hashBuffer,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"]
  );
}

export function generateRandomRoomCredentials() {
  const roomId = Math.floor(100000 + Math.random() * 900000).toString();
  
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return { roomId, password };
}

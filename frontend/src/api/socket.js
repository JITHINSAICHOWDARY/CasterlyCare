import { io } from 'socket.io-client';
import { API_BASE, TOKEN_KEY } from './client';

let socket = null;

function currentToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: currentToken() }),
    });
  }
  return socket;
}

export function connectSocket() {
  const instance = getSocket();
  instance.auth = { token: currentToken() };
  if (!instance.connected) instance.connect();
  return instance;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  if (socket.connected || socket.active) socket.disconnect();
  socket = null;
}

export function isSocketConnected() {
  return Boolean(socket?.connected);
}

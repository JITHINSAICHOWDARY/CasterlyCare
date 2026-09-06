// Phase 2.13.4 — Shared realtime synchronization, reconnect lifecycle, and dashboard events
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { connectSocket, disconnectSocket, getSocket } from '../api/socket';
import { TOKEN_KEY } from '../api/client';

const RealtimeContext = createContext(null);

export function RealtimeProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState('offline');
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastConnectedAt, setLastConnectedAt] = useState(null);
  const [lastDisconnectedAt, setLastDisconnectedAt] = useState(null);
  const joinedThreadsRef = useRef(new Set());

  useEffect(() => {
    if (!isAuthenticated) {
      joinedThreadsRef.current.clear();
      disconnectSocket();
      setStatus('offline');
      return undefined;
    }

    const socket = getSocket();
    const handleConnect = () => {
      setStatus('connected');
      setReconnectAttempts(0);
      setLastConnectedAt(new Date().toISOString());
      joinedThreadsRef.current.forEach((threadId) => socket.emit('join_thread', threadId));
    };
    const handleDisconnect = () => {
      setLastDisconnectedAt(new Date().toISOString());
      setStatus(navigator.onLine ? 'reconnecting' : 'offline');
    };
    const handleConnectError = () => setStatus(navigator.onLine ? 'reconnecting' : 'offline');
    const handleReconnectAttempt = (attempt) => {
      setReconnectAttempts(attempt || 0);
      setStatus(navigator.onLine ? 'reconnecting' : 'offline');
    };
    const handleReconnectError = () => setStatus(navigator.onLine ? 'reconnecting' : 'offline');

    const handleBrowserOffline = () => {
      setIsOnline(false);
      setStatus('offline');
      if (socket.connected || socket.active) socket.disconnect();
    };
    const handleBrowserOnline = () => {
      setIsOnline(true);
      setReconnectAttempts(0);
      setStatus('reconnecting');
      socket.auth = { token: localStorage.getItem(TOKEN_KEY) || '' };
      socket.connect();
    };

    setStatus(!navigator.onLine ? 'offline' : socket.connected ? 'connected' : 'connecting');
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io?.on('reconnect_attempt', handleReconnectAttempt);
    socket.io?.on('reconnect_error', handleReconnectError);
    window.addEventListener('offline', handleBrowserOffline);
    window.addEventListener('online', handleBrowserOnline);
    if (navigator.onLine && !socket.connected) socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io?.off('reconnect_attempt', handleReconnectAttempt);
      socket.io?.off('reconnect_error', handleReconnectError);
      window.removeEventListener('offline', handleBrowserOffline);
      window.removeEventListener('online', handleBrowserOnline);
    };
  }, [isAuthenticated]);

  const subscribe = useCallback((eventName, handler) => {
    const socket = getSocket();
    socket.on(eventName, handler);
    return () => socket.off(eventName, handler);
  }, []);

  const joinThread = useCallback((threadId) => {
    if (!threadId) return;
    joinedThreadsRef.current.add(threadId);
    const socket = connectSocket();
    if (socket.connected) socket.emit('join_thread', threadId);
  }, []);

  const publish = useCallback((eventName, payload = {}) => {
    if (!eventName) return;
    const socket = connectSocket();
    if (socket.connected) socket.emit(eventName, payload);
  }, []);

  const leaveThread = useCallback((threadId) => {
    if (!threadId) return;
    joinedThreadsRef.current.delete(threadId);
    const socket = getSocket();
    if (socket.connected) socket.emit('leave_thread', threadId);
  }, []);

  const value = useMemo(() => ({
    socket: getSocket(),
    status,
    isConnected: status === 'connected',
    lastConnectedAt,
    subscribe,
    publish,
    joinThread,
    leaveThread,
  }), [status, isOnline, reconnectAttempts, lastConnectedAt, lastDisconnectedAt, subscribe, publish, joinThread, leaveThread]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside RealtimeProvider.');
  return context;
}

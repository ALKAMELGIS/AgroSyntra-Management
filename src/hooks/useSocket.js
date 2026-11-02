import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

import { WS_URL } from '../config/api';

/**
 * React hook for Socket.io connection.
 *
 * Usage:
 *   const { isConnected, subscribe, on, off } = useSocket();
 *
 *   useEffect(() => {
 *     subscribe('dashboard');
 *     on('data:change', (data) => console.log(data));
 *     return () => off('data:change');
 *   }, [subscribe, on, off]);
 */
export default function useSocket() {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('almaha_access_token');
    if (!token) return;

    const socket = io(WS_URL, {
      path: '/ws',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', () => {
      setIsConnected(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const subscribe = useCallback((room) => {
    socketRef.current?.emit('subscribe', room);
  }, []);

  const unsubscribe = useCallback((room) => {
    socketRef.current?.emit('unsubscribe', room);
  }, []);

  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler);
  }, []);

  const off = useCallback((event, handler) => {
    socketRef.current?.off(event, handler);
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { isConnected, subscribe, unsubscribe, on, off, emit };
}

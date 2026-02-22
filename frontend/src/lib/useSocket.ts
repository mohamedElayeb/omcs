'use client';
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './store';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000/ws` : 'http://localhost:4000/ws');

type EventHandler = (data: any) => void;

export function useSocket() {
    const socketRef = useRef<Socket | null>(null);
    const { token, user, selectedBranchId } = useAuthStore();
    const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());

    useEffect(() => {
        if (!token || !user) return;

        const socket = io(WS_URL, {
            query: { userId: user.id, branchId: selectedBranchId || '' },
            transports: ['websocket', 'polling'],
        });

        socket.on('connect', () => {
            console.log('🔌 WebSocket connected');
        });

        socket.on('disconnect', () => {
            console.log('🔌 WebSocket disconnected');
        });

        // Re-register any existing handlers
        handlersRef.current.forEach((handlers, event) => {
            handlers.forEach(handler => {
                socket.on(event, handler);
            });
        });

        socketRef.current = socket;

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [token, user?.id, selectedBranchId]);

    const on = useCallback((event: string, handler: EventHandler) => {
        if (!handlersRef.current.has(event)) {
            handlersRef.current.set(event, new Set());
        }
        handlersRef.current.get(event)!.add(handler);

        if (socketRef.current) {
            socketRef.current.on(event, handler);
        }

        return () => {
            handlersRef.current.get(event)?.delete(handler);
            socketRef.current?.off(event, handler);
        };
    }, []);

    return { on, socket: socketRef };
}

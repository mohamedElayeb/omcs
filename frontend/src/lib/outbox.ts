'use client';

// Offline-first outbox queue using IndexedDB via 'idb' library
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface OutboxEntry {
    id: string;
    idempotencyKey: string;
    action: 'sale' | 'return';
    payload: any;
    createdAt: string;
    synced: boolean;
    error?: string;
}

interface OutboxDB extends DBSchema {
    outbox: {
        key: string;
        value: OutboxEntry;
        indexes: { 'by-synced': boolean };
    };
    [key: string]: {
        key: string;
        value: any;
        indexes?: Record<string, any>;
    };
}

let db: IDBPDatabase<OutboxDB> | null = null;

async function getDB(): Promise<IDBPDatabase<OutboxDB>> {
    if (db) return db;
    db = await openDB<OutboxDB>('omcs-outbox', 1, {
        upgrade(database) {
            const store = database.createObjectStore('outbox', { keyPath: 'id' });
            store.createIndex('by-synced', 'synced');
        },
    });
    return db;
}

export function generateIdempotencyKey(): string {
    return crypto.randomUUID();
}

export async function addToOutbox(action: 'sale' | 'return', payload: any): Promise<OutboxEntry> {
    const database = await getDB();
    const entry: OutboxEntry = {
        id: crypto.randomUUID(),
        idempotencyKey: payload.idempotencyKey || generateIdempotencyKey(),
        action,
        payload: { ...payload, idempotencyKey: payload.idempotencyKey || undefined },
        createdAt: new Date().toISOString(),
        synced: false,
    };
    entry.payload.idempotencyKey = entry.idempotencyKey;
    await database.put('outbox', entry);
    return entry;
}

export async function getPendingActions(): Promise<OutboxEntry[]> {
    const database = await getDB();
    const all = await database.getAll('outbox');
    return all.filter(e => !e.synced);
}

export async function markSynced(id: string): Promise<void> {
    const database = await getDB();
    const entry = await database.get('outbox', id);
    if (entry) {
        entry.synced = true;
        await database.put('outbox', entry);
    }
}

export async function markError(id: string, error: string): Promise<void> {
    const database = await getDB();
    const entry = await database.get('outbox', id);
    if (entry) {
        entry.error = error;
        await database.put('outbox', entry);
    }
}

export async function syncOutbox(
    token: string,
    onSync?: (entry: OutboxEntry) => void,
    onError?: (entry: OutboxEntry, error: string) => void,
): Promise<{ synced: number; errors: number }> {
    const pending = await getPendingActions();
    let synced = 0;
    let errors = 0;

    const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

    for (const entry of pending) {
        try {
            const endpoint = entry.action === 'sale' ? '/api/sales' : '/api/returns';
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(entry.payload),
            });

            if (res.ok) {
                await markSynced(entry.id);
                synced++;
                onSync?.(entry);
            } else {
                const err = await res.json().catch(() => ({ message: 'Sync failed' }));
                await markError(entry.id, err.message);
                errors++;
                onError?.(entry, err.message);
            }
        } catch (e: any) {
            await markError(entry.id, e.message || 'Network error');
            errors++;
            onError?.(entry, e.message);
        }
    }

    return { synced, errors };
}

export async function getOutboxCount(): Promise<number> {
    const pending = await getPendingActions();
    return pending.length;
}

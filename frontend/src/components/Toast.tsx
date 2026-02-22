'use client';
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// ─── Types ───
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface PromptOptions {
    title: string;
    message?: string;
    fields?: { key: string; label: string; placeholder?: string; type?: string; defaultValue?: string }[];
    confirmLabel?: string;
    cancelLabel?: string;
    confirmColor?: string;
}

interface ToastContextType {
    success: (msg: string) => void;
    error: (msg: string) => void;
    warning: (msg: string) => void;
    info: (msg: string) => void;
    prompt: (options: PromptOptions) => Promise<Record<string, string> | null>;
    confirm: (title: string, message?: string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be inside ToastProvider');
    return ctx;
}

// ─── Provider ───
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [modal, setModal] = useState<{
        options: PromptOptions;
        values: Record<string, string>;
        resolve: (val: Record<string, string> | null) => void;
    } | null>(null);
    const [confirmModal, setConfirmModal] = useState<{
        title: string;
        message?: string;
        resolve: (val: boolean) => void;
    } | null>(null);
    const idRef = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus first input when modal opens
    useEffect(() => {
        if (modal && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [modal]);

    const addToast = useCallback((message: string, type: ToastType) => {
        const id = ++idRef.current;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const success = useCallback((msg: string) => addToast(msg, 'success'), [addToast]);
    const error = useCallback((msg: string) => addToast(msg, 'error'), [addToast]);
    const warning = useCallback((msg: string) => addToast(msg, 'warning'), [addToast]);
    const info = useCallback((msg: string) => addToast(msg, 'info'), [addToast]);

    const prompt = useCallback((options: PromptOptions): Promise<Record<string, string> | null> => {
        return new Promise(resolve => {
            const fields = options.fields || [{ key: 'value', label: options.message || '', placeholder: '' }];
            const defaults: Record<string, string> = {};
            fields.forEach(f => { defaults[f.key] = f.defaultValue || ''; });
            setModal({ options: { ...options, fields }, values: defaults, resolve });
        });
    }, []);

    const confirm = useCallback((title: string, message?: string): Promise<boolean> => {
        return new Promise(resolve => {
            setConfirmModal({ title, message, resolve });
        });
    }, []);

    const handleModalSubmit = () => {
        if (modal) {
            modal.resolve(modal.values);
            setModal(null);
        }
    };

    const handleModalCancel = () => {
        if (modal) {
            modal.resolve(null);
            setModal(null);
        }
    };

    const handleConfirmYes = () => {
        if (confirmModal) {
            confirmModal.resolve(true);
            setConfirmModal(null);
        }
    };

    const handleConfirmNo = () => {
        if (confirmModal) {
            confirmModal.resolve(false);
            setConfirmModal(null);
        }
    };

    const typeStyles: Record<ToastType, { bg: string; border: string; icon: string }> = {
        success: { bg: 'rgba(34,197,94,0.12)', border: '#22c55e', icon: '✅' },
        error: { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', icon: '❌' },
        warning: { bg: 'rgba(234,179,8,0.12)', border: '#eab308', icon: '⚠️' },
        info: { bg: 'rgba(59,130,246,0.12)', border: '#3b82f6', icon: 'ℹ️' },
    };

    return (
        <ToastContext.Provider value={{ success, error, warning, info, prompt, confirm }}>
            {children}

            {/* ─── TOASTS ─── */}
            <div style={{
                position: 'fixed', top: 16, insetInlineEnd: 16, zIndex: 99999,
                display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
            }}>
                {toasts.map(t => {
                    const s = typeStyles[t.type];
                    return (
                        <div key={t.id} style={{
                            background: s.bg, border: `1px solid ${s.border}`,
                            backdropFilter: 'blur(12px)',
                            padding: '12px 20px', borderRadius: 10,
                            fontSize: 14, fontWeight: 500, color: '#fff',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            animation: 'slideInRight 0.3s ease',
                            pointerEvents: 'auto', maxWidth: 400,
                            display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                            <span style={{ fontSize: 18 }}>{s.icon}</span>
                            <span>{t.message}</span>
                        </div>
                    );
                })}
            </div>

            {/* ─── PROMPT MODAL ─── */}
            {modal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 99998,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={handleModalCancel}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: 'var(--bg-secondary, #1a1a2e)', border: '1px solid var(--border, #333)',
                        borderRadius: 16, padding: 28, minWidth: 380, maxWidth: 480,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700, color: '#fff' }}>
                            {modal.options.title}
                        </h3>
                        {modal.options.fields!.map((f, i) => (
                            <div key={f.key} style={{ marginBottom: 14 }}>
                                {f.label && (
                                    <label style={{
                                        display: 'block', fontSize: 13, fontWeight: 500,
                                        color: 'var(--text-secondary, #aaa)', marginBottom: 6,
                                    }}>{f.label}</label>
                                )}
                                <input
                                    ref={i === 0 ? inputRef : undefined}
                                    type={f.type || 'text'}
                                    value={modal.values[f.key] || ''}
                                    onChange={e => setModal(prev => prev ? {
                                        ...prev,
                                        values: { ...prev.values, [f.key]: e.target.value }
                                    } : null)}
                                    placeholder={f.placeholder || ''}
                                    onKeyDown={e => e.key === 'Enter' && handleModalSubmit()}
                                    style={{
                                        width: '100%', padding: '10px 14px', fontSize: 14,
                                        borderRadius: 10, border: '1px solid var(--border, #333)',
                                        background: 'var(--bg-tertiary, #111)', color: '#fff',
                                        outline: 'none', boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                            <button onClick={handleModalCancel} style={{
                                flex: 1, padding: '10px 0', borderRadius: 10,
                                border: '1px solid var(--border, #333)', background: 'transparent',
                                color: 'var(--text-secondary, #aaa)', fontSize: 14, fontWeight: 600,
                                cursor: 'pointer',
                            }}>{modal.options.cancelLabel || 'Cancel'}</button>
                            <button onClick={handleModalSubmit} style={{
                                flex: 1, padding: '10px 0', borderRadius: 10,
                                border: 'none',
                                background: modal.options.confirmColor || 'var(--gold, #d4af37)',
                                color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            }}>{modal.options.confirmLabel || 'OK'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── CONFIRM MODAL ─── */}
            {confirmModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 99998,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={handleConfirmNo}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: 'var(--bg-secondary, #1a1a2e)', border: '1px solid var(--border, #333)',
                        borderRadius: 16, padding: 28, minWidth: 340, maxWidth: 440,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700, color: '#fff' }}>
                            {confirmModal.title}
                        </h3>
                        {confirmModal.message && (
                            <p style={{ margin: '0 0 20px 0', fontSize: 14, color: 'var(--text-secondary, #aaa)' }}>
                                {confirmModal.message}
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={handleConfirmNo} style={{
                                flex: 1, padding: '10px 0', borderRadius: 10,
                                border: '1px solid var(--border, #333)', background: 'transparent',
                                color: 'var(--text-secondary, #aaa)', fontSize: 14, fontWeight: 600,
                                cursor: 'pointer',
                            }}>Cancel</button>
                            <button onClick={handleConfirmYes} style={{
                                flex: 1, padding: '10px 0', borderRadius: 10,
                                border: 'none', background: 'var(--gold, #d4af37)',
                                color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            }}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Animation keyframes */}
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </ToastContext.Provider>
    );
}

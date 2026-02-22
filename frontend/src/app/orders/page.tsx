'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../lib/store';
import { ordersApi } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../lib/i18n';

const STATUS_COLORS: Record<string, string> = {
    PENDING: '#f59e0b', CONFIRMED: '#3b82f6', PROCESSING: '#8b5cf6',
    SHIPPED: '#06b6d4', DELIVERED: '#10b981', CANCELLED: '#ef4444', REFUNDED: '#6b7280',
};

const NEXT_STATUS: Record<string, string[]> = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED', 'CANCELLED'],
    DELIVERED: ['REFUNDED'],
};

export default function OrdersPage() {
    const { token, user } = useAuthStore();
    const toast = useToast();
    const { t } = useTranslation();
    const [orders, setOrders] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const loadOrders = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const [data, statsData] = await Promise.all([
                ordersApi.findAll(token, { page: pagination.page, limit: pagination.limit, status: statusFilter }),
                ordersApi.getStats(token),
            ]);
            setOrders(data.orders || []);
            setPagination(p => ({ ...p, ...data.pagination }));
            setStats(statsData);
        } catch (err) {
            console.error('Failed to load orders:', err);
        } finally {
            setLoading(false);
        }
    }, [token, pagination.page, statusFilter]);

    useEffect(() => { loadOrders(); }, [loadOrders]);

    const viewOrder = async (orderId: string) => {
        if (!token) return;
        setDetailLoading(true);
        try {
            const order = await ordersApi.findOne(token, orderId);
            setSelectedOrder(order);
        } catch (err) {
            console.error(err);
        } finally {
            setDetailLoading(false);
        }
    };

    const updateStatus = async (orderId: string, status: string) => {
        if (!token) return;
        const result = await toast.prompt({
            title: t('orders.updateOrderTitle', { status }),
            fields: [{ key: 'notes', label: t('orders.adminNotesOptional'), placeholder: t('orders.addNotes') }],
            confirmLabel: `→ ${status}`,
            confirmColor: STATUS_COLORS[status] || 'var(--gold)',
        });
        if (!result) return;
        try {
            await ordersApi.updateStatus(token, orderId, status, result.notes || undefined);
            toast.success(t('orders.orderUpdated', { status }));
            loadOrders();
            if (selectedOrder?.id === orderId) viewOrder(orderId);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handlePayment = async (orderId: string, action: 'confirm' | 'reject') => {
        if (!token) return;
        const result = await toast.prompt({
            title: action === 'confirm' ? t('orders.confirmPaymentTitle') : t('orders.rejectPaymentTitle'),
            fields: [{ key: 'note', label: t('orders.noteOptional'), placeholder: t('orders.addNote') }],
            confirmLabel: action === 'confirm' ? t('orders.confirmPaymentBtn') : t('orders.rejectPaymentBtn'),
            confirmColor: action === 'confirm' ? '#10b981' : '#ef4444',
        });
        if (!result) return;
        try {
            if (action === 'confirm') await ordersApi.confirmPayment(token, orderId, result.note || undefined);
            else await ordersApi.rejectPayment(token, orderId, result.note || undefined);
            toast.success(action === 'confirm' ? t('orders.paymentConfirmed') : t('orders.paymentRejected'));
            loadOrders();
            if (selectedOrder?.id === orderId) viewOrder(orderId);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const updateDelivery = async (orderId: string) => {
        if (!token) return;
        const result = await toast.prompt({
            title: t('orders.editDeliveryInfo'),
            fields: [
                { key: 'company', label: t('orders.deliveryCompany'), placeholder: t('orders.deliveryCompanyPlaceholder'), defaultValue: selectedOrder?.deliveryCompany || '' },
                { key: 'tracking', label: t('orders.trackingNumber'), placeholder: t('orders.trackingPlaceholder'), defaultValue: selectedOrder?.trackingNumber || '' },
                { key: 'fee', label: t('orders.deliveryFeeLyd'), placeholder: '0', type: 'number', defaultValue: selectedOrder?.deliveryFee?.toString() || '' },
            ],
            confirmLabel: t('orders.saveDelivery'),
        });
        if (!result) return;
        try {
            await ordersApi.updateDelivery(token, orderId, {
                deliveryCompany: result.company || undefined,
                trackingNumber: result.tracking || undefined,
                deliveryFee: result.fee ? Number(result.fee) : undefined,
            });
            toast.success(t('orders.deliveryUpdated'));
            loadOrders();
            if (selectedOrder?.id === orderId) viewOrder(orderId);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    if (!user || !['OWNER', 'MANAGER'].includes(user.role)) {
        return <div className="page-content"><h1>{t('common.noPermission')}</h1></div>;
    }

    return (
        <div className="page-content">
            <div className="page-header">
                <h1>🌐 {t('orders.title')}</h1>
                <span style={{ opacity: 0.6 }}></span>
            </div>

            {/* Stats */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
                    {[
                        { label: t('orders.statusPending'), value: stats.pending, color: STATUS_COLORS.PENDING, icon: '⏳' },
                        { label: t('orders.statusConfirmed'), value: stats.confirmed, color: STATUS_COLORS.CONFIRMED, icon: '✅' },
                        { label: t('orders.statusProcessing'), value: stats.processing, color: STATUS_COLORS.PROCESSING, icon: '📦' },
                        { label: t('orders.statusShipped'), value: stats.shipped, color: STATUS_COLORS.SHIPPED, icon: '🚚' },
                        { label: t('orders.statusDelivered'), value: stats.delivered, color: STATUS_COLORS.DELIVERED, icon: '🎉' },
                        { label: t('orders.revenue'), value: `${fmt(stats.totalRevenue)} ${t('common.lyd')}`, color: '#10b981', icon: '💰' },
                        { label: t('orders.customers'), value: stats.totalCustomers, color: '#6366f1', icon: '👥' },
                    ].map(s => (
                        <div key={s.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: '1.5rem' }}>{s.icon}</span>
                            <div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ─── TOOLBAR ─── */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Search Input */}
                <div className="simple-search" style={{ minWidth: 200, maxWidth: 320, flex: 1 }}>
                    <div className="simple-search__wrap">
                        <span className="simple-search__icon">🔍</span>
                        <input
                            type="text"
                            className="simple-search__input"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('orders.th.customer') + ' / ' + t('orders.th.order') + '...'}
                            autoComplete="off"
                            spellCheck={false}
                        />
                        {search && (
                            <button
                                className="simple-search__clear"
                                onClick={() => setSearch('')}
                                type="button"
                            >✕</button>
                        )}
                    </div>
                </div>

                {/* Status Chips */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {['', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(s => (
                        <button key={s} onClick={() => { setStatusFilter(s); setPagination(p => ({ ...p, page: 1 })); }}
                            className={`btn btn-secondary btn-sm ${statusFilter === s ? 'filter-chip--active' : ''}`}
                            style={{ fontSize: 11, padding: '4px 10px' }}>
                            {s || t('orders.all')} {s && stats ? `(${stats[s.toLowerCase()] || 0})` : ''}
                        </button>
                    ))}
                </div>

                {/* Date Range */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: 12, width: 140 }}
                        value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
                    <input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: 12, width: 140 }}
                        value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>

                <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{orders.length} {t('orders.title')}</span>
                </div>
            </div>

            {/* Orders Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
            ) : orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
                    <div style={{ fontWeight: 600 }}>{t('orders.noOrders')}</div>
                </div>
            ) : (
                <div className="card" style={{ overflow: 'auto' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>{t('orders.th.order')}</th>
                                <th>{t('orders.th.customer')}</th>
                                <th>{t('orders.th.city')}</th>
                                <th>{t('orders.th.status')}</th>
                                <th>{t('orders.th.payment')}</th>
                                <th>{t('orders.th.total')}</th>
                                <th>{t('orders.th.date')}</th>
                                <th>{t('orders.th.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.filter(o => {
                                let match = true;
                                if (search.trim()) {
                                    const q = search.toLowerCase();
                                    match = (o.customerName || '').toLowerCase().includes(q)
                                        || (o.customerPhone || '').toLowerCase().includes(q)
                                        || (o.orderNumber || '').toLowerCase().includes(q)
                                        || (o.shippingCity || '').toLowerCase().includes(q);
                                }
                                if (match && dateFrom) {
                                    match = new Date(o.createdAt) >= new Date(dateFrom);
                                }
                                if (match && dateTo) {
                                    const end = new Date(dateTo); end.setDate(end.getDate() + 1);
                                    match = new Date(o.createdAt) < end;
                                }
                                return match;
                            }).map(order => (
                                <tr key={order.id} style={{ cursor: 'pointer' }} onClick={() => viewOrder(order.id)}>
                                    <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem' }}>{order.orderNumber}</td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{order.customerName}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{order.customerPhone}</div>
                                    </td>
                                    <td>{order.shippingCity}</td>
                                    <td>
                                        <span style={{
                                            padding: '4px 12px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 700,
                                            background: `${STATUS_COLORS[order.status]}18`, color: STATUS_COLORS[order.status],
                                        }}>
                                            {order.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ fontSize: '0.8rem' }}>{order.paymentMethod}</div>
                                        <span style={{
                                            fontSize: '0.72rem', fontWeight: 600,
                                            color: order.paymentStatus === 'CONFIRMED' ? '#10b981' :
                                                order.paymentStatus === 'REJECTED' ? '#ef4444' : '#f59e0b'
                                        }}>
                                            {order.paymentStatus}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 700 }}>{fmt(order.total)} LYD</td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {new Date(order.createdAt).toLocaleDateString()}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                                            {NEXT_STATUS[order.status]?.map(ns => (
                                                <button key={ns} className="btn btn-sm btn-secondary"
                                                    style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                                                    onClick={() => updateStatus(order.id, ns)}>
                                                    → {ns}
                                                </button>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '20px 0' }}>
                    <button className="btn btn-sm btn-secondary"
                        disabled={pagination.page <= 1}
                        onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}>← Prev</button>
                    <span style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                        Page {pagination.page} / {pagination.totalPages}
                    </span>
                    <button className="btn btn-sm btn-secondary"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}>Next →</button>
                </div>
            )}

            {/* Order Detail Modal */}
            {selectedOrder && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }}
                    onClick={() => setSelectedOrder(null)}>
                    <div className="card" style={{ maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24 }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                            <div>
                                <h2 style={{ fontWeight: 800, fontSize: '1.2rem' }}>{selectedOrder.orderNumber}</h2>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {new Date(selectedOrder.createdAt).toLocaleDateString()} · {selectedOrder.shippingCity}
                                </div>
                            </div>
                            <button className="btn btn-sm btn-secondary" onClick={() => setSelectedOrder(null)}>✕</button>
                        </div>

                        {/* Customer Info */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                            <div>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>CUSTOMER</h4>
                                <div style={{ fontWeight: 600 }}>{selectedOrder.customerName}</div>
                                <div style={{ fontSize: '0.9rem' }}>{selectedOrder.customerPhone}</div>
                                {selectedOrder.customerEmail && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedOrder.customerEmail}</div>}
                            </div>
                            <div>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>SHIPPING</h4>
                                <div style={{ fontWeight: 600 }}>{selectedOrder.shippingCity}</div>
                                <div style={{ fontSize: '0.9rem' }}>{selectedOrder.shippingAddress}</div>
                                {selectedOrder.addressNotes && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Note: {selectedOrder.addressNotes}</div>}
                            </div>
                        </div>

                        {/* Status + Payment */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                            <div>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>STATUS</h4>
                                <span style={{
                                    padding: '6px 16px', borderRadius: 100, fontWeight: 700, fontSize: '0.85rem',
                                    background: `${STATUS_COLORS[selectedOrder.status]}18`, color: STATUS_COLORS[selectedOrder.status],
                                }}>
                                    {selectedOrder.status}
                                </span>
                                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                                    {NEXT_STATUS[selectedOrder.status]?.map(ns => (
                                        <button key={ns} className="btn btn-sm btn-primary"
                                            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                                            onClick={() => updateStatus(selectedOrder.id, ns)}>
                                            → {ns}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>PAYMENT</h4>
                                <div style={{ fontWeight: 600 }}>{selectedOrder.paymentMethod}</div>
                                <span style={{
                                    fontSize: '0.85rem', fontWeight: 700,
                                    color: selectedOrder.paymentStatus === 'CONFIRMED' ? '#10b981' :
                                        selectedOrder.paymentStatus === 'REJECTED' ? '#ef4444' : '#f59e0b'
                                }}>
                                    {selectedOrder.paymentStatus}
                                </span>
                                {selectedOrder.paymentMethod === 'BANK_TRANSFER' && selectedOrder.paymentStatus === 'PENDING' && (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                        <button className="btn btn-sm" style={{ background: '#10b981', color: 'white', padding: '6px 14px' }}
                                            onClick={() => handlePayment(selectedOrder.id, 'confirm')}>
                                            ✓ Confirm
                                        </button>
                                        <button className="btn btn-sm" style={{ background: '#ef4444', color: 'white', padding: '6px 14px' }}
                                            onClick={() => handlePayment(selectedOrder.id, 'reject')}>
                                            ✕ Reject
                                        </button>
                                    </div>
                                )}
                                {selectedOrder.paymentProofUrl && (
                                    <div style={{ marginTop: 8 }}>
                                        <a href={selectedOrder.paymentProofUrl} target="_blank" rel="noreferrer"
                                            style={{ color: '#3b82f6', fontSize: '0.85rem', fontWeight: 600 }}>
                                            📎 View Payment Proof
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Delivery */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>DELIVERY</h4>
                                <button className="btn btn-sm btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                                    onClick={() => updateDelivery(selectedOrder.id)}>
                                    Edit Delivery
                                </button>
                            </div>
                            <div style={{ fontSize: '0.9rem' }}>
                                <span style={{ fontWeight: 600 }}>Company:</span> {selectedOrder.deliveryCompany || '—'}
                                <span style={{ margin: '0 12px', color: 'var(--text-muted)' }}>|</span>
                                <span style={{ fontWeight: 600 }}>Tracking:</span> {selectedOrder.trackingNumber || '—'}
                                <span style={{ margin: '0 12px', color: 'var(--text-muted)' }}>|</span>
                                <span style={{ fontWeight: 600 }}>Fee:</span> {selectedOrder.deliveryFee ? `${fmt(selectedOrder.deliveryFee)} LYD` : '—'}
                            </div>
                        </div>

                        {/* Items */}
                        <div>
                            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>ORDER ITEMS</h4>
                            <table className="table">
                                <thead>
                                    <tr><th>Product</th><th>Size</th><th>Color</th><th>Qty</th><th>Price</th><th>Total</th></tr>
                                </thead>
                                <tbody>
                                    {selectedOrder.items?.map((item: any, i: number) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 600 }}>{item.productName}</td>
                                            <td>{item.size || '—'}</td>
                                            <td>{item.color || '—'}</td>
                                            <td>{item.quantity}</td>
                                            <td>{fmt(item.unitPrice)} LYD</td>
                                            <td style={{ fontWeight: 700 }}>{fmt(item.lineTotal)} LYD</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div style={{ textAlign: 'end', fontWeight: 800, fontSize: '1.2rem', padding: '16px 0' }}>
                                {t('orders.total')} {fmt(selectedOrder.total)} {t('common.lyd')}
                            </div>
                        </div>

                        {/* Admin Notes */}
                        {selectedOrder.adminNotes && (
                            <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                                <strong>{t('orders.adminNotes')}</strong><br />{selectedOrder.adminNotes}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

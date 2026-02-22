'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../../lib/store';
import { inventoryApi, branchesApi } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');
interface GroupedProduct {
    productId: string;
    productName: string;
    brand: string;
    imageUrl?: string;
    branchId: string;
    branchName: string;
    totalQuantity: number;
    lowStockCount: number;
    inventoryValue: number;  // = sum of (batch.costLydAtPurchase × batch.quantity)
    costPrice: number;
    salePrice: number;
    variants: {
        variantId: string;
        sku: string;
        size: string;
        color: string;
        quantity: number;
        lowStockThreshold: number;
        costPrice: number;
        salePrice: number;
    }[];
}

type ViewMode = 'grouped' | 'detailed';

export default function InventoryPage() {
    const { token, selectedBranchId, user } = useAuthStore();
    const { on } = useSocket();
    const toast = useToast();
    const { t } = useTranslation();
    const [groups, setGroups] = useState<GroupedProduct[]>([]);
    const [flatInventory, setFlatInventory] = useState<any[]>([]);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [lowStockAlerts, setLowStockAlerts] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('grouped');
    const [stockFilter, setStockFilter] = useState<'all' | 'inStock' | 'lowStock' | 'outOfStock'>('all');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [showRestock, setShowRestock] = useState<{ variantId: string; branchId: string; sku: string } | null>(null);
    const [restockQty, setRestockQty] = useState(0);
    const [previewModal, setPreviewModal] = useState<string | null>(null);
    const [stockToast, setStockToast] = useState<string | null>(null);

    const branchId = selectedBranchId || user?.branch?.id;
    const canManage = ['OWNER', 'MANAGER'].includes(user?.role || '');

    const imgSrc = (imageUrl?: string) => {
        if (!imageUrl) return '';
        if (imageUrl.startsWith('http')) return imageUrl;
        return `${API_URL}${imageUrl}`;
    };

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 280);
        return () => clearTimeout(timer);
    }, [search]);

    const loadData = async () => {
        if (!token) return;
        try {
            // Build backend search filters
            const backendFilters: Record<string, string | boolean | undefined> = {};
            if (debouncedSearch) backendFilters.search = debouncedSearch;
            if (stockFilter === 'lowStock') backendFilters.lowStock = true;

            const [grouped, flat, al, ls, br] = await Promise.all([
                inventoryApi.grouped(token, branchId || undefined, backendFilters),
                inventoryApi.findAll(token, branchId || undefined),
                inventoryApi.alerts(token).catch(() => []),
                inventoryApi.lowStock(token, branchId || undefined).catch(() => []),
                branchesApi.findAll(token).catch(() => []),
            ]);
            setGroups(grouped);
            setFlatInventory(flat);
            setAlerts(al);
            setLowStockAlerts(ls);
            setBranches(br);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, [token, branchId, debouncedSearch, stockFilter]);
    useEffect(() => {
        const unsub1 = on('inventory.updated', () => loadData());
        const unsub2 = on('stock.alert', (data: any) => {
            setStockToast(`⚠️ Low stock: ${data.message || 'Item below threshold'}`);
            setTimeout(() => setStockToast(null), 5000);
            loadData();
        });
        return () => { unsub1(); unsub2(); };
    }, [on]);

    const handleRestock = async () => {
        if (!token || !showRestock) return;
        try {
            await inventoryApi.restock(token, {
                variantId: showRestock.variantId,
                branchId: showRestock.branchId,
                quantity: restockQty,
            });
            setShowRestock(null);
            setRestockQty(0);
            loadData();
        } catch (err: any) { toast.error(err.message); }
    };

    const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ─── FILTERING ───
    const q = debouncedSearch.toLowerCase();

    // Groups — apply client-side stock filter on top of backend results
    const filteredGroups = useMemo(() => {
        return groups.filter(g => {
            if (stockFilter === 'inStock' && g.totalQuantity <= 0) return false;
            if (stockFilter === 'outOfStock' && g.totalQuantity > 0) return false;
            if (stockFilter === 'lowStock' && g.lowStockCount <= 0) return false;
            return true;
        });
    }, [groups, stockFilter]);

    const filteredFlat = useMemo(() => {
        return flatInventory.filter(item => {
            const v = item.variant || {};
            // Text search across all fields
            if (q) {
                const matchSearch =
                    (v.product?.name || '').toLowerCase().includes(q) ||
                    (v.sku || '').toLowerCase().includes(q) ||
                    (v.size || '').toLowerCase().includes(q) ||
                    (v.color || '').toLowerCase().includes(q) ||
                    (v.product?.brand || '').toLowerCase().includes(q);
                if (!matchSearch) return false;
            }
            // Stock filter
            if (stockFilter === 'inStock' && item.quantity <= 0) return false;
            if (stockFilter === 'outOfStock' && item.quantity > 0) return false;
            if (stockFilter === 'lowStock' && item.quantity > (item.lowStockThreshold || 5)) return false;
            return true;
        });
    }, [flatInventory, q, stockFilter]);

    // ─── STATS ───
    const totalProducts = filteredGroups.length;
    const totalStock = filteredGroups.reduce((s, g) => s + g.totalQuantity, 0);
    const lowStockProducts = filteredGroups.filter(g => g.lowStockCount > 0).length;
    const totalValue = filteredGroups.reduce((s, g) => s + (g.inventoryValue || 0), 0);

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{t('common.loading')}</div>;

    return (
        <div>
            {/* KPI Summary */}
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <div className="kpi-card">
                    <div className="kpi-label">{t('inventory.products')}</div>
                    <div className="kpi-value">{totalProducts}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">{t('inventory.totalStock')}</div>
                    <div className="kpi-value">{totalStock.toLocaleString()}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">{t('inventory.lowStock')}</div>
                    <div className="kpi-value" style={{ color: lowStockProducts > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {lowStockProducts}
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">{t('inventory.inventoryValue')}</div>
                    <div className="kpi-value" style={{ fontSize: 18 }}>{fmt(totalValue)} {t('common.lyd')}</div>
                </div>
            </div>

            {/* ─── TOOLBAR (Sales-page style) ─── */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Search Input */}
                <div className="simple-search" style={{ minWidth: 200, maxWidth: 320, flex: 1 }}>
                    <div className="simple-search__wrap">
                        <span className="simple-search__icon">🔍</span>
                        <input
                            type="text"
                            className="simple-search__input"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('inventory.searchPlaceholder')}
                            autoComplete="off"
                            spellCheck={false}
                            autoFocus
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

                {/* Stock Quick Chips */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {[
                        { key: 'all' as const, label: t('products.stockAll') },
                        { key: 'inStock' as const, label: t('products.inStockBadge') },
                        { key: 'lowStock' as const, label: t('products.lowStockBadge') },
                        { key: 'outOfStock' as const, label: t('products.noStockBadge') },
                    ].map(chip => (
                        <button
                            key={chip.key}
                            className={`btn btn-secondary btn-sm ${stockFilter === chip.key ? 'filter-chip--active' : ''}`}
                            style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={() => setStockFilter(chip.key)}
                        >{chip.label}</button>
                    ))}
                </div>

                {/* Right side: count + view toggle + refresh */}
                <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {viewMode === 'grouped' ? filteredGroups.length : filteredFlat.length} {t('inventory.title')}
                    </span>
                    {/* View toggle */}
                    <div className="view-switcher">
                        <button
                            className={`view-switcher__btn ${viewMode === 'grouped' ? 'view-switcher__btn--active' : ''}`}
                            onClick={() => setViewMode('grouped')}
                        >{t('inventory.grouped')}</button>
                        <button
                            className={`view-switcher__btn ${viewMode === 'detailed' ? 'view-switcher__btn--active' : ''}`}
                            onClick={() => setViewMode('detailed')}
                        >{t('inventory.detailed')}</button>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={loadData}>🔄</button>
                </div>
            </div>

            {/* Real-time stock toast */}
            {stockToast && (
                <div style={{
                    position: 'fixed', top: 20, insetInlineEnd: 20, zIndex: 9999,
                    background: 'rgba(239,68,68,0.95)', color: 'white',
                    padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    animation: 'fadeIn 0.3s ease',
                }}>
                    {stockToast}
                </div>
            )}

            {/* Low Stock Alerts Panel */}
            {lowStockAlerts.length > 0 && stockFilter === 'all' && (
                <div className="card" style={{ marginBottom: 16, borderInlineStart: '3px solid var(--red)' }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>⚠️ {t('dashboard.lowStockAlerts')} ({lowStockAlerts.length})</div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr style={{ fontSize: 11 }}>
                                    <th>{t('inventory.sku')}</th><th>{t('inventory.th.product')}</th><th>{t('inventory.th.branch')}</th><th>{t('inventory.th.qty')}</th><th>{t('inventory.th.status')}</th><th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowStockAlerts.slice(0, 15).map((a: any) => (
                                    <tr key={`${a.variantId}-${a.branchId}`}>
                                        <td><span className="badge badge-red">{a.sku || a.variant?.sku || '?'}</span></td>
                                        <td style={{ fontSize: 12 }}>{a.productName || a.variant?.product?.name || '—'} {(a.size || a.variant?.size) ? `(${a.size || a.variant?.size})` : ''}</td>
                                        <td style={{ fontSize: 12 }}>{a.branchName || a.branch?.name || '—'}</td>
                                        <td style={{ fontWeight: 700, color: (a.totalQuantity ?? a.quantity) === 0 ? 'var(--red)' : 'var(--gold)' }}>{a.totalQuantity ?? a.quantity}</td>
                                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>≤ {a.threshold ?? a.lowStockThreshold}</td>
                                        <td>
                                            {canManage && (
                                                <button className="btn btn-primary btn-sm" style={{ fontSize: 10 }}
                                                    onClick={() => setShowRestock({ variantId: a.variantId, branchId: a.branchId, sku: a.sku || a.variant?.sku || '' })}>
                                                    📦 Restock
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {lowStockAlerts.length > 15 && (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                            +{lowStockAlerts.length - 15} more items below threshold. Use the "Low stock only" filter to see all.
                        </div>
                    )}
                </div>
            )}

            {/* ═══ GROUPED VIEW ═══ */}
            {viewMode === 'grouped' && (
                <div className="card">
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: 28 }}></th>
                                    <th style={{ width: 48 }}></th>
                                    <th>{t('inventory.th.product')}</th>
                                    {!branchId && <th>{t('inventory.th.branch')}</th>}
                                    <th>{t('inventory.th.qty')}</th>
                                    <th>{t('common.total')}</th>
                                    <th>{t('inventory.th.value')}</th>
                                    <th>{t('inventory.th.status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredGroups.map(group => {
                                    const key = `${group.productId}__${group.branchId}`;
                                    const isExpanded = expanded === key;
                                    const groupValue = group.inventoryValue || 0; // historical cost from backend, NEVER uses salePrice
                                    const hasOut = group.variants.some(v => v.quantity === 0);
                                    const hasLow = group.lowStockCount > 0;
                                    return (
                                        <React.Fragment key={key}>
                                            <tr style={{ cursor: 'pointer' }}
                                                onClick={() => setExpanded(isExpanded ? null : key)}>
                                                <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                                                    {isExpanded ? '▼' : '▶'}
                                                </td>
                                                {/* Thumbnail */}
                                                <td>
                                                    <div style={{
                                                        width: 40, height: 40, borderRadius: 6, overflow: 'hidden',
                                                        background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
                                                        justifyContent: 'center', border: '1px solid var(--border)',
                                                        cursor: group.imageUrl ? 'pointer' : 'default',
                                                    }} onClick={(e) => { e.stopPropagation(); group.imageUrl && setPreviewModal(imgSrc(group.imageUrl)); }}>
                                                        {group.imageUrl ? (
                                                            <img src={imgSrc(group.imageUrl)} alt="" loading="lazy"
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <span style={{ fontSize: 16, opacity: 0.3 }}>📦</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{group.productName}</div>
                                                    {group.brand && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{group.brand}</div>}
                                                </td>
                                                {!branchId && <td style={{ fontSize: 13 }}>{group.branchName}</td>}
                                                {/* ─── SIZE CHIPS ─── */}
                                                <td>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                                        {group.variants.map((v, vi) => {
                                                            const isLow = v.quantity <= 5;
                                                            const isOut = v.quantity === 0;
                                                            return (
                                                                <span key={v.variantId} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                                    <span style={{
                                                                        fontSize: 12, fontWeight: 600,
                                                                        padding: '1px 7px', borderRadius: 5,
                                                                        background: isOut ? 'rgba(239,68,68,0.18)' : isLow ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.05)',
                                                                        color: isOut ? '#ef4444' : isLow ? '#ef4444' : 'var(--text-primary)',
                                                                        border: `1px solid ${isOut || isLow ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
                                                                    }}>
                                                                        {v.size || v.color || 'STD'}{' '}
                                                                        <span style={{ fontWeight: 800, opacity: isOut ? 0.6 : 1 }}>({v.quantity})</span>
                                                                    </span>
                                                                    {vi < group.variants.length - 1 && (
                                                                        <span style={{ margin: '0 2px', color: 'var(--text-muted)', fontSize: 10 }}>•</span>
                                                                    )}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                                <td style={{
                                                    fontWeight: 700, fontSize: 15,
                                                    color: hasOut ? '#ef4444' : hasLow ? 'var(--gold)' : 'var(--text-primary)',
                                                }}>
                                                    {group.totalQuantity}
                                                </td>
                                                <td style={{ color: 'var(--gold)', fontWeight: 500, whiteSpace: 'nowrap' }}>{fmt(groupValue)}</td>
                                                <td>
                                                    {hasOut ? <span className="badge badge-red">{t('inventory.hasOut')}</span>
                                                        : hasLow ? <span className="badge badge-gold">{t('inventory.statusLow')}</span>
                                                            : <span className="badge badge-green">{t('inventory.statusOk')}</span>}
                                                </td>
                                            </tr>

                                            {/* Expanded detail */}
                                            {isExpanded && (
                                                <tr key={`${key}-exp`}>
                                                    <td colSpan={branchId ? 7 : 8} style={{ padding: 0, background: 'var(--bg-tertiary)' }}>
                                                        <div style={{ padding: 14 }}>
                                                            <table>
                                                                <thead>
                                                                    <tr>
                                                                        <th>SKU</th><th>Size</th><th>Color</th><th>Qty</th>
                                                                        <th>Cost</th><th>Sale</th><th>Value</th><th>Status</th>
                                                                        {canManage && <th></th>}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {group.variants.map(v => {
                                                                        const isLow = v.quantity <= v.lowStockThreshold;
                                                                        const isOut = v.quantity === 0;
                                                                        return (
                                                                            <tr key={v.variantId}>
                                                                                <td><span className="badge badge-gold">{v.sku}</span></td>
                                                                                <td style={{ fontWeight: 600 }}>{v.size || '—'}</td>
                                                                                <td>{v.color || '—'}</td>
                                                                                <td style={{ fontWeight: 700, color: isOut ? '#ef4444' : isLow ? 'var(--gold)' : 'var(--text-primary)' }}>{v.quantity}</td>
                                                                                <td>{fmt(v.costPrice)}</td>
                                                                                <td>{fmt(v.salePrice)}</td>
                                                                                <td style={{ color: 'var(--gold)' }}>{fmt(v.quantity * v.salePrice)}</td>
                                                                                <td>{isOut ? <span className="badge badge-red">OUT</span> : isLow ? <span className="badge badge-red">LOW</span> : <span className="badge badge-green">OK</span>}</td>
                                                                                {canManage && (
                                                                                    <td>
                                                                                        <button className="btn btn-primary btn-sm"
                                                                                            onClick={() => setShowRestock({ variantId: v.variantId, branchId: group.branchId, sku: v.sku })}>
                                                                                            📦 Restock
                                                                                        </button>
                                                                                    </td>
                                                                                )}
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                                {filteredGroups.length === 0 && (
                                    <tr><td colSpan={branchId ? 7 : 8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                                        {search || stockFilter !== 'all' ? t('inventory.noMatch') : t('inventory.noData')}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══ DETAILED VIEW ═══ */}
            {viewMode === 'detailed' && (
                <div className="card">
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>{t('inventory.sku')}</th><th>{t('inventory.th.product')}</th><th>{t('inventory.size')}</th><th>{t('inventory.color')}</th>
                                    {!branchId && <th>{t('inventory.th.branch')}</th>}
                                    <th>{t('inventory.th.qty')}</th><th>{t('inventory.th.cost')}</th><th>{t('inventory.th.sale')}</th><th>{t('inventory.th.value')}</th><th>{t('inventory.th.status')}</th>
                                    {canManage && <th></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredFlat.map((item, i) => {
                                    const v = item.variant || {};
                                    const qty = item.quantity || 0;
                                    const threshold = item.lowStockThreshold || 5;
                                    const isOut = qty === 0;
                                    const isLow = qty <= threshold;
                                    return (
                                        <tr key={i}>
                                            <td><span className="badge badge-gold">{v.sku || '—'}</span></td>
                                            <td style={{ fontWeight: 600 }}>{v.product?.name || '—'}</td>
                                            <td>{v.size || '—'}</td>
                                            <td>{v.color || '—'}</td>
                                            {!branchId && <td>{item.branch?.name || '—'}</td>}
                                            <td style={{ fontWeight: 700, color: isOut ? '#ef4444' : isLow ? 'var(--gold)' : 'var(--text-primary)' }}>{qty}</td>
                                            <td>{fmt(v.costPrice)}</td>
                                            <td>{fmt(v.salePrice)}</td>
                                            <td style={{ color: 'var(--gold)' }}>{fmt(qty * Number(v.salePrice || 0))}</td>
                                            <td>{isOut ? <span className="badge badge-red">OUT</span> : isLow ? <span className="badge badge-red">LOW</span> : <span className="badge badge-green">OK</span>}</td>
                                            {canManage && (
                                                <td>
                                                    <button className="btn btn-primary btn-sm"
                                                        onClick={() => setShowRestock({ variantId: item.variantId, branchId: item.branchId, sku: v.sku })}>
                                                        📦
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                                {filteredFlat.length === 0 && (
                                    <tr><td colSpan={branchId ? 10 : 11} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                                        {t('inventory.noData')}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Restock Modal */}
            {showRestock && (
                <div className="modal-overlay" onClick={() => setShowRestock(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>📦 {t('inventory.totalStock')}</h2>
                        <div style={{ marginBottom: 16 }}>
                            <span className="badge badge-gold">{showRestock.sku}</span>
                            <span style={{ marginInlineStart: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                                Branch: {branches.find(b => b.id === showRestock.branchId)?.name || showRestock.branchId}
                            </span>
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('common.quantity')}</label>
                            <input type="number" className="form-input" min={1} value={restockQty || ''}
                                onChange={e => setRestockQty(Number(e.target.value))}
                                autoFocus placeholder="Enter quantity" />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }}
                                onClick={() => setShowRestock(null)}>{t('common.cancel')}</button>
                            <button className="btn btn-primary" style={{ flex: 1 }}
                                onClick={handleRestock} disabled={restockQty <= 0}>📦 Restock</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Preview Modal */}
            {previewModal && (
                <div className="modal-overlay" onClick={() => setPreviewModal(null)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        maxWidth: 400, maxHeight: '70vh', borderRadius: 12, overflow: 'hidden',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                    }}>
                        <img src={previewModal} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                </div>
            )}
        </div>
    );
}

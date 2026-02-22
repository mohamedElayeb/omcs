'use client';
import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../../lib/store';
import { productsApi, categoriesApi } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../lib/i18n';

export default function PricesPage() {
    const { token, user } = useAuthStore();
    const toast = useToast();
    const { t } = useTranslation();
    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [priceHistory, setPriceHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editVariant, setEditVariant] = useState<any>(null);
    const [editPrice, setEditPrice] = useState('');
    const [editReason, setEditReason] = useState('');
    const [showBulk, setShowBulk] = useState(false);
    const [bulkPercent, setBulkPercent] = useState(0);
    const [bulkCategory, setBulkCategory] = useState('');
    const [bulkBrand, setBulkBrand] = useState('');
    const [bulkReason, setBulkReason] = useState('');
    const [bulkResult, setBulkResult] = useState<any>(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!token) return;
        Promise.all([
            productsApi.findAll(token),
            categoriesApi.findAll(token),
            productsApi.priceHistory(token),
        ]).then(([p, c, h]) => {
            setProducts(p);
            setCategories(c);
            setPriceHistory(h);
        }).finally(() => setLoading(false));
    }, [token]);

    const handlePriceUpdate = async () => {
        if (!token || !editVariant) return;
        try {
            await productsApi.updateVariant(token, editVariant.id, {
                salePrice: Math.ceil(Number(editPrice) / 5) * 5,
                reason: editReason,
            });
            setEditVariant(null);
            setEditPrice('');
            setEditReason('');
            // Reload
            const [p, h] = await Promise.all([productsApi.findAll(token), productsApi.priceHistory(token)]);
            setProducts(p);
            setPriceHistory(h);
        } catch (err: any) {
            toast.error(err.message);
        }
    };


    const handleBulkUpdate = async () => {
        if (!token || !bulkPercent) return;
        try {
            const result = await productsApi.bulkPriceUpdate(token, {
                percentChange: bulkPercent,
                categoryId: bulkCategory || undefined,
                brand: bulkBrand || undefined,
                reason: bulkReason,
            });
            setBulkResult(result);
            // Reload
            const [p, h] = await Promise.all([productsApi.findAll(token), productsApi.priceHistory(token)]);
            setProducts(p);
            setPriceHistory(h);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Flatten variants and apply search (must be above early return to respect hooks ordering)
    const variants: any[] = useMemo(() => {
        const all: any[] = [];
        for (const p of products) {
            for (const v of (p.variants || [])) {
                all.push({ ...v, productName: p.name, brand: p.brand, categoryName: p.category?.name });
            }
        }
        if (!search.trim()) return all;
        const q = search.toLowerCase().trim();
        return all.filter(v =>
            (v.productName || '').toLowerCase().includes(q) ||
            (v.brand || '').toLowerCase().includes(q) ||
            (v.sku || '').toLowerCase().includes(q) ||
            (v.size || '').toLowerCase().includes(q) ||
            (v.color || '').toLowerCase().includes(q)
        );
    }, [products, search]);

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{t('common.loading')}</div>;

    return (
        <div>
            {/* ─── TOOLBAR ─── */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Search Input */}
                <div className="simple-search" style={{ minWidth: 200, maxWidth: 320, flex: 1 }}>
                    <div className="simple-search__wrap">
                        <span className="simple-search__icon">🔍</span>
                        <input
                            type="text"
                            className="simple-search__input"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('prices.searchPlaceholder')}
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

                {/* Right side: count + bulk */}
                <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{variants.length} {t('prices.title')}</span>
                    {user?.role === 'OWNER' && (
                        <button className="btn btn-primary" onClick={() => setShowBulk(true)}>📊 {t('prices.bulkPriceUpdate')}</button>
                    )}
                </div>
            </div>

            {/* Products + Prices Table */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                    <span className="card-title">{t('prices.productPrices')} ({variants.length})</span>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr><th>{t('inventory.sku')}</th><th>{t('prices.th.product')}</th><th>{t('prices.th.sizeColor')}</th><th>{t('prices.th.costUsd')}</th><th>{t('prices.th.sellUsd')}</th><th>{t('prices.th.costLyd')}</th><th>{t('prices.th.saleLyd')}</th><th>{t('prices.th.margin')}</th><th>{t('prices.th.action')}</th></tr>
                        </thead>
                        <tbody>
                            {variants.map(v => (
                                <tr key={v.id}>
                                    <td><span className="badge badge-gold">{v.sku}</span></td>
                                    <td>{v.productName}<br /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v.brand}</span></td>
                                    <td>{v.size || '—'} / {v.color || '—'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{v.costUsd ? `$${Number(v.costUsd).toFixed(2)}` : '—'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gold)' }}>{v.sellUsd ? `$${Number(v.sellUsd).toFixed(2)}` : '—'}</td>
                                    <td>{fmt(v.costPrice)}</td>
                                    <td style={{ fontWeight: 600, color: 'var(--gold)' }}>{fmt(v.salePrice)}</td>
                                    <td style={{ color: Number(v.profitMargin) > 0 ? 'var(--green)' : 'var(--red)' }}>
                                        {Number(v.profitMargin || 0).toFixed(1)}%
                                    </td>
                                    <td>
                                        <button className="btn btn-secondary btn-sm"
                                            onClick={() => { setEditVariant(v); setEditPrice(String(v.salePrice)); }}>
                                            {t('prices.editBtn')}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Price History */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title">{t('prices.priceHistoryTitle', { count: priceHistory.length })}</span>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr><th>{t('prices.th.date')}</th><th>{t('inventory.sku')}</th><th>{t('prices.th.product')}</th><th>{t('prices.th.oldPrice')}</th><th>{t('prices.th.newPrice')}</th><th>{t('prices.th.change')}</th><th>{t('prices.th.changedBy')}</th><th>{t('prices.th.reason')}</th></tr>
                        </thead>
                        <tbody>
                            {priceHistory.map((h: any, i: number) => {
                                const change = Number(h.newSalePrice) - Number(h.oldSalePrice);
                                const pct = Number(h.oldSalePrice) > 0 ? (change / Number(h.oldSalePrice)) * 100 : 0;
                                return (
                                    <tr key={i}>
                                        <td style={{ fontSize: 12 }}>{new Date(h.changedAt).toLocaleString()}</td>
                                        <td><span className="badge badge-gold">{h.variant?.sku || '—'}</span></td>
                                        <td>{h.variant?.product?.name || '—'}</td>
                                        <td>{fmt(h.oldSalePrice)}</td>
                                        <td style={{ fontWeight: 600, color: 'var(--gold)' }}>{fmt(h.newSalePrice)}</td>
                                        <td style={{ color: change > 0 ? 'var(--red)' : 'var(--green)' }}>
                                            {change > 0 ? '+' : ''}{fmt(change)} ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
                                        </td>
                                        <td>{h.changedByUser?.fullName || '—'}</td>
                                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.reason || '—'}</td>
                                    </tr>
                                );
                            })}
                            {priceHistory.length === 0 && (
                                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{t('prices.noPriceChanges')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Price Modal */}
            {editVariant && (
                <div className="modal-overlay" onClick={() => setEditVariant(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{t('prices.editPriceTitle')}</h2>
                        <div style={{ marginBottom: 16 }}>
                            <span className="badge badge-gold">{editVariant.sku}</span>
                            <span style={{ marginInlineStart: 8 }}>{editVariant.productName}</span>
                        </div>
                        <div className="grid-2" style={{ marginBottom: 16 }}>
                            <div>
                                <div className="form-label">{t('prices.currentPrice')}</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-muted)' }}>{fmt(editVariant.salePrice)} {t('common.lyd')}</div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('prices.newPrice')}</label>
                                <input type="number" step="0.001" className="form-input"
                                    value={editPrice} onChange={e => setEditPrice(e.target.value)} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('prices.reasonForChange')}</label>
                            <input className="form-input" value={editReason}
                                onChange={e => setEditReason(e.target.value)}
                                placeholder={t('prices.reasonPlaceholder')} />
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}
                                onClick={() => setEditVariant(null)}>{t('common.cancel')}</button>
                            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                                onClick={handlePriceUpdate}>{t('prices.updatePriceBtn')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Price Update Modal */}
            {showBulk && (
                <div className="modal-overlay" onClick={() => { setShowBulk(false); setBulkResult(null); }}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{t('prices.bulkTitle')}</h2>
                        {bulkResult ? (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                                <p style={{ fontSize: 18, fontWeight: 600 }}>{t('prices.bulkVariantsUpdated', { count: bulkResult.updated })}</p>
                                <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                                    {t('prices.bulkAdjustmentApplied', { percent: `${bulkResult.percentChange > 0 ? '+' : ''}${bulkResult.percentChange}` })}
                                </p>
                                <button className="btn btn-primary" style={{ marginTop: 20 }}
                                    onClick={() => { setShowBulk(false); setBulkResult(null); }}>{t('prices.bulkDone')}</button>
                            </div>
                        ) : (
                            <>
                                <div className="form-group">
                                    <label className="form-label">{t('prices.bulkPercentLabel')}</label>
                                    <input type="number" step="0.1" className="form-input"
                                        value={bulkPercent || ''} onChange={e => setBulkPercent(Number(e.target.value))}
                                        placeholder={t('prices.bulkPercentPlaceholder')} />
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">{t('prices.bulkCategoryLabel')}</label>
                                        <select className="form-input" value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}>
                                            <option value="">{t('prices.bulkAllCategories')}</option>
                                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('prices.bulkBrandLabel')}</label>
                                        <input className="form-input" value={bulkBrand} onChange={e => setBulkBrand(e.target.value)}
                                            placeholder={t('prices.bulkBrandPlaceholder')} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('prices.bulkReasonLabel')}</label>
                                    <input className="form-input" value={bulkReason} onChange={e => setBulkReason(e.target.value)}
                                        placeholder={t('prices.bulkReasonPlaceholder')} />
                                </div>
                                <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                                    {t('prices.bulkWarning', { scope: bulkCategory ? t('prices.bulkWarningCategory') : t('prices.bulkWarningAll') })}{' '}
                                    <strong style={{ color: bulkPercent > 0 ? 'var(--red)' : 'var(--green)' }}>
                                        {bulkPercent > 0 ? '+' : ''}{bulkPercent}%
                                    </strong>. {t('prices.bulkLoggedNote')}
                                </div>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}
                                        onClick={() => setShowBulk(false)}>{t('common.cancel')}</button>
                                    <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }}
                                        onClick={handleBulkUpdate}>{t('prices.bulkApply', { percent: `${bulkPercent > 0 ? '+' : ''}${bulkPercent}` })}</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

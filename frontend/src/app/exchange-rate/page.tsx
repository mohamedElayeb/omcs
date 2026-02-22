'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../lib/store';
import { settingsApi, categoriesApi, productsApi } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../lib/i18n';

export default function ExchangeRatePage() {
    const { token, user } = useAuthStore();
    const toast = useToast();
    const { t } = useTranslation();
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Selling rate form
    const [newSellingRate, setNewSellingRate] = useState('');
    const [recalculate, setRecalculate] = useState(true);
    const [filterCategory, setFilterCategory] = useState('');
    const [filterBrand, setFilterBrand] = useState('');
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<{ rate: number; updated: number } | null>(null);

    // Purchase rate form
    const [newPurchaseRate, setNewPurchaseRate] = useState('');
    const [savingPurchase, setSavingPurchase] = useState(false);
    const [purchaseResult, setPurchaseResult] = useState<string | null>(null);

    // Default margin
    const [defaultMargin, setDefaultMargin] = useState('');
    const [marginSaved, setMarginSaved] = useState(false);

    // Price history preview
    const [priceHistory, setPriceHistory] = useState<any[]>([]);

    useEffect(() => {
        if (!token) return;
        Promise.all([
            settingsApi.getAll(token),
            categoriesApi.findAll(token),
            productsApi.priceHistory(token),
        ]).then(([s, c, h]) => {
            setSettings(s);
            setCategories(c);
            setPriceHistory(h.slice(0, 20));
            setNewSellingRate(s.sellingUsdRate || s.parallelUsdRate || '6.30');
            setNewPurchaseRate(s.parallelUsdRate || '6.30');
            setDefaultMargin(s.defaultMarginPercent || '35');
        }).finally(() => setLoading(false));
    }, [token]);

    const handleUpdateSellingRate = async () => {
        if (!token || !newSellingRate) return;
        const rate = Number(newSellingRate);
        if (isNaN(rate) || rate <= 0) { toast.warning('Invalid rate'); return; }
        setSaving(true);
        setResult(null);
        try {
            const res = await settingsApi.updateUsdRate(token, {
                rate,
                recalculate,
                categoryId: filterCategory || undefined,
                brand: filterBrand || undefined,
            });
            setResult(res);
            setSettings(prev => ({ ...prev, sellingUsdRate: String(res.rate) }));
            // Reload price history
            const h = await productsApi.priceHistory(token);
            setPriceHistory(h.slice(0, 20));
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleUpdatePurchaseRate = async () => {
        if (!token || !newPurchaseRate) return;
        const rate = Number(newPurchaseRate);
        if (isNaN(rate) || rate <= 0) { toast.warning('Invalid rate'); return; }
        setSavingPurchase(true);
        setPurchaseResult(null);
        try {
            await settingsApi.update(token, 'parallelUsdRate', String(rate));
            setSettings(prev => ({ ...prev, parallelUsdRate: String(rate) }));
            setPurchaseResult(`✅ Purchase rate updated to ${fmt(rate)} LYD/USD`);
            setTimeout(() => setPurchaseResult(null), 3000);
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setSavingPurchase(false);
        }
    };

    const handleSaveMargin = async () => {
        if (!token) return;
        try {
            await settingsApi.update(token, 'defaultMarginPercent', defaultMargin);
            setSettings(prev => ({ ...prev, defaultMarginPercent: defaultMargin }));
            setMarginSaved(true);
            setTimeout(() => setMarginSaved(false), 2000);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const roundUp5 = (price: number) => Math.ceil(price / 5) * 5;
    const currentSellingRate = Number(settings.sellingUsdRate || settings.parallelUsdRate || 6.30);
    const currentPurchaseRate = Number(settings.parallelUsdRate || 6.30);

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{t('common.loading')}</div>;

    return (
        <div>
            {/* Current Rates Display */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div className="card stat-card" style={{ borderTop: '3px solid var(--gold)' }}>
                    <div className="stat-label">{t('exchangeRate.sellingRate')}</div>
                    <div className="stat-value" style={{ fontSize: 32 }}>{fmt(currentSellingRate)} {t('common.lyd')}</div>
                </div>
                <div className="card stat-card" style={{ borderTop: '3px solid var(--cyan)' }}>
                    <div className="stat-label">{t('exchangeRate.purchaseRate')}</div>
                    <div className="stat-value" style={{ fontSize: 32 }}>{fmt(currentPurchaseRate)} {t('common.lyd')}</div>
                </div>
                <div className="card stat-card" style={{ borderTop: '3px solid var(--purple)' }}>
                    <div className="stat-label">{t('exchangeRate.defaultMargin')}</div>
                    <div className="stat-value" style={{ fontSize: 32 }}>{defaultMargin}%</div>
                </div>
            </div>

            {/* Example Pricing */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                    <span className="card-title">📐 Example Pricing (Sell USD × Selling Rate)</span>
                </div>
                <div style={{ padding: 20, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    {[5, 10, 15, 25, 50].map(usd => {
                        const saleLyd = roundUp5(usd * currentSellingRate);
                        const costLyd = usd * currentPurchaseRate;
                        return (
                            <div key={usd} style={{ padding: '8px 16px', background: 'var(--bg-tertiary)', borderRadius: 8, textAlign: 'center', minWidth: 100 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sell ${usd}</div>
                                <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: 18 }}>{fmt(saleLyd)} LYD</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>↑5 rounded</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Update Selling Rate */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">💰 Selling USD Rate</span>
                    </div>
                    <div style={{ padding: 20 }}>
                        <div style={{ padding: '8px 12px', background: 'rgba(255,193,7,0.08)', borderRadius: 8, border: '1px solid rgba(255,193,7,0.2)', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                            ⚡ This rate controls <strong>sale prices only</strong>.<br />
                            Formula: <code>salePriceLyd = sellUsd × sellingUsdRate</code><br />
                            Purchase costs and inventory values are <strong>NEVER</strong> affected.
                        </div>

                        <div className="form-group">
                            <label className="form-label">{t('exchangeRate.newSellingRate')}</label>
                            <input type="number" step="0.01" className="form-input"
                                value={newSellingRate} onChange={e => setNewSellingRate(e.target.value)}
                                style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }} />
                        </div>

                        <div style={{ margin: '16px 0' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input type="checkbox" checked={recalculate}
                                    onChange={e => setRecalculate(e.target.checked)}
                                    style={{ width: 18, height: 18 }} />
                                <span style={{ fontSize: 14 }}>
                                    Recalculate <strong>sale prices</strong> for all variants with sellUsd
                                </span>
                            </label>
                            {recalculate && (
                                <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(59,130,246,0.08)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.2)', fontSize: 12, color: 'var(--text-secondary)' }}>
                                    ℹ️ Sale prices = <code>sellUsd × {newSellingRate || '?'}</code>, rounded ↑5 LYD.<br />
                                    Variants without sellUsd use margin-based fallback: <code>costUsd × rate / (1 - margin%)</code>.<br />
                                    Historical purchase costs are <strong>NEVER</strong> modified.
                                </div>
                            )}
                        </div>

                        {recalculate && (
                            <div className="grid-2" style={{ marginBottom: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Category (optional filter)</label>
                                    <select className="form-input" value={filterCategory}
                                        onChange={e => setFilterCategory(e.target.value)}>
                                        <option value="">{t('exchangeRate.allCategories')}</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Brand (optional filter)</label>
                                    <input className="form-input" value={filterBrand}
                                        onChange={e => setFilterBrand(e.target.value)}
                                        placeholder="Filter by brand" />
                                </div>
                            </div>
                        )}

                        <div style={{
                            background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8,
                            marginBottom: 16, fontSize: 13, border: '1px solid var(--border)',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span>{t('exchangeRate.currentSellingRate')}</span>
                                <strong>{fmt(currentSellingRate)} LYD/USD</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span>{t('exchangeRate.newSellingRateLabel')}</span>
                                <strong style={{ color: 'var(--gold)' }}>{fmt(Number(newSellingRate) || 0)} LYD/USD</strong>
                            </div>
                            {Number(newSellingRate) !== currentSellingRate && (
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    color: Number(newSellingRate) > currentSellingRate ? 'var(--red)' : 'var(--green)',
                                    fontWeight: 600, borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 4,
                                }}>
                                    <span>Change:</span>
                                    <span>
                                        {Number(newSellingRate) > currentSellingRate ? '▲' : '▼'}{' '}
                                        {((Math.abs(Number(newSellingRate) - currentSellingRate) / currentSellingRate) * 100).toFixed(1)}%
                                    </span>
                                </div>
                            )}
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                            onClick={handleUpdateSellingRate} disabled={saving}>
                            {saving ? '⏳ Updating...' : '💰 Update Selling Rate' + (recalculate ? ' & Recalculate Prices' : '')}
                        </button>

                        {result && (
                            <div style={{
                                marginTop: 16, textAlign: 'center', padding: 16,
                                background: 'rgba(0,200,100,0.1)', borderRadius: 8,
                                border: '1px solid rgba(0,200,100,0.3)',
                            }}>
                                <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                                <div style={{ fontWeight: 600 }}>{t('exchangeRate.sellingRateUpdated', { rate: fmt(result.rate) })}</div>
                                {result.updated > 0 && (
                                    <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                                        {result.updated} variant sale prices recalculated
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Purchase Rate + Default Margin */}
                <div>
                    {/* Purchase Rate */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div className="card-header">
                            <span className="card-title">💱 Purchase USD Rate</span>
                        </div>
                        <div style={{ padding: 20 }}>
                            <div style={{ padding: '8px 12px', background: 'rgba(34,211,238,0.08)', borderRadius: 8, border: '1px solid rgba(34,211,238,0.2)', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                                📦 This is the <strong>default rate for new product purchases</strong>.<br />
                                Each purchase locks in its own rate. Changing this does <strong>NOT</strong> affect existing products or inventory values.
                            </div>

                            <div className="form-group">
                                <label className="form-label">{t('exchangeRate.defaultPurchaseRate')}</label>
                                <input type="number" step="0.01" className="form-input"
                                    value={newPurchaseRate} onChange={e => setNewPurchaseRate(e.target.value)}
                                    style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }} />
                            </div>

                            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}
                                onClick={handleUpdatePurchaseRate} disabled={savingPurchase}>
                                {savingPurchase ? '⏳ Saving...' : '💱 Update Purchase Rate'}
                            </button>

                            {purchaseResult && (
                                <div style={{ marginTop: 12, textAlign: 'center', padding: 10, background: 'rgba(0,200,100,0.1)', borderRadius: 8, border: '1px solid rgba(0,200,100,0.3)', fontSize: 13 }}>
                                    {purchaseResult}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Default Margin */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">📊 Default Margin Settings</span>
                        </div>
                        <div style={{ padding: 20 }}>
                            <div className="form-group">
                                <label className="form-label">{t('exchangeRate.defaultMarginPercent')}</label>
                                <input type="number" step="1" min="0" max="100" className="form-input"
                                    value={defaultMargin} onChange={e => setDefaultMargin(e.target.value)}
                                    style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }} />
                            </div>
                            <div style={{
                                background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8,
                                marginBottom: 16, fontSize: 13,
                            }}>
                                ℹ️ Used as a fallback when a variant has <code>costUsd</code> but no <code>sellUsd</code>.<br />
                                Formula: <code>salePrice = (costUsd × sellingRate) / (1 - margin%)</code>
                            </div>
                            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}
                                onClick={handleSaveMargin}>
                                {marginSaved ? '✅ Saved!' : '💾 Save Default Margin'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Price Changes */}
            {priceHistory.length > 0 && (
                <div className="card" style={{ marginTop: 24 }}>
                    <div className="card-header">
                        <span className="card-title">📜 Recent Price Changes ({priceHistory.length})</span>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr><th>{t('exchangeRate.priceLogDate')}</th><th>{t('exchangeRate.priceLogSku')}</th><th>{t('exchangeRate.priceLogProduct')}</th><th>{t('exchangeRate.priceLogOldPrice')}</th><th>{t('exchangeRate.priceLogNewPrice')}</th><th>{t('exchangeRate.priceLogChange')}</th><th>{t('exchangeRate.priceLogReason')}</th></tr>
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
                                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.reason || '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

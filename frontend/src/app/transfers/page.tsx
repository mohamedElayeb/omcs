'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../lib/store';
import { transfersApi, inventoryApi, branchesApi } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../lib/i18n';

export default function TransfersPage() {
    const { token, user, selectedBranchId } = useAuthStore();
    const toast = useToast();
    const { t } = useTranslation();
    const [transfers, setTransfers] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [inventory, setInventory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [transferMode, setTransferMode] = useState<'immediate' | 'standard'>('immediate');
    const [form, setForm] = useState({ variantId: '', fromBranchId: '', toBranchId: '', quantity: 1, notes: '' });
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [searchInv, setSearchInv] = useState('');
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const loadData = async () => {
        if (!token) return;
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            const [t, b] = await Promise.all([
                transfersApi.findAll(token, params.toString()),
                branchesApi.findAll(token),
            ]);
            setTransfers(t);
            setBranches(b);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, [token, statusFilter]);

    const loadBranchInventory = async (branchId: string) => {
        if (!token || !branchId) return;
        const inv = await inventoryApi.findAll(token, branchId);
        setInventory(inv);
    };

    useEffect(() => {
        if (form.fromBranchId) loadBranchInventory(form.fromBranchId);
    }, [form.fromBranchId]);

    const handleCreate = async () => {
        if (!token) return;
        try {
            if (transferMode === 'immediate') {
                await transfersApi.immediate(token, form);
            } else {
                await transfersApi.create(token, form);
            }
            setShowCreate(false);
            setForm({ variantId: '', fromBranchId: '', toBranchId: '', quantity: 1, notes: '' });
            loadData();
        } catch (err: any) { toast.error(err.message); }
    };

    const handleAction = async (id: string, action: 'dispatch' | 'receive' | 'cancel') => {
        if (!token) return;
        setActionLoading(id);
        try {
            if (action === 'dispatch') await transfersApi.dispatch(token, id);
            else if (action === 'receive') await transfersApi.receive(token, id);
            else await transfersApi.cancel(token, id);
            loadData();
        } catch (err: any) { toast.error(err.message); }
        finally { setActionLoading(null); }
    };

    const statusBadge = (status: string) => {
        const map: Record<string, { cls: string; label: string }> = {
            PENDING: { cls: 'badge-gold', label: t('transfers.statusPending') },
            DISPATCHED: { cls: 'badge-blue', label: t('transfers.statusInTransit') },
            RECEIVED: { cls: 'badge-green', label: '✅ ' + t('transfers.statusDelivered') },
            COMPLETED: { cls: 'badge-green', label: '⚡ ' + t('transfers.transfer') },
            CANCELLED: { cls: 'badge-red', label: t('transfers.statusCancelled') },
        };
        const s = map[status] || { cls: '', label: status };
        return <span className={`badge ${s.cls}`}>{s.label}</span>;
    };

    // Filter inventory items for search
    const filteredInventory = inventory.filter(inv => {
        if (!searchInv) return true;
        const q = searchInv.toLowerCase();
        return (inv.variant?.sku || '').toLowerCase().includes(q) ||
            (inv.variant?.product?.name || '').toLowerCase().includes(q) ||
            (inv.variant?.size || '').toLowerCase().includes(q) ||
            (inv.variant?.color || '').toLowerCase().includes(q);
    });

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{t('common.loading')}</div>;

    return (
        <div>
            {/* Actions + Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>{t('transfers.newTransfer')}</button>

                {/* Search Input */}
                <div className="simple-search" style={{ minWidth: 200, maxWidth: 320, flex: 1 }}>
                    <div className="simple-search__wrap">
                        <span className="simple-search__icon">🔍</span>
                        <input
                            type="text"
                            className="simple-search__input"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('transfers.th.product') + ' / SKU...'}
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

                <select className="branch-selector" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">{t('transfers.title')}</option>
                    <option value="PENDING">{t('transfers.statusPending')}</option>
                    <option value="DISPATCHED">{t('transfers.statusInTransit')}</option>
                    <option value="RECEIVED">{t('transfers.statusDelivered')}</option>
                    <option value="COMPLETED">⚡ {t('transfers.transfer')}</option>
                    <option value="CANCELLED">{t('transfers.statusCancelled')}</option>
                </select>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: 12, width: 140 }}
                        value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
                    <input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: 12, width: 140 }}
                        value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                <div style={{ marginInlineStart: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>
                    {transfers.length} {t('transfers.title')}
                </div>
            </div>

            {/* Transfers Table */}
            <div className="card">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>{t('transfers.th.date')}</th>
                                <th>{t('transfers.th.product')}</th>
                                <th>{t('inventory.sku')}</th>
                                <th>{t('transfers.th.qty')}</th>
                                <th>{t('transfers.fromBranch')}</th>
                                <th>{t('transfers.toBranch')}</th>
                                <th>{t('transfers.th.status')}</th>
                                <th>{t('dashboard.employee')}</th>
                                <th>{t('common.notes')}</th>
                                <th>{t('transfers.th.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfers.filter(tr => {
                                if (!search.trim() && !dateFrom && !dateTo) return true;
                                let match = true;
                                if (search.trim()) {
                                    const q = search.toLowerCase();
                                    match = (tr.variant?.product?.name || '').toLowerCase().includes(q)
                                        || (tr.variant?.sku || '').toLowerCase().includes(q)
                                        || (tr.fromBranch?.name || '').toLowerCase().includes(q)
                                        || (tr.toBranch?.name || '').toLowerCase().includes(q);
                                }
                                if (match && dateFrom) {
                                    match = new Date(tr.createdAt) >= new Date(dateFrom);
                                }
                                if (match && dateTo) {
                                    const end = new Date(dateTo); end.setDate(end.getDate() + 1);
                                    match = new Date(tr.createdAt) < end;
                                }
                                return match;
                            }).map(tr => (
                                <tr key={tr.id}>
                                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(tr.createdAt).toLocaleString()}</td>
                                    <td>{tr.variant?.product?.name || '—'}</td>
                                    <td><span className="badge badge-gold">{tr.variant?.sku || '—'}</span></td>
                                    <td style={{ fontWeight: 700 }}>{tr.quantity}</td>
                                    <td>{tr.fromBranch?.name || '—'}</td>
                                    <td>{tr.toBranch?.name || '—'}</td>
                                    <td>{statusBadge(tr.status)}</td>
                                    <td>{tr.initiator?.fullName || '—'}</td>
                                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.notes || '—'}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {tr.status === 'PENDING' && (
                                                <>
                                                    <button className="btn btn-primary btn-sm" disabled={actionLoading === tr.id}
                                                        onClick={() => handleAction(tr.id, 'dispatch')}>🚚</button>
                                                    <button className="btn btn-danger btn-sm" disabled={actionLoading === tr.id}
                                                        onClick={() => handleAction(tr.id, 'cancel')}>❌</button>
                                                </>
                                            )}
                                            {tr.status === 'DISPATCHED' && (
                                                <>
                                                    <button className="btn btn-primary btn-sm" disabled={actionLoading === tr.id}
                                                        onClick={() => handleAction(tr.id, 'receive')}>📥</button>
                                                    <button className="btn btn-danger btn-sm" disabled={actionLoading === tr.id}
                                                        onClick={() => handleAction(tr.id, 'cancel')}>❌</button>
                                                </>
                                            )}
                                            {(tr.status === 'RECEIVED' || tr.status === 'CANCELLED' || tr.status === 'COMPLETED') && (
                                                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                                    {tr.status === 'COMPLETED' ? '⚡' :
                                                        tr.status === 'RECEIVED' ? `✅ ${tr.receivedAt ? new Date(tr.receivedAt).toLocaleDateString() : ''}` : '❌'}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {transfers.length === 0 && (
                                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{t('transfers.noTransfers')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Transfer Workflow Info */}
            <div className="card" style={{ marginTop: 20 }}>
                <div className="card-title" style={{ marginBottom: 12 }}>📋 Transfer Modes</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ padding: 12, background: 'rgba(212,175,55,0.08)', borderRadius: 8, border: '1px solid rgba(212,175,55,0.2)' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>⚡ Immediate Transfer (Default)</div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                            Stock is moved instantly from source to destination. No approval steps needed.
                            Best for same-city branches or when the owner is managing both locations.
                        </p>
                    </div>
                    <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>📦 Standard Transfer (3-step)</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                            <span className="badge badge-gold">1. Initiate</span>
                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                            <span className="badge badge-blue">2. Dispatch</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(stock removed)</span>
                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                            <span className="badge badge-green">3. Receive</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(stock added)</span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                            For inter-city transfers or when physical delivery tracking is needed.
                        </p>
                    </div>
                </div>
            </div>

            {/* Create Transfer Modal */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                        <h2>{t('transfers.newTransfer')}</h2>

                        {/* Mode toggle */}
                        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
                            <button
                                className={`btn btn-sm ${transferMode === 'immediate' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ flex: 1, justifyContent: 'center', border: 'none' }}
                                onClick={() => setTransferMode('immediate')}>
                                ⚡ Immediate
                            </button>
                            <button
                                className={`btn btn-sm ${transferMode === 'standard' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ flex: 1, justifyContent: 'center', border: 'none' }}
                                onClick={() => setTransferMode('standard')}>
                                📦 Standard (3-step)
                            </button>
                        </div>

                        {transferMode === 'immediate' && (
                            <div style={{ padding: 10, background: 'rgba(212,175,55,0.08)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.2)' }}>
                                ⚡ Stock will be moved instantly. No dispatch/receive steps needed.
                            </div>
                        )}

                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">{t('transfers.fromBranch')}</label>
                                <select className="form-input" value={form.fromBranchId}
                                    onChange={e => setForm({ ...form, fromBranchId: e.target.value, variantId: '' })}>
                                    <option value="">{t('transfers.selectSource')}</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('transfers.toBranch')}</label>
                                <select className="form-input" value={form.toBranchId}
                                    onChange={e => setForm({ ...form, toBranchId: e.target.value })}>
                                    <option value="">{t('transfers.selectDestination')}</option>
                                    {branches.filter(b => b.id !== form.fromBranchId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">{t('transfers.productVariant')}</label>
                            {form.fromBranchId ? (
                                <>
                                    <div className="simple-search" style={{ marginBottom: 8 }}>
                                        <div className="simple-search__wrap">
                                            <span className="simple-search__icon">🔍</span>
                                            <input
                                                className="simple-search__input"
                                                placeholder="Search by SKU, name, size..."
                                                value={searchInv}
                                                onChange={e => setSearchInv(e.target.value)}
                                                autoComplete="off"
                                                spellCheck={false}
                                            />
                                            {searchInv && (
                                                <button className="simple-search__clear" onClick={() => setSearchInv('')} type="button">✕</button>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{
                                        maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
                                        border: '1px solid var(--border)', borderRadius: 8, padding: 6, background: 'var(--bg-primary)'
                                    }}>
                                        {filteredInventory.length === 0 && (
                                            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                                                {searchInv ? 'No products match your search' : 'No inventory in this branch'}
                                            </div>
                                        )}
                                        {filteredInventory.map(inv => {
                                            const isSelected = form.variantId === inv.variantId;
                                            const isOutOfStock = inv.quantity <= 0;
                                            return (
                                                <button
                                                    key={inv.id}
                                                    type="button"
                                                    onClick={() => !isOutOfStock && setForm({ ...form, variantId: inv.variantId })}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 10,
                                                        padding: '10px 12px', borderRadius: 8, border: 'none',
                                                        background: isSelected ? 'rgba(212,175,55,0.12)' : 'var(--bg-secondary)',
                                                        outline: isSelected ? '2px solid var(--gold)' : '1px solid var(--border)',
                                                        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                                                        opacity: isOutOfStock ? 0.4 : 1,
                                                        textAlign: 'start', width: '100%',
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                >
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {inv.variant?.product?.name || '—'}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                                                            {inv.variant?.size && (
                                                                <span className="badge" style={{ fontSize: 10, padding: '2px 6px' }}>
                                                                    {inv.variant.size}
                                                                </span>
                                                            )}
                                                            {inv.variant?.color && (
                                                                <span className="badge" style={{ fontSize: 10, padding: '2px 6px', background: 'var(--purple-bg)', color: 'var(--purple)' }}>
                                                                    {inv.variant.color}
                                                                </span>
                                                            )}
                                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                                {inv.variant?.sku}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div style={{
                                                        textAlign: 'center', minWidth: 44,
                                                        padding: '4px 8px', borderRadius: 6,
                                                        background: inv.quantity > 5 ? 'var(--green-bg)' : inv.quantity > 0 ? 'var(--red-bg)' : 'var(--bg-tertiary)',
                                                        color: inv.quantity > 5 ? 'var(--green)' : inv.quantity > 0 ? 'var(--red)' : 'var(--text-muted)',
                                                        fontWeight: 700, fontSize: 14,
                                                    }}>
                                                        {inv.quantity}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {form.variantId && (
                                        <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 4 }}>
                                            ✓ {inventory.find(i => i.variantId === form.variantId)?.variant?.product?.name} — {inventory.find(i => i.variantId === form.variantId)?.variant?.sku}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>
                                    {t('transfers.selectSource') || 'Select source branch first'}
                                </div>
                            )}
                        </div>

                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">{t('transfers.quantity')}</label>
                                <input type="number" className="form-input" min={1} value={form.quantity}
                                    onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
                                {form.variantId && (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        Available: {inventory.filter(i => i.variantId === form.variantId).reduce((s: number, i: any) => s + i.quantity, 0)}
                                    </span>
                                )}
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('common.notes')}</label>
                                <input className="form-input" value={form.notes}
                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                    placeholder="e.g., Customer request" />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
                            <button className="btn btn-primary" style={{ flex: 1 }}
                                disabled={!form.variantId || !form.fromBranchId || !form.toBranchId || form.quantity < 1}
                                onClick={handleCreate}>
                                {transferMode === 'immediate' ? '⚡ Transfer Now' : '📦 Create Transfer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

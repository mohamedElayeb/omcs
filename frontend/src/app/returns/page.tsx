'use client';
import { useEffect, useState, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '../../lib/store';
import { returnsApi } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../lib/i18n';

export default function ReturnsPage() {
    const { token, user, selectedBranchId } = useAuthStore();
    const toast = useToast();
    const { t } = useTranslation();
    const [returns, setReturns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [filter, setFilter] = useState({ status: '', dateFrom: '', dateTo: '' });
    const [search, setSearch] = useState('');

    // ─── New Return Modal ───
    const [showNewReturn, setShowNewReturn] = useState(false);
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [preview, setPreview] = useState<any>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [selectedItems, setSelectedItems] = useState<Record<string, { qty: number; restockPolicy: string; note: string }>>({});
    const [refundMethod, setRefundMethod] = useState('CASH');
    const [returnReason, setReturnReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ─── Status Modal ───
    const [statusModal, setStatusModal] = useState<any>(null);
    const [statusAction, setStatusAction] = useState('');
    const [adminNotes, setAdminNotes] = useState('');
    const [statusLoading, setStatusLoading] = useState(false);

    // ─── Detail Modal ───
    const [detailModal, setDetailModal] = useState<any>(null);

    const isOwner = user?.role === 'OWNER';
    const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER';
    const socket = useSocket();

    const fmt = (n: any) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ─── Load Returns ───
    const loadReturns = async () => {
        if (!token) return;
        try {
            const query: Record<string, string> = {};
            if (selectedBranchId) query.branchId = selectedBranchId;
            if (filter.status) query.status = filter.status;
            if (filter.dateFrom) query.dateFrom = filter.dateFrom;
            if (filter.dateTo) query.dateTo = filter.dateTo;
            const data = await returnsApi.posFindAll(token, query);
            setReturns(Array.isArray(data) ? data : []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadReturns(); }, [token, selectedBranchId, filter]);
    useEffect(() => {
        if (!socket) return;
        const unsub1 = socket.on('return.created', () => loadReturns());
        const unsub2 = socket.on('return.completed', () => loadReturns());
        return () => { unsub1(); unsub2(); };
    }, [socket]);

    // ─── Auto-open return from ?invoice= query ───
    const searchParams = useSearchParams();
    const [autoInvoiceHandled, setAutoInvoiceHandled] = useState(false);
    useEffect(() => {
        if (autoInvoiceHandled || !token) return;
        const invoiceParam = searchParams.get('invoice');
        if (invoiceParam) {
            setAutoInvoiceHandled(true);
            setShowNewReturn(true);
            setInvoiceSearch(invoiceParam);
            // Auto-search after a short delay to let state settle
            setTimeout(async () => {
                try {
                    setPreviewLoading(true);
                    setPreviewError('');
                    const data = await returnsApi.posPreview(token, invoiceParam);
                    setPreview(data);
                } catch (err: any) {
                    setPreviewError(err.message || 'Invoice not found');
                } finally {
                    setPreviewLoading(false);
                }
            }, 100);
        }
    }, [token, searchParams, autoInvoiceHandled]);

    // ─── Invoice Preview ───
    const searchInvoice = async () => {
        if (!token || !invoiceSearch.trim()) return;
        setPreviewLoading(true);
        setPreviewError('');
        setPreview(null);
        setSelectedItems({});
        try {
            const data = await returnsApi.posPreview(token, invoiceSearch.trim());
            setPreview(data);
        } catch (err: any) {
            setPreviewError(err.message || 'Invoice not found');
        }
        setPreviewLoading(false);
    };

    // ─── Toggle Item Selection ───
    const toggleItem = (saleItemId: string, maxQty: number) => {
        setSelectedItems(prev => {
            if (prev[saleItemId]) {
                const copy = { ...prev };
                delete copy[saleItemId];
                return copy;
            }
            return { ...prev, [saleItemId]: { qty: 1, restockPolicy: 'RESTOCK', note: '' } };
        });
    };

    const updateItemField = (saleItemId: string, field: string, value: any) => {
        setSelectedItems(prev => ({
            ...prev,
            [saleItemId]: { ...prev[saleItemId], [field]: value },
        }));
    };

    // ─── Calculate Refund Total ───
    const calculateRefundTotal = () => {
        if (!preview) return 0;
        let total = 0;
        for (const [saleItemId, sel] of Object.entries(selectedItems)) {
            const item = preview.items.find((i: any) => i.saleItemId === saleItemId);
            if (item) total += item.unitPrice * sel.qty;
        }
        return total;
    };

    // ─── Submit Return ───
    const submitReturn = async () => {
        if (!token || Object.keys(selectedItems).length === 0) return;
        setSubmitting(true);
        try {
            const items = Object.entries(selectedItems).map(([saleItemId, sel]) => ({
                saleItemId,
                qty: sel.qty,
                restockPolicy: sel.restockPolicy,
                note: sel.note || undefined,
            }));
            await returnsApi.posCreate(token, {
                invoiceNo: preview.invoiceNumber,
                items,
                refundMethod,
                reason: returnReason || undefined,
            });
            setShowNewReturn(false);
            setPreview(null);
            setSelectedItems({});
            setInvoiceSearch('');
            setReturnReason('');
            loadReturns();
        } catch (err: any) {
            toast.error(err.message || 'Failed to create return');
        }
        setSubmitting(false);
    };

    // ─── Update Status ───
    const handleStatusUpdate = async () => {
        if (!token || !statusModal || !statusAction) return;
        setStatusLoading(true);
        try {
            await returnsApi.posUpdateStatus(token, statusModal.id, {
                status: statusAction,
                adminNotes: adminNotes || undefined,
            });
            setStatusModal(null);
            setStatusAction('');
            setAdminNotes('');
            loadReturns();
        } catch (err: any) {
            toast.error(err.message || 'Failed to update status');
        }
        setStatusLoading(false);
    };

    // ─── View Detail ───
    const viewDetail = async (id: string) => {
        if (!token) return;
        try {
            const data = await returnsApi.posFindOne(token, id);
            setDetailModal(data);
        } catch (err: any) {
            toast.error(err.message || 'Failed to load return details');
        }
    };

    // ─── Badges ───
    const statusBadge = (status: string) => {
        const map: Record<string, { cls: string; label: string }> = {
            REQUESTED: { cls: 'badge-gold', label: t('returns.statusPending') },
            APPROVED: { cls: 'badge-blue', label: t('returns.statusApproved') },
            COMPLETED: { cls: 'badge-green', label: t('returns.statusCompleted') },
            REJECTED: { cls: 'badge-red', label: t('returns.statusRejected') },
        };
        const b = map[status] || { cls: '', label: status };
        return <span className={`badge ${b.cls}`}>{b.label}</span>;
    };

    const restockBadge = (policy: string) => {
        return policy === 'RESTOCK'
            ? <span className="badge badge-green" style={{ fontSize: 10 }}>📦 Restock</span>
            : <span className="badge badge-red" style={{ fontSize: 10 }}>🗑️ Damaged</span>;
    };

    const refundBadge = (method: string) => {
        const map: Record<string, string> = { CASH: '💵 Cash', CARD: '💳 Card', TRANSFER: '🏦 Transfer', STORE_CREDIT: '🎫 Store Credit' };
        return <span className="badge badge-gold" style={{ fontSize: 10 }}>{map[method] || method}</span>;
    };

    // ─── Print Return Receipt ───
    const printReturnReceipt = (ret: any) => {
        const w = window.open('', '_blank', 'width=400,height=600');
        if (!w) return;
        const items = (ret.items || []).map((i: any) => {
            const v = i.variant;
            const desc = (v?.product?.name || '') + (v?.size ? ` ${v.size}` : '') + (v?.color ? ` ${v.color}` : '');
            return `<tr><td>${desc}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${fmt(i.unitPrice)}</td><td style="text-align:right">${fmt(i.lineRefundTotal)}</td></tr>`;
        }).join('');
        w.document.write(`<html><head><title>Return ${ret.returnReceiptNo}</title>
      <style>body{font-family:monospace;font-size:12px;padding:10px;max-width:420px;margin:0 auto}
      table{width:100%;border-collapse:collapse}td,th{padding:4px;text-align:left;border-bottom:1px dashed #ccc}
      .center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:8px 0}
      @media print{button{display:none}}</style></head><body>
      <div class="center"><h2>Outlet Master</h2><p>RETURN RECEIPT</p></div>
      <div class="line"></div>
      <p>Return #: <span class="bold">${ret.returnReceiptNo}</span></p>
      <p>Original Invoice: <span class="bold">${ret.originalSale?.invoiceNumber || '—'}</span></p>
      <p>Date: ${new Date(ret.createdAt || ret.updatedAt).toLocaleString()}</p>
      <p>Status: ${ret.status}</p>
      <p>Refund Method: ${ret.refundMethod || '—'}</p>
      <div class="line"></div>
      <table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Refund</th></tr>${items}</table>
      <div class="line"></div>
      <p class="bold" style="font-size:16px">Total Refund: ${fmt(ret.refundAmount)} LYD</p>
      ${ret.reason ? `<p>Reason: ${ret.reason}</p>` : ''}
      <div class="line"></div>
      <p class="center" style="font-size:10px;color:#999">Return processed by ${ret.processor?.fullName || 'Staff'}</p>
      <button onclick="window.print()" style="width:100%;padding:8px;margin-top:10px;cursor:pointer">🖨️ Print</button>
      </body></html>`);
        w.document.close();
    };

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{t('common.loading')}</div>;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22 }}>↩️ {t('returns.title')}</h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}></p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowNewReturn(true)}>
                    {t('returns.newReturn')}
                </button>
            </div>

            {/* Filters */}
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
                            placeholder={t('returns.th.invoice') + ' / ' + t('dashboard.branch') + '...'}
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

                <select className="branch-selector" value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
                    <option value="">{t('returns.allStatuses')}</option>
                    <option value="REQUESTED">{t('returns.statusPending')}</option>
                    <option value="APPROVED">{t('returns.statusApproved')}</option>
                    <option value="COMPLETED">{t('returns.statusCompleted')}</option>
                    <option value="REJECTED">{t('returns.statusRejected')}</option>
                </select>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: 12, width: 140 }}
                        value={filter.dateFrom} onChange={e => setFilter({ ...filter, dateFrom: e.target.value })} />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
                    <input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: 12, width: 140 }}
                        value={filter.dateTo} onChange={e => setFilter({ ...filter, dateTo: e.target.value })} />
                </div>
                <span style={{ marginInlineStart: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>{returns.length} {t('returns.title')}</span>
            </div>

            {/* Returns Table */}
            <div className="card">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>{t('returns.title')}</th>
                                <th>{t('returns.th.invoice')}</th>
                                <th>{t('returns.th.date')}</th>
                                <th>{t('dashboard.branch')}</th>
                                <th>{t('returns.th.items')}</th>
                                <th>{t('returns.th.refund')}</th>
                                <th>{t('returns.refundMethod')}</th>
                                <th>{t('returns.th.status')}</th>
                                <th>{t('returns.th.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {returns.filter(ret => {
                                if (!search.trim()) return true;
                                const q = search.toLowerCase();
                                return (ret.returnReceiptNo || '').toLowerCase().includes(q)
                                    || (ret.originalSale?.invoiceNumber || '').toLowerCase().includes(q)
                                    || (ret.branch?.name || '').toLowerCase().includes(q);
                            }).map(ret => (
                                <Fragment key={ret.id}>
                                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === ret.id ? null : ret.id)}>
                                        <td><span className="badge badge-blue">{ret.returnReceiptNo || '—'}</span></td>
                                        <td><span className="badge badge-gold">{ret.originalSale?.invoiceNumber || '—'}</span></td>
                                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(ret.createdAt).toLocaleString()}</td>
                                        <td>{ret.branch?.name || '—'}</td>
                                        <td>{ret.items?.length || 0}</td>
                                        <td style={{ fontWeight: 700, color: 'var(--red)' }}>-{fmt(ret.refundAmount)} {t('common.lyd')}</td>
                                        <td>{ret.refundMethod ? refundBadge(ret.refundMethod) : '—'}</td>
                                        <td>{statusBadge(ret.status)}</td>
                                        <td onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn-secondary btn-sm" onClick={() => viewDetail(ret.id)} title="View Details">👁️</button>
                                                <button className="btn btn-secondary btn-sm" onClick={() => printReturnReceipt(ret)} title="Print Return Receipt">🖨️</button>
                                                {canManage && ret.status === 'REQUESTED' && (
                                                    <>
                                                        <button className="btn btn-sm" onClick={() => { setStatusModal(ret); setStatusAction('APPROVED'); }} title="Approve"
                                                            style={{ background: 'rgba(46,204,113,0.15)', border: '1px solid var(--green)', color: 'var(--green)' }}>✅</button>
                                                        <button className="btn btn-sm" onClick={() => { setStatusModal(ret); setStatusAction('REJECTED'); }} title="Reject"
                                                            style={{ background: 'rgba(231,76,60,0.15)', border: '1px solid var(--red)', color: 'var(--red)' }}>❌</button>
                                                    </>
                                                )}
                                                {canManage && ret.status === 'APPROVED' && (
                                                    <button className="btn btn-sm" onClick={() => { setStatusModal(ret); setStatusAction('COMPLETED'); }} title="Complete Return"
                                                        style={{ background: 'rgba(52,152,219,0.15)', border: '1px solid var(--blue)', color: 'var(--blue)' }}>🏁</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {/* Expanded row */}
                                    {expanded === ret.id && (
                                        <tr>
                                            <td colSpan={9} style={{ padding: 0, background: 'var(--bg-tertiary)' }}>
                                                <div style={{ padding: 16 }}>
                                                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
                                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('returns.processedBy')}</span><br />{ret.processor?.fullName || '—'}</div>
                                                        {ret.approver && <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('returns.approvedBy')}</span><br />{ret.approver.fullName}</div>}
                                                        {ret.reason && <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('returns.reasonLabel')}</span><br />{ret.reason}</div>}
                                                    </div>
                                                    <table>
                                                        <thead>
                                                            <tr>
                                                                <th>{t('returns.product')}</th><th>{t('sales.size')}</th><th>{t('sales.color')}</th><th>{t('returns.qtyReturned')}</th>
                                                                <th>{t('returns.unitPrice')}</th><th>{t('returns.refund')}</th><th>{t('returns.restockLabel')}</th><th>{t('returns.noteLabel')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(ret.items || []).map((item: any) => {
                                                                const v = item.variant;
                                                                return (
                                                                    <tr key={item.id}>
                                                                        <td>{v?.product?.name || '—'}</td>
                                                                        <td>{v?.size || '—'}</td>
                                                                        <td>{v?.color || '—'}</td>
                                                                        <td>{item.quantity}</td>
                                                                        <td>{fmt(item.unitPrice)}</td>
                                                                        <td style={{ fontWeight: 600, color: 'var(--red)' }}>-{fmt(item.lineRefundTotal)}</td>
                                                                        <td>{restockBadge(item.restockPolicy)}</td>
                                                                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.note || '—'}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                            {returns.length === 0 && (
                                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                                    {t('returns.noReturnsMsg')}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/*  NEW RETURN MODAL                                          */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {showNewReturn && (
                <div className="modal-overlay" onClick={() => setShowNewReturn(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '90vh', overflow: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ margin: 0 }}>{t('returns.newPosReturn')}</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowNewReturn(false)}>✕</button>
                        </div>

                        {/* Step 1: Search Invoice */}
                        <div style={{ marginBottom: 20 }}>
                            <label className="form-label">{t('returns.searchByInvoice')}</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    className="form-input" style={{ flex: 1 }}
                                    placeholder={t('returns.invoicePlaceholder')}
                                    value={invoiceSearch}
                                    onChange={e => setInvoiceSearch(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && searchInvoice()}
                                />
                                <button className="btn btn-primary" onClick={searchInvoice} disabled={previewLoading}>
                                    {previewLoading ? '⏳' : '🔍'} {t('returns.searchBtn')}
                                </button>
                            </div>
                            {previewError && <div style={{ color: 'var(--red)', marginTop: 8, fontSize: 13 }}>⚠️ {previewError}</div>}
                        </div>

                        {/* Step 2: Invoice Preview */}
                        {preview && (
                            <>
                                <div style={{
                                    background: 'var(--bg-tertiary)', borderRadius: 8, padding: 16, marginBottom: 20,
                                    borderInlineStart: '4px solid var(--gold)'
                                }}>
                                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('returns.invoiceLabel')}</span><br />
                                            <span className="badge badge-gold">{preview.invoiceNumber}</span></div>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('returns.branchLabel')}</span><br />{preview.branchName}</div>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('returns.cashierLabel')}</span><br />{preview.cashierName}</div>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('returns.totalLabel')}</span><br />
                                            <strong style={{ color: 'var(--gold)' }}>{fmt(preview.total)} {t('common.lyd')}</strong></div>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('returns.dateLabel')}</span><br />{new Date(preview.createdAt).toLocaleString()}</div>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('returns.paymentLabel')}</span><br />{preview.paymentMethod}</div>
                                    </div>
                                </div>

                                {/* Step 3: Select Items */}
                                <div style={{ marginBottom: 16 }}>
                                    <label className="form-label">{t('returns.selectItemsToReturn')}</label>
                                    <div className="table-container">
                                        <table>
                                            <thead>
                                                <tr style={{ fontSize: 11 }}>
                                                    <th style={{ width: 40 }}>✓</th>
                                                    <th>{t('returns.product')}</th>
                                                    <th>{t('returns.sizeColor')}</th>
                                                    <th>{t('returns.sold')}</th>
                                                    <th>{t('returns.alreadyReturned')}</th>
                                                    <th>{t('returns.available')}</th>
                                                    <th>{t('returns.qtyToReturn')}</th>
                                                    <th>{t('returns.restockPolicy')}</th>
                                                    <th>{t('returns.noteLabel')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.items.map((item: any) => {
                                                    const isSelected = !!selectedItems[item.saleItemId];
                                                    const selData = selectedItems[item.saleItemId];
                                                    const available = item.qtyAvailableToReturn;
                                                    return (
                                                        <tr key={item.saleItemId} style={{
                                                            opacity: available === 0 ? 0.4 : 1,
                                                            background: isSelected ? 'rgba(212,175,55,0.08)' : undefined,
                                                        }}>
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    disabled={available === 0}
                                                                    onChange={() => toggleItem(item.saleItemId, available)}
                                                                    style={{ width: 18, height: 18, cursor: available > 0 ? 'pointer' : 'not-allowed' }}
                                                                />
                                                            </td>
                                                            <td>
                                                                <div style={{ fontWeight: 600 }}>{item.productName}</div>
                                                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.sku}</div>
                                                            </td>
                                                            <td style={{ fontSize: 12 }}>
                                                                {item.size || '—'} / {item.color || '—'}
                                                            </td>
                                                            <td>{item.qtySold}</td>
                                                            <td style={{ color: item.qtyReturned > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                                                                {item.qtyReturned}
                                                            </td>
                                                            <td style={{ fontWeight: 700, color: available > 0 ? 'var(--green)' : 'var(--red)' }}>
                                                                {available}
                                                            </td>
                                                            <td>
                                                                {isSelected && (
                                                                    <input
                                                                        type="number" min={1} max={available}
                                                                        className="form-input" style={{ width: 60, padding: '4px 6px', textAlign: 'center', fontSize: 13 }}
                                                                        value={selData.qty}
                                                                        onChange={e => {
                                                                            const v = Math.min(Math.max(1, parseInt(e.target.value) || 1), available);
                                                                            updateItemField(item.saleItemId, 'qty', v);
                                                                        }}
                                                                    />
                                                                )}
                                                            </td>
                                                            <td>
                                                                {isSelected && (
                                                                    <select
                                                                        className="form-input" style={{ padding: '4px 6px', fontSize: 12, width: 110 }}
                                                                        value={selData.restockPolicy}
                                                                        onChange={e => updateItemField(item.saleItemId, 'restockPolicy', e.target.value)}
                                                                    >
                                                                        <option value="RESTOCK">{t('returns.restock')}</option>
                                                                        <option value="DAMAGED">{t('returns.damaged')}</option>
                                                                    </select>
                                                                )}
                                                            </td>
                                                            <td>
                                                                {isSelected && (
                                                                    <input
                                                                        className="form-input" style={{ width: 100, padding: '4px 6px', fontSize: 11 }}
                                                                        placeholder={t('returns.optionalNote')}
                                                                        value={selData.note}
                                                                        onChange={e => updateItemField(item.saleItemId, 'note', e.target.value)}
                                                                    />
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Step 4: Refund Info */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                    <div className="form-group">
                                        <label className="form-label">{t('returns.refundMethod')}</label>
                                        <select className="form-input" value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                                            <option value="CASH">{t('returns.cashRefund')}</option>
                                            <option value="CARD">{t('returns.cardRefund')}</option>
                                            <option value="TRANSFER">{t('returns.bankTransferRefund')}</option>
                                            <option value="STORE_CREDIT">{t('returns.storeCredit')}</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('returns.reasonOptional')}</label>
                                        <input className="form-input" value={returnReason} onChange={e => setReturnReason(e.target.value)}
                                            placeholder={t('returns.reasonPlaceholder')} />
                                    </div>
                                </div>

                                {/* Summary & Submit */}
                                {Object.keys(selectedItems).length > 0 && (
                                    <div style={{
                                        background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(231,76,60,0.05))',
                                        borderRadius: 12, padding: 20, marginBottom: 16,
                                        border: '1px solid rgba(212,175,55,0.3)',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                                    {Object.keys(selectedItems).length} {t('returns.itemsSelected', { count: Object.keys(selectedItems).length })} •
                                                    {Object.values(selectedItems).reduce((s, i) => s + i.qty, 0)} {t('returns.totalUnits', { count: Object.values(selectedItems).reduce((s: number, i: any) => s + i.qty, 0) })}
                                                </div>
                                                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11 }}>
                                                    {Object.values(selectedItems).some(i => i.restockPolicy === 'RESTOCK') &&
                                                        <span style={{ color: 'var(--green)' }}>📦 {Object.values(selectedItems).filter(i => i.restockPolicy === 'RESTOCK').reduce((s, i) => s + i.qty, 0)} {t('returns.restocked')}</span>
                                                    }
                                                    {Object.values(selectedItems).some(i => i.restockPolicy === 'DAMAGED') &&
                                                        <span style={{ color: 'var(--red)' }}>🗑️ {Object.values(selectedItems).filter(i => i.restockPolicy === 'DAMAGED').reduce((s, i) => s + i.qty, 0)} {t('returns.damagedCount')}</span>
                                                    }
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'end' }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('returns.refundTotal')}</div>
                                                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--red)' }}>-{fmt(calculateRefundTotal())} {t('common.lyd')}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNewReturn(false)}>{t('common.cancel')}</button>
                                    <button
                                        className="btn btn-primary" style={{ flex: 2 }}
                                        onClick={submitReturn}
                                        disabled={submitting || Object.keys(selectedItems).length === 0}
                                    >
                                        {submitting ? t('returns.processing') : `${t('returns.submitReturnBtn')} (-${fmt(calculateRefundTotal())} ${t('common.lyd')})`}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/*  STATUS UPDATE MODAL                                       */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {statusModal && (
                <div className="modal-overlay" onClick={() => setStatusModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <h2>
                            {statusAction === 'APPROVED' && t('returns.approveReturn')}
                            {statusAction === 'REJECTED' && t('returns.rejectReturn')}
                            {statusAction === 'COMPLETED' && t('returns.completeReturn')}
                        </h2>
                        <div style={{ marginBottom: 16 }}>
                            <span className="badge badge-blue">{statusModal.returnReceiptNo}</span>
                            <span style={{ marginInlineStart: 8 }}>{t('returns.refundLabel')} <strong style={{ color: 'var(--red)' }}>-{fmt(statusModal.refundAmount)} {t('common.lyd')}</strong></span>
                        </div>
                        {statusAction === 'COMPLETED' && (
                            <div style={{
                                background: 'rgba(52,152,219,0.1)', padding: 12, borderRadius: 8, marginBottom: 16,
                                fontSize: 12, color: 'var(--blue)', border: '1px solid rgba(52,152,219,0.3)',
                            }}>
                                {t('returns.completionInfo')}
                                <ul style={{ margin: '4px 0 0', paddingInlineStart: 20 }}>
                                    <li>{t('returns.updateSaleItems')}</li>
                                    <li>{t('returns.restockInventory')}</li>
                                    <li>{t('returns.logStockMovements')}</li>
                                    <li>{t('returns.updateSaleStatus')}</li>
                                </ul>
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">{t('returns.adminNotes')}</label>
                            <input className="form-input" value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                                placeholder={t('returns.adminNotesPlaceholder')} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStatusModal(null)}>{t('common.cancel')}</button>
                            <button
                                className="btn btn-primary" style={{ flex: 1 }}
                                onClick={handleStatusUpdate}
                                disabled={statusLoading}
                            >
                                {statusLoading ? '⏳' : t('returns.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/*  DETAIL MODAL                                              */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {detailModal && (
                <div className="modal-overlay" onClick={() => setDetailModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h2 style={{ margin: 0 }}>{t('returns.returnDetails')}</h2>
                            <span className="badge badge-blue" style={{ fontSize: 14 }}>{detailModal.returnReceiptNo}</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('returns.status')}</div>
                                <div style={{ marginTop: 4 }}>{statusBadge(detailModal.status)}</div>
                            </div>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('returns.refund')}</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>-{fmt(detailModal.refundAmount)} {t('common.lyd')}</div>
                            </div>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('returns.method')}</div>
                                <div style={{ marginTop: 4 }}>{detailModal.refundMethod ? refundBadge(detailModal.refundMethod) : '—'}</div>
                            </div>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('returns.originalInvoice')}</div>
                                <div style={{ marginTop: 4 }}>
                                    <span className="badge badge-gold">{detailModal.originalSale?.invoiceNumber || '—'}</span>
                                </div>
                            </div>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('returns.processedBy')}</div>
                                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{detailModal.processor?.fullName || '—'}</div>
                            </div>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('returns.date')}</div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>{new Date(detailModal.createdAt).toLocaleString()}</div>
                            </div>
                        </div>

                        {detailModal.reason && (
                            <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('returns.reasonColon')}</span> {detailModal.reason}
                            </div>
                        )}

                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr style={{ fontSize: 11 }}>
                                        <th>{t('returns.product')}</th><th>{t('returns.sizeColor')}</th><th>{t('sales.qty')}</th><th>{t('returns.unitPrice')}</th>
                                        <th>{t('returns.refund')}</th><th>{t('returns.restockLabel')}</th><th>{t('returns.noteLabel')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(detailModal.items || []).map((item: any) => {
                                        const v = item.variant;
                                        return (
                                            <tr key={item.id}>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{v?.product?.name || '—'}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{v?.sku || ''}</div>
                                                </td>
                                                <td style={{ fontSize: 12 }}>{v?.size || '—'} / {v?.color || '—'}</td>
                                                <td>{item.quantity}</td>
                                                <td>{fmt(item.unitPrice)}</td>
                                                <td style={{ fontWeight: 600, color: 'var(--red)' }}>-{fmt(item.lineRefundTotal)}</td>
                                                <td>{restockBadge(item.restockPolicy)}</td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.note || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDetailModal(null)}>{t('returns.close')}</button>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => printReturnReceipt(detailModal)}>{t('returns.printReturnReceipt')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

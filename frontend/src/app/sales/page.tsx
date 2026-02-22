'use client';
import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../lib/store';
import { salesApi } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../lib/i18n';

export default function SalesPage() {
    const { token, user, selectedBranchId } = useAuthStore();
    const [sales, setSales] = useState<any[]>([]);
    const toast = useToast();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [filter, setFilter] = useState({ paymentMethod: '', status: '', startDate: '', endDate: '' });
    const [search, setSearch] = useState('');
    const [deliveryModal, setDeliveryModal] = useState<any>(null);
    const [deliveryNote, setDeliveryNote] = useState('');
    const [deliveryLogs, setDeliveryLogs] = useState<any[]>([]);
    const [showLogs, setShowLogs] = useState<string | null>(null);
    const [accountingModal, setAccountingModal] = useState<any>(null);
    const [accountingLoading, setAccountingLoading] = useState(false);
    // Feature A: Bank transfer
    const [bankTransferModal, setBankTransferModal] = useState<any>(null);
    const [bankTransferNote, setBankTransferNote] = useState('');
    const [bankTransferLogs, setBankTransferLogs] = useState<any[]>([]);
    const [showBankLogs, setShowBankLogs] = useState<string | null>(null);

    const isOwner = user?.role === 'OWNER';
    const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER';
    const router = useRouter();

    const socket = useSocket();

    const loadSales = async () => {
        if (!token) return;
        const params = new URLSearchParams();
        if (selectedBranchId) params.set('branchId', selectedBranchId);
        if (filter.paymentMethod) params.set('paymentMethod', filter.paymentMethod);
        if (filter.status) params.set('status', filter.status);
        if (filter.startDate) params.set('startDate', filter.startDate);
        if (filter.endDate) params.set('endDate', filter.endDate);
        try {
            const data = await salesApi.findAll(token, params.toString());
            setSales(Array.isArray(data) ? data : (data as any).sales || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadSales(); }, [token, selectedBranchId, filter]);
    useEffect(() => {
        if (!socket) return;
        const unsub = socket.on('sale.created', () => loadSales());
        return unsub;
    }, [socket]);

    // ─── Bank Transfer Status ───
    const handleBankTransferStatus = async (saleId: string, status: string) => {
        if (!token) return;
        try {
            await salesApi.updateTransferStatus(token, saleId, status, bankTransferNote);
            setBankTransferModal(null);
            setBankTransferNote('');
            loadSales();
        } catch (err: any) { toast.error(err.message); }
    };

    const loadBankTransferLogs = async (saleId: string) => {
        if (!token) return;
        const logs = await salesApi.bankTransferLogs(token, saleId);
        setBankTransferLogs(logs);
        setShowBankLogs(saleId);
    };

    // ─── Delivery Status ───
    const handleDeliveryStatus = async (saleId: string, status: string) => {
        if (!token) return;
        try {
            await salesApi.updateDeliveryStatus(token, saleId, status, deliveryNote);
            setDeliveryModal(null);
            setDeliveryNote('');
            loadSales();
        } catch (err: any) { toast.error(err.message); }
    };

    const loadDeliveryLogs = async (saleId: string) => {
        if (!token) return;
        const logs = await salesApi.deliveryLogs(token, saleId);
        setDeliveryLogs(logs);
        setShowLogs(saleId);
    };

    const printReceipt = (sale: any) => {
        const w = window.open('', '_blank', 'width=400,height=700');
        if (!w) return;
        // Customer receipt: NO cost, NO profit, NO USD rates, NO purchase info
        const items = (sale.items || []).map((i: any) => {
            const v = i.variant;
            const desc = (v?.product?.name || '') + (v?.size ? ` ${v.size}` : '') + (v?.color ? ` ${v.color}` : '');
            return `<tr><td>${desc}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${fmt(i.unitPrice)}</td><td style="text-align:right">${fmt(i.lineTotal)}</td></tr>`;
        }).join('');
        w.document.write(`<html><head><title>Receipt ${sale.invoiceNumber}</title>
      <style>body{font-family:monospace;font-size:12px;padding:10px;max-width:420px;margin:0 auto}
      table{width:100%;border-collapse:collapse}td,th{padding:4px;text-align:left;border-bottom:1px dashed #ccc}
      th:nth-child(2),th:nth-child(3),th:nth-child(4){text-align:right}
      .center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:8px 0}
      @media print{button{display:none}}</style></head><body>
      <div class="center"><h2>Outlet Master</h2><p>${sale.branch?.name || ''}</p></div>
      <div class="line"></div>
      <p>Invoice: <span class="bold">${sale.invoiceNumber}</span></p>
      <p>Date: ${new Date(sale.createdAt).toLocaleString()}</p>
      <p>Cashier: ${sale.cashier?.fullName || ''}</p>
      <p>Payment: ${sale.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : sale.paymentMethod}</p>
      <div class="line"></div>
      <table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${items}</table>
      <div class="line"></div>
      <p>Subtotal: ${fmt(sale.subtotal)} LYD</p>
      ${Number(sale.discountAmount) > 0 ? `<p>Discount: -${fmt(sale.discountAmount)} LYD (${sale.discountPercent}%)</p>` : ''}
      <p class="bold" style="font-size:16px">Total: ${fmt(sale.total)} LYD</p>
      ${sale.paymentMethod === 'DELIVERY' ? `<p>Delivery Status: ${sale.deliveryPaidStatus || 'N/A'}</p>` : ''}
      ${sale.paymentMethod === 'BANK_TRANSFER' ? `<p>Transfer Status: ${sale.transferPaymentStatus || 'PENDING'}</p>` : ''}
      ${sale.customerName ? `<p>Customer: ${sale.customerName} ${sale.customerPhone ? `(${sale.customerPhone})` : ''}</p>` : ''}
      ${sale.deliveryAddress ? `<p>Address: ${sale.deliveryCity ? sale.deliveryCity + ', ' : ''}${sale.deliveryAddress}</p>` : ''}
      ${sale.notes ? `<p>Notes: ${sale.notes}</p>` : ''}
      <div class="line"></div>
      <p class="center">Thank you for your purchase!</p>
      <p class="center" style="font-size:10px;color:#999;margin-top:4px">شكرا لزيارتكم</p>
      <button onclick="window.print()" style="width:100%;padding:8px;margin-top:10px;cursor:pointer">🖨️ Print</button>
      </body></html>`);
        w.document.close();
    };

    // ─── CSV Export (Feature F) ───
    const exportCSV = () => {
        const rows = [['Invoice', 'Date', 'Branch', 'Cashier', 'Items', 'Subtotal', 'Discount', 'Total', 'Payment', 'Status', 'Delivery Status', 'Transfer Status', 'Customer', 'Phone', 'City']];
        for (const s of sales) {
            rows.push([
                s.invoiceNumber, new Date(s.createdAt).toLocaleString(),
                s.branch?.name || '', s.cashier?.fullName || '',
                String(s.items?.length || 0),
                String(s.subtotal), String(s.discountAmount), String(s.total),
                s.paymentMethod, s.status,
                s.deliveryPaidStatus || '', s.transferPaymentStatus || '',
                s.customerName || '', s.customerPhone || '', s.deliveryCity || '',
            ]);
        }
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales_${filter.startDate || 'all'}_${filter.endDate || 'all'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const fmt = (n: any) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const openAccounting = async (saleId: string) => {
        if (!token) return;
        setAccountingLoading(true);
        try {
            const full = await salesApi.findOne(token, saleId);
            setAccountingModal(full);
        } catch (err: any) {
            toast.error('Failed to load accounting data: ' + (err.message || 'Access denied'));
        } finally {
            setAccountingLoading(false);
        }
    };

    const statusBadge = (status: string) => {
        const map: Record<string, string> = { COMPLETED: 'badge-green', PARTIAL_RETURN: 'badge-gold', REFUNDED: 'badge-red' };
        return <span className={`badge ${map[status] || 'badge-blue'}`}>{status}</span>;
    };
    const paymentBadge = (pm: string) => {
        const map: Record<string, string> = { CASH: 'badge-green', CARD: 'badge-blue', DELIVERY: 'badge-purple', BANK_TRANSFER: 'badge-gold' };
        return <span className={`badge ${map[pm] || 'badge-gold'}`}>{pm === 'BANK_TRANSFER' ? '🏦 BANK' : pm}</span>;
    };
    const deliveryBadge = (ds: string) => {
        const map: Record<string, string> = { PAID: 'badge-green', UNPAID: 'badge-red', PENDING: 'badge-gold' };
        return <span className={`badge ${map[ds] || ''}`}>{ds === 'PAID' ? t('sales.paidFull') : ds === 'UNPAID' ? t('sales.returned') : t('sales.statusPending')}</span>;
    };
    const transferBadge = (ts: string) => {
        const map: Record<string, string> = { PENDING: 'badge-gold', CONFIRMED: 'badge-green', REJECTED: 'badge-red' };
        return <span className={`badge ${map[ts] || 'badge-gold'}`}>{ts === 'CONFIRMED' ? '✅ Confirmed' : ts === 'REJECTED' ? '❌ Rejected' : '⏳ Pending'}</span>;
    };

    // Quick date range helpers
    const setDateRange = (range: string) => {
        const today = new Date().toISOString().slice(0, 10);
        if (range === 'today') setFilter({ ...filter, startDate: today, endDate: today });
        else if (range === 'week') {
            const d = new Date(); d.setDate(d.getDate() - 7);
            setFilter({ ...filter, startDate: d.toISOString().slice(0, 10), endDate: today });
        } else if (range === 'month') {
            const d = new Date(); d.setMonth(d.getMonth() - 1);
            setFilter({ ...filter, startDate: d.toISOString().slice(0, 10), endDate: today });
        } else setFilter({ ...filter, startDate: '', endDate: '' });
    };

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{t('common.loading')}</div>;

    return (
        <div>
            {/* Enhanced Filters (Feature F) */}
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
                            placeholder={t('sales.th.invoice') + ' / ' + t('dashboard.branch') + '...'}
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
                <select className="branch-selector" value={filter.paymentMethod} onChange={e => setFilter({ ...filter, paymentMethod: e.target.value })}>
                    <option value="">{t('sales.allPayments')}</option>
                    <option value="CASH">{t('sales.cash')}</option>
                    <option value="CARD">{t('sales.card')}</option>
                    <option value="BANK_TRANSFER">{t('sales.bankTransfer')}</option>
                    <option value="DELIVERY">{t('sales.delivery')}</option>
                </select>
                <select className="branch-selector" value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
                    <option value="">{t('sales.allStatuses')}</option>
                    <option value="COMPLETED">{t('sales.statusCompleted')}</option>
                    <option value="PARTIAL_RETURN">{t('sales.statusRefunded')}</option>
                    <option value="REFUNDED">{t('sales.statusRefunded')}</option>
                </select>
                {/* Date Range (Feature F) */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: 12, width: 140 }}
                        value={filter.startDate} onChange={e => setFilter({ ...filter, startDate: e.target.value })} />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
                    <input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: 12, width: 140 }}
                        value={filter.endDate} onChange={e => setFilter({ ...filter, endDate: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {[{ label: 'Today', value: 'today' }, { label: '7d', value: 'week' }, { label: '30d', value: 'month' }, { label: 'All', value: '' }].map(r => (
                        <button key={r.value} className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '4px 8px' }}
                            onClick={() => setDateRange(r.value)}>{r.label}</button>
                    ))}
                </div>
                <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{sales.length} {t('sales.invoice')}</span>
                    <button className="btn btn-secondary btn-sm" onClick={exportCSV} title={t('common.export')}>📥 {t('common.export')}</button>
                </div>
            </div>

            {/* Sales Table */}
            <div className="card">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>{t('sales.th.invoice')}</th>
                                <th>{t('sales.th.date')}</th>
                                <th>{t('dashboard.branch')}</th>
                                <th>{t('sales.th.employee')}</th>
                                <th>{t('sales.th.items')}</th>
                                <th>{t('sales.th.total')}</th>
                                <th>{t('sales.th.payment')}</th>
                                <th>{t('sales.th.status')}</th>
                                <th>{t('sales.th.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sales.filter(sale => {
                                if (!search.trim()) return true;
                                const q = search.toLowerCase();
                                return (sale.invoiceNumber || '').toLowerCase().includes(q)
                                    || (sale.branch?.name || '').toLowerCase().includes(q)
                                    || (sale.cashier?.fullName || '').toLowerCase().includes(q);
                            }).map(sale => (
                                <Fragment key={sale.id}>
                                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === sale.id ? null : sale.id)}>
                                        <td><span className="badge badge-gold">{sale.invoiceNumber}</span></td>
                                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(sale.createdAt).toLocaleString()}</td>
                                        <td>{sale.branch?.name || '—'}</td>
                                        <td>{sale.cashier?.fullName || '—'}</td>
                                        <td>{sale.items?.length || 0}</td>
                                        <td style={{ fontWeight: 700, color: 'var(--gold)' }}>{fmt(sale.total)} LYD</td>
                                        <td>{paymentBadge(sale.paymentMethod)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                                {statusBadge(sale.status)}
                                                {sale.paymentMethod === 'DELIVERY' && deliveryBadge(sale.deliveryPaidStatus)}
                                                {sale.paymentMethod === 'BANK_TRANSFER' && transferBadge(sale.transferPaymentStatus)}
                                            </div>
                                        </td>
                                        <td onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-secondary btn-sm" onClick={() => printReceipt(sale)} title={t('sales.printReceipt')}>🖨️</button>
                                                {isOwner && (
                                                    <button className="btn btn-secondary btn-sm" onClick={() => openAccounting(sale.id)} title={t('sales.accountingDetails')}
                                                        disabled={accountingLoading}
                                                        style={{ background: 'rgba(212,175,55,0.15)', borderColor: 'var(--gold)' }}>📊</button>
                                                )}
                                                {sale.status !== 'VOIDED' && canManage && (
                                                    <button className="btn btn-secondary btn-sm" onClick={() => router.push(`/returns?invoice=${encodeURIComponent(sale.invoiceNumber)}`)} title={t('sales.processReturn')}
                                                        style={{ background: 'rgba(155,89,182,0.15)', borderColor: '#9b59b6', color: '#9b59b6' }}>↩️</button>
                                                )}
                                                {sale.paymentMethod === 'DELIVERY' && canManage && (
                                                    <button className="btn btn-secondary btn-sm" onClick={() => setDeliveryModal(sale)} title={t('sales.updateDelivery')}>💰</button>
                                                )}
                                                {sale.paymentMethod === 'DELIVERY' && canManage && (
                                                    <button className="btn btn-secondary btn-sm" onClick={() => loadDeliveryLogs(sale.id)} title={t('sales.deliveryLogs')}>📋</button>
                                                )}
                                                {sale.paymentMethod === 'BANK_TRANSFER' && canManage && (
                                                    <button className="btn btn-secondary btn-sm" onClick={() => setBankTransferModal(sale)} title={t('sales.updateTransfer')}
                                                        style={{ background: 'rgba(212,175,55,0.15)', borderColor: 'var(--gold)' }}>🏦</button>
                                                )}
                                                {sale.paymentMethod === 'BANK_TRANSFER' && canManage && (
                                                    <button className="btn btn-secondary btn-sm" onClick={() => loadBankTransferLogs(sale.id)} title={t('sales.transferLogs')}>📋</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {/* Expanded Details */}
                                    {expanded === sale.id && (
                                        <tr key={`${sale.id}-detail`}>
                                            <td colSpan={9} style={{ padding: 0, background: 'var(--bg-tertiary)' }}>
                                                <div style={{ padding: 16 }}>
                                                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.subtotal')}</span><br />{fmt(sale.subtotal)} {t('common.lyd')}</div>
                                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.discount')}</span><br />{fmt(sale.discountAmount)} {t('common.lyd')} ({sale.discountPercent}%)</div>
                                                        {(sale.paymentMethod === 'DELIVERY' || sale.paymentMethod === 'BANK_TRANSFER') && (
                                                            <>
                                                                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.paidAmount')}</span><br />{fmt(sale.paidAmount)} {t('common.lyd')}</div>
                                                                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.remaining')}</span><br /><span style={{ color: Number(sale.remainingAmount) > 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(sale.remainingAmount)} {t('common.lyd')}</span></div>
                                                            </>
                                                        )}
                                                        {sale.paymentMethod === 'BANK_TRANSFER' && (
                                                            <>
                                                                {sale.transferBankName && <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.bank')}</span><br />{sale.transferBankName}</div>}
                                                                {sale.transferReference && <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.refNum')}</span><br />{sale.transferReference}</div>}
                                                            </>
                                                        )}
                                                        {sale.customerName && <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.customerLabel')}</span><br />{sale.customerName}</div>}
                                                        {sale.customerPhone && <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.phoneLabel')}</span><br />{sale.customerPhone}</div>}
                                                        {sale.deliveryAddress && <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.addressLabel')}</span><br />{sale.deliveryCity ? sale.deliveryCity + ', ' : ''}{sale.deliveryAddress}</div>}
                                                        {sale.deliveryCompany && <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.deliveryCo')}</span><br />{sale.deliveryCompany}</div>}
                                                        {sale.deliveryFee && <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.deliveryFee')}</span><br />{fmt(sale.deliveryFee)} {t('common.lyd')}</div>}
                                                        {sale.notes && <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.notes')}</span><br />{sale.notes}</div>}
                                                    </div>
                                                    {/* Items table — NO cost/profit data here */}
                                                    <table>
                                                        <thead>
                                                            <tr>
                                                                <th>{t('sales.sku')}</th><th>{t('sales.product')}</th><th>{t('sales.size')}</th><th>{t('sales.color')}</th><th>{t('sales.qty')}</th><th>{t('sales.unitPrice')}</th>
                                                                <th>{t('sales.lineDiscount')}</th><th>{t('sales.lineTotal')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(sale.items || []).map((item: any) => {
                                                                const v = item.variant;
                                                                return (
                                                                    <tr key={item.id}>
                                                                        <td><span className="badge badge-gold">{v?.sku || '—'}</span></td>
                                                                        <td>{v?.product?.name || '—'}</td>
                                                                        <td>{v?.size || '—'}</td>
                                                                        <td>{v?.color || '—'}</td>
                                                                        <td>{item.quantity}</td>
                                                                        <td>{fmt(item.unitPrice)}</td>
                                                                        <td>{Number(item.discount) > 0 ? `-${fmt(item.discount)}` : '—'}</td>
                                                                        <td style={{ fontWeight: 600 }}>{fmt(item.lineTotal)}</td>
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
                            {sales.length === 0 && (
                                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{t('sales.noInvoices')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── Bank Transfer Status Modal (Feature A) ─── */}
            {bankTransferModal && (
                <div className="modal-overlay" onClick={() => setBankTransferModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{t('sales.updateBankStatus')}</h2>
                        <div style={{ marginBottom: 16 }}>
                            <span className="badge badge-gold">{bankTransferModal.invoiceNumber}</span>
                            <span style={{ marginInlineStart: 8 }}>{t('sales.totalLabel')} {fmt(bankTransferModal.total)} {t('common.lyd')}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                            {bankTransferModal.transferBankName && (
                                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.bank')}</span><br />{bankTransferModal.transferBankName}</div>
                            )}
                            {bankTransferModal.transferReference && (
                                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('sales.refNum')}</span><br />{bankTransferModal.transferReference}</div>
                            )}
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            {t('sales.currentStatus')} {transferBadge(bankTransferModal.transferPaymentStatus)}
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('sales.noteOptional')}</label>
                            <input className="form-input" value={bankTransferNote} onChange={e => setBankTransferNote(e.target.value)}
                                placeholder={t('sales.notePlaceholderBank')} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setBankTransferModal(null)}>{t('common.cancel')}</button>
                            {bankTransferModal.transferPaymentStatus !== 'CONFIRMED' && (
                                <button className="btn btn-primary" style={{ flex: 1 }}
                                    onClick={() => handleBankTransferStatus(bankTransferModal.id, 'CONFIRMED')}>{t('sales.confirmTransfer')}</button>
                            )}
                            {bankTransferModal.transferPaymentStatus !== 'REJECTED' && (
                                <button className="btn btn-danger" style={{ flex: 1 }}
                                    onClick={() => handleBankTransferStatus(bankTransferModal.id, 'REJECTED')}>{t('sales.rejectTransfer')}</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Bank Transfer Logs Modal */}
            {showBankLogs && (
                <div className="modal-overlay" onClick={() => setShowBankLogs(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <h2>{t('sales.bankTransferHistory')}</h2>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr><th>{t('sales.date')}</th><th>{t('sales.oldStatus')}</th><th>{t('sales.newStatus')}</th><th>{t('sales.changedBy')}</th><th>{t('sales.note')}</th></tr>
                                </thead>
                                <tbody>
                                    {bankTransferLogs.map((log: any) => (
                                        <tr key={log.id}>
                                            <td style={{ fontSize: 12 }}>{new Date(log.changedAt).toLocaleString()}</td>
                                            <td>{log.oldStatus ? transferBadge(log.oldStatus) : '—'}</td>
                                            <td>{transferBadge(log.newStatus)}</td>
                                            <td>{log.changedByUser?.fullName || '—'}</td>
                                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.note || '—'}</td>
                                        </tr>
                                    ))}
                                    {bankTransferLogs.length === 0 && (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>{t('sales.noLogs')}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <button className="btn btn-secondary" style={{ marginTop: 16, width: '100%' }} onClick={() => setShowBankLogs(null)}>{t('sales.close')}</button>
                    </div>
                </div>
            )}

            {/* Delivery Status Modal */}
            {deliveryModal && (
                <div className="modal-overlay" onClick={() => setDeliveryModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{t('sales.updateDeliveryStatus')}</h2>
                        <div style={{ marginBottom: 16 }}>
                            <span className="badge badge-gold">{deliveryModal.invoiceNumber}</span>
                            <span style={{ marginInlineStart: 8 }}>{t('sales.totalLabel')} {fmt(deliveryModal.total)} {t('common.lyd')}</span>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            {t('sales.currentStatus')} {deliveryBadge(deliveryModal.deliveryPaidStatus)}
                        </div>
                        {deliveryModal.customerName && (
                            <div style={{ marginBottom: 12, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: 13 }}>
                                <strong>{deliveryModal.customerName}</strong>
                                {deliveryModal.customerPhone && ` • ${deliveryModal.customerPhone}`}
                                {deliveryModal.deliveryAddress && <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>{deliveryModal.deliveryCity ? deliveryModal.deliveryCity + ', ' : ''}{deliveryModal.deliveryAddress}</div>}
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">{t('sales.noteOptional')}</label>
                            <input className="form-input" value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)}
                                placeholder={t('sales.notePlaceholderDelivery')} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDeliveryModal(null)}>{t('common.cancel')}</button>
                            {deliveryModal.deliveryPaidStatus !== 'PAID' && (
                                <button className="btn btn-primary" style={{ flex: 1 }}
                                    onClick={() => handleDeliveryStatus(deliveryModal.id, 'PAID')}>{t('sales.markAsPaid')}</button>
                            )}
                            {deliveryModal.deliveryPaidStatus !== 'UNPAID' && (
                                <button className="btn btn-danger" style={{ flex: 1 }}
                                    onClick={() => handleDeliveryStatus(deliveryModal.id, 'UNPAID')}>{t('sales.markAsUnpaid')}</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delivery Logs Modal */}
            {showLogs && (
                <div className="modal-overlay" onClick={() => setShowLogs(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <h2>{t('sales.deliveryHistory')}</h2>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr><th>{t('sales.date')}</th><th>{t('sales.oldStatus')}</th><th>{t('sales.newStatus')}</th><th>{t('sales.changedBy')}</th><th>{t('sales.note')}</th></tr>
                                </thead>
                                <tbody>
                                    {deliveryLogs.map((log: any) => (
                                        <tr key={log.id}>
                                            <td style={{ fontSize: 12 }}>{new Date(log.changedAt).toLocaleString()}</td>
                                            <td>{log.oldStatus ? deliveryBadge(log.oldStatus) : '—'}</td>
                                            <td>{deliveryBadge(log.newStatus)}</td>
                                            <td>{log.changedByUser?.fullName || '—'}</td>
                                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.note || '—'}</td>
                                        </tr>
                                    ))}
                                    {deliveryLogs.length === 0 && (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>{t('sales.noLogs')}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <button className="btn btn-secondary" style={{ marginTop: 16, width: '100%' }} onClick={() => setShowLogs(null)}>{t('sales.close')}</button>
                    </div>
                </div>
            )}

            {/* ─── OWNER-ONLY ACCOUNTING MODAL ─── */}
            {accountingModal && (
                <div className="modal-overlay" onClick={() => setAccountingModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '90vh', overflow: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h2 style={{ margin: 0 }}>{t('sales.accountingTitle')}</h2>
                            <span className="badge badge-gold" style={{ fontSize: 14 }}>{accountingModal.invoiceNumber}</span>
                        </div>

                        {/* Sale-level summary */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('sales.revenue')}</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>{fmt(accountingModal.total)} {t('common.lyd')}</div>
                            </div>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('sales.totalCost')}</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)' }}>
                                    {fmt((accountingModal.items || []).reduce((s: number, i: any) => s + Number(i.unitCost || 0) * Number(i.quantity), 0))} LYD
                                </div>
                            </div>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('sales.netProfit')}</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: Number(accountingModal.profit) > 0 ? 'var(--green)' : 'var(--red)' }}>
                                    {fmt(accountingModal.profit)} LYD
                                </div>
                            </div>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('sales.usdRateAtSale')}</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>
                                    {accountingModal.usdRateAtSale || '—'}
                                </div>
                            </div>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('sales.discount')}</div>
                                <div style={{ fontSize: 18, fontWeight: 700 }}>
                                    {Number(accountingModal.discountAmount) > 0 ? `${fmt(accountingModal.discountAmount)} LYD (${accountingModal.discountPercent}%)` : '—'}
                                </div>
                            </div>
                            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('sales.date')}</div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(accountingModal.createdAt).toLocaleString()}</div>
                            </div>
                        </div>

                        {/* Per-item cost breakdown */}
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr style={{ fontSize: 11 }}>
                                        <th>{t('sales.sku')}</th>
                                        <th>{t('sales.product')}</th>
                                        <th>{t('sales.qty')}</th>
                                        <th>{t('sales.salePrice')}</th>
                                        <th>{t('sales.costUsd')}</th>
                                        <th>{t('sales.purchaseRate')}</th>
                                        <th>{t('sales.costLyd')}</th>
                                        <th>{t('sales.purchaseDate')}</th>
                                        <th>{t('sales.lineTotal')}</th>
                                        <th>{t('sales.lineProfit')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(accountingModal.items || []).map((item: any) => {
                                        const v = item.variant;
                                        return (
                                            <tr key={item.id}>
                                                <td><span className="badge badge-gold" style={{ fontSize: 10 }}>{v?.sku || '—'}</span></td>
                                                <td>
                                                    <div>{v?.product?.name || '—'}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                                        {v?.size && `Size: ${v.size}`}{v?.size && v?.color && ' • '}{v?.color && `Color: ${v.color}`}
                                                    </div>
                                                </td>
                                                <td>{item.quantity}</td>
                                                <td>{fmt(item.unitPrice)}</td>
                                                <td style={{ color: 'var(--blue)' }}>
                                                    {item.costUsdAtPurchase ? `$${Number(item.costUsdAtPurchase).toFixed(2)}` : '—'}
                                                </td>
                                                <td style={{ color: 'var(--blue)' }}>
                                                    {item.purchaseUsdRateAtPurchase || '—'}
                                                </td>
                                                <td style={{ fontWeight: 600 }}>
                                                    {item.costLydAtPurchase ? `${Number(item.costLydAtPurchase).toFixed(2)} LYD` : fmt(item.unitCost)}
                                                </td>
                                                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                    {item.purchaseDateAtPurchase || '—'}
                                                </td>
                                                <td style={{ fontWeight: 600 }}>{fmt(item.lineTotal)}</td>
                                                <td style={{ fontWeight: 700, color: Number(item.lineProfit) > 0 ? 'var(--green)' : 'var(--red)' }}>
                                                    {fmt(item.lineProfit)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                                        <td colSpan={8} style={{ textAlign: 'end' }}>{t('sales.totals')}</td>
                                        <td>{fmt(accountingModal.total)}</td>
                                        <td style={{ color: Number(accountingModal.profit) > 0 ? 'var(--green)' : 'var(--red)' }}>
                                            {fmt(accountingModal.profit)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setAccountingModal(null)}>{t('sales.close')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

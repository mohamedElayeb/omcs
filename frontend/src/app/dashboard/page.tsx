'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../../lib/store';
import { dashboardApi } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { useTranslation } from '../../lib/i18n';

export default function DashboardPage() {
    const { token, selectedBranchId, isOwner } = useAuthStore();
    const { on } = useSocket();
    const { t } = useTranslation();
    const [overview, setOverview] = useState<any>(null);
    const [trend, setTrend] = useState<any[]>([]);
    const [topProducts, setTopProducts] = useState<any[]>([]);
    const [branchComp, setBranchComp] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [liveEvents, setLiveEvents] = useState<string[]>([]);

    const loadData = useCallback(async () => {
        if (!token) return;
        try {
            const [ov, tr, tp, bc, emp] = await Promise.all([
                dashboardApi.overview(token),
                dashboardApi.revenueTrend(token),
                dashboardApi.topProducts(token),
                dashboardApi.branchComparison(token),
                dashboardApi.employeeRanking(token),
            ]);
            setOverview(ov);
            setTrend(tr);
            setTopProducts(tp);
            setBranchComp(bc);
            setEmployees(emp);
        } catch (err: any) {
            console.error('Dashboard error:', err.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { loadData(); }, [loadData]);

    // WebSocket live updates
    useEffect(() => {
        const addEvent = (msg: string) => {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setLiveEvents(prev => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
        };

        const unsubs = [
            on('sale.created', (data: any) => {
                addEvent(`🛒 ${t('dashboard.saleMade')}: ${Number(data.total || 0).toFixed(2)} ${t('common.lyd')}`);
                loadData();
            }),
            on('sale.voided', (data: any) => {
                addEvent(`🚫 ${t('sales.voidSale')}: ${data.invoiceNumber || ''} (${Number(data.total || 0).toFixed(2)} ${t('common.lyd')})`);
                loadData();
            }),
            on('inventory.updated', (data: any) => {
                addEvent(`📦 ${t('inventory.totalStock')}: ${data.quantity}`);
            }),
            on('stock.alert', (data: any) => {
                addEvent(`⚠️ ${data.message}`);
            }),
            on('transfer.created', (data: any) => {
                addEvent(`🔄 ${t('transfers.newTransfer')}: ${data.quantity || ''}`);
            }),
            on('transfer.shipped', () => {
                addEvent(`🚚 ${t('transfers.statusInTransit')}`);
            }),
            on('transfer.received', () => {
                addEvent(`📥 ${t('transfers.statusDelivered')}`);
            }),
            on('return.created', (data: any) => {
                addEvent(`↩️ ${t('returns.newReturn')}: -${Number(data.refundAmount || 0).toFixed(2)} ${t('common.lyd')}`);
                loadData();
            }),
            on('return.completed', (data: any) => {
                addEvent(`✅ ${t('returns.statusCompleted')}: -${Number(data.refundAmount || 0).toFixed(2)} ${t('common.lyd')}`);
                loadData();
            }),
            on('price.updated', (data: any) => {
                addEvent(`💰 ${t('prices.updatePrice')}: ${Number(data.oldPrice || 0).toFixed(0)} → ${Number(data.newPrice || 0).toFixed(0)} ${t('common.lyd')}`);
            }),
            on('product.changed', (data: any) => {
                addEvent(`📋 ${t('products.title')} ${data.action || ''}`);
            }),
        ];
        return () => unsubs.forEach(u => u());
    }, [on, loadData, t]);

    const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (loading) {
        return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{t('common.loading')}</div>;
    }

    return (
        <div>
            {/* KPI Cards */}
            <div className="kpi-grid">
                <div className="card kpi-card gold">
                    <div className="kpi-icon">💰</div>
                    <div className="card-title">{t('dashboard.todaysSales')}</div>
                    <div className="kpi-value">{fmt(overview?.today?.sales)} {t('common.lyd')}</div>
                    <div className="kpi-label">{overview?.today?.count || 0} {t('dashboard.salesCount')}</div>
                    <div className="kpi-sub">{fmt(overview?.today?.profit)} {t('common.lyd')}</div>
                </div>

                <div className="card kpi-card blue">
                    <div className="kpi-icon">📈</div>
                    <div className="card-title">{t('dashboard.thisWeek')}</div>
                    <div className="kpi-value">{fmt(overview?.week?.sales)} {t('common.lyd')}</div>
                    <div className="kpi-label">{overview?.week?.count || 0} {t('dashboard.salesCount')}</div>
                    <div className="kpi-sub">{fmt(overview?.week?.profit)} {t('common.lyd')}</div>
                </div>

                <div className="card kpi-card green">
                    <div className="kpi-icon">📊</div>
                    <div className="card-title">{t('dashboard.thisMonth')}</div>
                    <div className="kpi-value">{fmt(overview?.month?.sales)} {t('common.lyd')}</div>
                    <div className="kpi-label">{overview?.month?.count || 0} {t('dashboard.salesCount')}</div>
                    <div className="kpi-sub">{fmt(overview?.month?.profit)} {t('common.lyd')}</div>
                </div>

                <div className="card kpi-card purple">
                    <div className="kpi-icon">🏪</div>
                    <div className="card-title">{t('dashboard.inventoryValue')}</div>
                    <div className="kpi-value">{fmt(overview?.inventory?.totalValue)} {t('common.lyd')}</div>
                    <div className="kpi-label">{overview?.inventory?.totalItems || 0} {t('inventory.totalStock')}</div>
                </div>

                <div className="card kpi-card red">
                    <div className="kpi-icon">⚠️</div>
                    <div className="card-title">{t('dashboard.lowStockAlerts')}</div>
                    <div className="kpi-value">{overview?.inventory?.lowStockCount || 0}</div>
                    <div className="kpi-label">{t('inventory.lowStock')}</div>
                    <div className="kpi-sub">{overview?.branches || 0} {t('dashboard.branch')}</div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid-2" style={{ marginBottom: 24 }}>
                {/* Revenue Trend */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">{t('dashboard.revenueTrend')}</span>
                    </div>
                    {trend.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 200 }}>
                            {trend.map((d, i) => {
                                const maxSales = Math.max(...trend.map(t => t.sales), 1);
                                const h = (d.sales / maxSales) * 180;
                                return (
                                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                                        <div style={{
                                            height: Math.max(h, 2), background: 'linear-gradient(to top, var(--gold-dark), var(--gold))',
                                            borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease',
                                        }} title={`${fmt(d.sales)} ${t('common.lyd')}`} />
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                            {d.date.slice(5)}
                                        </div>
                                        <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
                                            {d.sales > 0 ? `${fmt(d.sales)}` : '-'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            {t('common.noData')}
                        </div>
                    )}
                </div>

                {/* Live Activity Feed */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">{t('dashboard.liveActivity')}</span>
                        <span className="badge badge-green">LIVE</span>
                    </div>
                    <div style={{ height: 200, overflowY: 'auto', scrollBehavior: 'smooth' }}>
                        {liveEvents.length > 0 ? (
                            liveEvents.map((e, i) => (
                                <div key={i} style={{
                                    padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
                                    animation: i === 0 ? 'slideDown 0.3s ease' : undefined,
                                }}>
                                    {e}
                                </div>
                            ))
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                                {t('dashboard.noActivity')}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Branch Comparison + Top Products */}
            <div className="grid-2" style={{ marginBottom: 24 }}>
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">{t('dashboard.branchComparison')}</span>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>{t('dashboard.branch')}</th>
                                    <th>{t('dashboard.revenue')}</th>
                                    <th>{t('dashboard.salesCount')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {branchComp.length > 0 ? branchComp.map((b, i) => (
                                    <tr key={i}>
                                        <td>{b.branchName}<br /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.branchNameEn}</span></td>
                                        <td>{fmt(b.totalSales)} {t('common.lyd')}</td>
                                        <td>{b.transactionCount}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.noData')}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <span className="card-title">{t('dashboard.topProducts')}</span>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>{t('dashboard.product')}</th>
                                    <th>SKU</th>
                                    <th>{t('dashboard.sold')}</th>
                                    <th>{t('dashboard.revenue')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topProducts.length > 0 ? topProducts.map((p, i) => (
                                    <tr key={i}>
                                        <td>{p.productName}<br /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.size} {p.color}</span></td>
                                        <td><span className="badge badge-gold">{p.sku}</span></td>
                                        <td>{p.totalQty}</td>
                                        <td>{fmt(p.totalRevenue)} {t('common.lyd')}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.noData')}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Employee Ranking */}
            {isOwner() && employees.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">{t('dashboard.employeeRanking')}</span>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr><th>#</th><th>{t('common.name')}</th><th>{t('dashboard.branch')}</th><th>{t('dashboard.salesCount')}</th><th>{t('dashboard.revenue')}</th></tr>
                            </thead>
                            <tbody>
                                {employees.map((e, i) => (
                                    <tr key={i}>
                                        <td>{i + 1}</td>
                                        <td>{e.fullName}</td>
                                        <td>{e.branchName}</td>
                                        <td>{e.transactionCount}</td>
                                        <td>{fmt(e.totalSales)} {t('common.lyd')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

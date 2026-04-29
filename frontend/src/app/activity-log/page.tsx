'use client';
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../lib/store';
import { activityLogApi } from '../../lib/api';

const ACTION_ICONS: Record<string, string> = {
    SALE: '💰', VOID: '🚫', RESTOCK: '📦', TRANSFER: '🚚',
    PRODUCT_CREATE: '➕', PRODUCT_EDIT: '✏️', PRODUCT_DELETE: '🗑️',
    PRICE_UPDATE: '💲', RETURN: '↩️', DELIVERY_STATUS: '🚚',
    BANK_STATUS: '🏦', LOGIN: '🔑',
};

const ACTION_LABELS: Record<string, string> = {
    SALE: 'بيع', VOID: 'إلغاء', RESTOCK: 'تعبئة', TRANSFER: 'تحويل',
    PRODUCT_CREATE: 'إنشاء منتج', PRODUCT_EDIT: 'تعديل منتج', PRODUCT_DELETE: 'حذف منتج',
    PRICE_UPDATE: 'تحديث سعر', RETURN: 'مرتجع', DELIVERY_STATUS: 'حالة توصيل',
    BANK_STATUS: 'حالة تحويل بنكي', LOGIN: 'تسجيل دخول',
};

const ACTION_COLORS: Record<string, string> = {
    SALE: '#22c55e', VOID: '#ef4444', RESTOCK: '#3b82f6', TRANSFER: '#8b5cf6',
    PRODUCT_CREATE: '#22c55e', PRODUCT_EDIT: '#f59e0b', PRODUCT_DELETE: '#ef4444',
    PRICE_UPDATE: '#f59e0b', RETURN: '#f97316', DELIVERY_STATUS: '#6366f1',
    BANK_STATUS: '#0ea5e9', LOGIN: '#64748b',
};

export default function ActivityLogPage() {
    const { token, user } = useAuthStore();
    const [logs, setLogs] = useState<any[]>([]);
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    const [loading, setLoading] = useState(true);
    const [actionFilter, setActionFilter] = useState('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    const canView = ['OWNER', 'MANAGER'].includes(user?.role || '');

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    const loadData = async () => {
        if (!token || !canView) return;
        setLoading(true);
        try {
            const query: Record<string, string> = { page: String(page), limit: '30' };
            if (actionFilter) query.action = actionFilter;
            if (debouncedSearch) query.search = debouncedSearch;
            const res = await activityLogApi.findAll(token, query);
            setLogs(res.logs || []);
            setPagination(res.pagination || { page: 1, totalPages: 1, total: 0 });
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { setPage(1); }, [actionFilter, debouncedSearch]);
    useEffect(() => { loadData(); }, [token, page, actionFilter, debouncedSearch]);

    if (!canView) {
        return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>⛔ غير مسموح — فقط المالك والمدير</div>;
    }

    const formatDate = (d: string) => {
        const date = new Date(d);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);

        if (mins < 1) return 'الآن';
        if (mins < 60) return `منذ ${mins} دقيقة`;
        if (hours < 24) return `منذ ${hours} ساعة`;
        return date.toLocaleDateString('ar-LY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    const allActions = Object.keys(ACTION_LABELS);

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>📋 سجل النشاطات</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                    جميع العمليات والتغييرات في النظام — {pagination.total} سجل
                </p>
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Search */}
                <div className="simple-search" style={{ minWidth: 200, maxWidth: 320, flex: 1 }}>
                    <div className="simple-search__wrap">
                        <span className="simple-search__icon">🔍</span>
                        <input
                            type="text" className="simple-search__input"
                            value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="بحث في النشاطات..."
                            autoComplete="off" spellCheck={false}
                        />
                        {search && (
                            <button className="simple-search__clear" onClick={() => setSearch('')} type="button">✕</button>
                        )}
                    </div>
                </div>

                {/* Action Filter Chips */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button
                        className={`btn btn-secondary btn-sm ${!actionFilter ? 'filter-chip--active' : ''}`}
                        style={{ fontSize: 11, padding: '4px 10px' }}
                        onClick={() => setActionFilter('')}
                    >الكل</button>
                    {allActions.map(a => (
                        <button
                            key={a}
                            className={`btn btn-secondary btn-sm ${actionFilter === a ? 'filter-chip--active' : ''}`}
                            style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={() => setActionFilter(a)}
                        >{ACTION_ICONS[a]} {ACTION_LABELS[a]}</button>
                    ))}
                </div>

                {/* Refresh */}
                <button className="btn btn-secondary btn-sm" style={{ marginInlineStart: 'auto' }} onClick={loadData}>🔄</button>
            </div>

            {/* Log Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>جاري التحميل...</div>
            ) : (
                <div className="card">
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: 50 }}>النوع</th>
                                    <th>التفاصيل</th>
                                    <th>المستخدم</th>
                                    <th>الوقت</th>
                                    <th style={{ width: 28 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <React.Fragment key={log.id}>
                                        <tr
                                            style={{ cursor: log.details ? 'pointer' : 'default' }}
                                            onClick={() => log.details && setExpandedId(expandedId === log.id ? null : log.id)}
                                        >
                                            <td>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                    background: `${ACTION_COLORS[log.action] || '#64748b'}20`,
                                                    color: ACTION_COLORS[log.action] || '#64748b',
                                                    border: `1px solid ${ACTION_COLORS[log.action] || '#64748b'}40`,
                                                }}>
                                                    {ACTION_ICONS[log.action] || '📝'} {ACTION_LABELS[log.action] || log.action}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: 13 }}>{log.description}</td>
                                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                {log.user?.name || log.userId?.slice(0, 8) || '—'}
                                            </td>
                                            <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {formatDate(log.createdAt)}
                                            </td>
                                            <td style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                                {log.details && (expandedId === log.id ? '▼' : '▶')}
                                            </td>
                                        </tr>
                                        {expandedId === log.id && log.details && (
                                            <tr>
                                                <td colSpan={5} style={{ padding: '8px 16px', background: 'var(--bg-tertiary)' }}>
                                                    <pre style={{
                                                        fontSize: 11, color: 'var(--text-muted)',
                                                        whiteSpace: 'pre-wrap', direction: 'ltr', textAlign: 'left',
                                                        margin: 0, fontFamily: 'monospace',
                                                    }}>
                                                        {JSON.stringify(JSON.parse(log.details), null, 2)}
                                                    </pre>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                                            لا توجد نشاطات
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 0', alignItems: 'center' }}>
                            <button className="btn btn-secondary btn-sm" disabled={page <= 1}
                                onClick={() => setPage(p => p - 1)}>← السابق</button>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                {page} / {pagination.totalPages}
                            </span>
                            <button className="btn btn-secondary btn-sm" disabled={page >= pagination.totalPages}
                                onClick={() => setPage(p => p + 1)}>التالي →</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

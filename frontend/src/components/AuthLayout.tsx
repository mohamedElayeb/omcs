'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../lib/store';
import { branchesApi } from '../lib/api';
import { syncOutbox, getOutboxCount } from '../lib/outbox';
import Sidebar from './Sidebar';
import { useTranslation } from '../lib/i18n';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { token, user, isHydrated, hydrate, selectedBranchId, setSelectedBranch, setBranches, branches } = useAuthStore();
    const { t } = useTranslation();
    const [isOnline, setIsOnline] = useState(true);
    const [showOnlineBanner, setShowOnlineBanner] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [pageTitle, setPageTitle] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Hydrate auth from localStorage on mount
    useEffect(() => { hydrate(); }, []);

    // Load branches
    useEffect(() => {
        if (token) {
            branchesApi.findAll(token)
                .then(b => setBranches(b))
                .catch(console.error);
        }
    }, [token]);

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    // Monitor network status
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setShowOnlineBanner(true);
            // Sync outbox when coming back online
            if (token) {
                syncOutbox(token).then(result => {
                    if (result.synced > 0) {
                        console.log(`✅ Synced ${result.synced} queued actions`);
                    }
                    updatePendingCount();
                });
            }
            setTimeout(() => setShowOnlineBanner(false), 3000);
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        setIsOnline(navigator.onLine);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [token]);

    // Update pending outbox count
    const updatePendingCount = useCallback(async () => {
        const count = await getOutboxCount();
        setPendingCount(count);
    }, []);

    useEffect(() => {
        updatePendingCount();
        const interval = setInterval(updatePendingCount, 5000);
        return () => clearInterval(interval);
    }, []);

    // Determine page title
    useEffect(() => {
        const titleKeys: Record<string, string> = {
            '/dashboard': 'pageTitles.dashboard',
            '/pos': 'pageTitles.pos',
            '/products': 'pageTitles.products',
            '/inventory': 'pageTitles.inventory',
            '/transfers': 'pageTitles.transfers',
            '/sales': 'pageTitles.sales',
            '/returns': 'pageTitles.returns',
            '/orders': 'pageTitles.orders',
            '/prices': 'pageTitles.prices',
            '/exchange-rate': 'pageTitles.exchangeRate',
            '/barcodes': 'pageTitles.barcodes',
        };
        const key = titleKeys[pathname];
        setPageTitle(key ? t(key) : t('common.appName'));
    }, [pathname, t]);

    // Auth redirect
    useEffect(() => {
        if (isHydrated && !token && pathname !== '/login') {
            router.push('/login');
        }
    }, [isHydrated, token, pathname]);

    if (!isHydrated) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 12, color: 'var(--gold)' }}>⟳</div>
                    <div style={{ color: 'var(--text-muted)' }}>{t('common.loadingApp')}</div>
                </div>
            </div>
        );
    }

    if (pathname === '/login') return <>{children}</>;
    if (!token) return null;

    return (
        <>
            {/* Network Status Banners */}
            {!isOnline && (
                <div className="offline-banner">
                    ⚠️ {t('common.youAreOffline')} — {t('common.queued')}
                    {pendingCount > 0 && ` (${pendingCount} ${t('common.queued')})`}
                </div>
            )}
            {showOnlineBanner && (
                <div className="online-banner">
                    ✅ {t('common.backOnline')}
                </div>
            )}

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
            )}

            <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : ''}`} style={{ paddingTop: !isOnline || showOnlineBanner ? '36px' : 0 }}>
                <Sidebar />
                <main className="main-content">
                    <div className="topbar">
                        <div className="topbar-left">
                            <button
                                className="hamburger-btn"
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                aria-label="Toggle menu"
                            >
                                <span className={`hamburger-icon ${sidebarOpen ? 'open' : ''}`}>
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </span>
                            </button>
                            <h2 className="page-title">{pageTitle}</h2>
                        </div>
                        <div className="right-section">
                            {pendingCount > 0 && (
                                <span className="badge badge-gold">
                                    📤 {pendingCount} {t('common.queued')}
                                </span>
                            )}
                            {(user?.role === 'OWNER' || user?.role === 'MANAGER') ? (
                                <select
                                    className="branch-selector"
                                    value={selectedBranchId || ''}
                                    onChange={(e) => setSelectedBranch(e.target.value || null)}
                                >
                                    <option value="">{t('common.allBranches')}</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.name} ({b.nameEn})</option>
                                    ))}
                                </select>
                            ) : user?.role === 'CASHIER' ? (
                                <select
                                    className="branch-selector"
                                    value={selectedBranchId || ''}
                                    onChange={(e) => setSelectedBranch(e.target.value || null)}
                                    style={!selectedBranchId ? { borderColor: 'var(--gold)', animation: 'pulse 2s infinite' } : {}}
                                >
                                    <option value="" disabled>📍 {t('common.selectBranch') || 'اختر الفرع'}</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.name} ({b.nameEn})</option>
                                    ))}
                                </select>
                            ) : user?.branch ? (
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    📍 {user.branch.name}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div className="page-content">
                        {children}
                    </div>
                </main>
            </div>

        </>
    );
}

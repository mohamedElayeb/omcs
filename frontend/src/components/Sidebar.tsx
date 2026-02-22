'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '../lib/store';
import { useTranslation } from '../lib/i18n';

const allNavItems = [
    { href: '/dashboard', labelKey: 'nav.dashboard', icon: '📊', roles: ['OWNER', 'MANAGER', 'VIEWER'] },
    { href: '/pos', labelKey: 'nav.pos', icon: '🛒', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
    { href: '/products', labelKey: 'nav.products', icon: '📦', roles: ['OWNER', 'MANAGER'] },
    { href: '/inventory', labelKey: 'nav.inventory', icon: '🏪', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
    { href: '/transfers', labelKey: 'nav.transfers', icon: '🔄', roles: ['OWNER', 'MANAGER'] },
    { href: '/sales', labelKey: 'nav.sales', icon: '🧾', roles: ['OWNER', 'MANAGER', 'VIEWER'] },
    { href: '/returns', labelKey: 'nav.returns', icon: '↩️', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
    { href: '/orders', labelKey: 'nav.orders', icon: '🌐', roles: ['OWNER', 'MANAGER'] },
    { href: '/prices', labelKey: 'nav.prices', icon: '💲', roles: ['OWNER', 'MANAGER'] },
    { href: '/exchange-rate', labelKey: 'nav.exchangeRate', icon: '💱', roles: ['OWNER', 'MANAGER'] },
    { href: '/barcodes', labelKey: 'nav.barcodes', icon: '🏷️', roles: ['OWNER', 'MANAGER'] },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, logout } = useAuthStore();
    const { t } = useTranslation();
    const role = user?.role || '';

    const navItems = allNavItems.filter(item => item.roles.includes(role));

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    return (
        <aside className="sidebar">
            <div className="logo">
                <div>
                    <h1>{t('common.appName')}</h1>
                    <span>{t('common.appFullName')}</span>
                </div>
            </div>

            <nav>
                {navItems.map(item => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-link ${pathname === item.href ? 'active' : ''}`}
                    >
                        <span className="icon">{item.icon}</span>
                        {t(item.labelKey)}
                    </Link>
                ))}
            </nav>

            <div className="user-info">
                <div className="name">{user?.fullName || 'User'}</div>
                <div className="role">{role}</div>
                {user?.branch && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        📍 {user.branch.name}
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}
                >
                    {t('common.logout')}
                </button>
            </div>
        </aside>
    );
}

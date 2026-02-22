'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../lib/store';
import { useTranslation } from '../lib/i18n';

export default function HomePage() {
    const router = useRouter();
    const { token, user, isHydrated, hydrate } = useAuthStore();
    const { t } = useTranslation();

    useEffect(() => { hydrate(); }, []);

    useEffect(() => {
        if (!isHydrated) return;
        if (!token) {
            router.replace('/login');
        } else if (user?.role === 'CASHIER') {
            router.replace('/pos');
        } else {
            router.replace('/dashboard');
        }
    }, [isHydrated, token, user?.role]);

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
            <div style={{ color: 'var(--text-muted)' }}>{t('common.redirecting')}</div>
        </div>
    );
}

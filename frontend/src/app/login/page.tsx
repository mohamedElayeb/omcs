'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../lib/store';
import { authApi } from '../../lib/api';
import { useTranslation } from '../../lib/i18n';

export default function LoginPage() {
    const router = useRouter();
    const { setAuth } = useAuthStore();
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await authApi.login(email, password);
            setAuth(res.accessToken, res.user);
            const role = res.user.role;
            if (role === 'CASHIER') {
                router.push('/pos');
            } else {
                router.push('/dashboard');
            }
        } catch (err: any) {
            setError(err.message || t('login.loginError'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, var(--bg-primary) 0%, #0f0f1a 50%, #1a0a2e 100%)',
        }}>
            <div style={{ width: '100%', maxWidth: 420, padding: 40 }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <h1 style={{ fontSize: 42, fontWeight: 800, color: 'var(--gold)', letterSpacing: 2 }}>{t('login.title')}</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, letterSpacing: 2, marginTop: 8 }}>
                        {t('login.subtitle')}
                    </p>
                </div>

                <div className="card" style={{ padding: 32 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, textAlign: 'center' }}>{t('login.signIn')}</h2>

                    {error && (
                        <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label className="form-label">{t('login.email')}</label>
                            <input
                                type="email" className="form-input"
                                value={email} onChange={e => setEmail(e.target.value)}
                                placeholder={t('login.emailPlaceholder')} required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('login.password')}</label>
                            <input
                                type="password" className="form-input"
                                value={password} onChange={e => setPassword(e.target.value)}
                                placeholder={t('login.passwordPlaceholder')} required
                            />
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}
                            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                            {loading ? t('login.signingIn') : t('login.signIn')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}


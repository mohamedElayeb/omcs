import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthLayout from '../components/AuthLayout';
import { ToastProvider } from '../components/Toast';
import { I18nProvider } from '../lib/i18n';

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export const metadata: Metadata = {
    title: 'OMCS - نظام إدارة المنافذ',
    description: 'نظام إدارة التجزئة متعدد الفروع - ليبيا',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ar" dir="rtl">
            <body>
                <I18nProvider locale="ar">
                    <ToastProvider>
                        <AuthLayout>{children}</AuthLayout>
                    </ToastProvider>
                </I18nProvider>
            </body>
        </html>
    );
}

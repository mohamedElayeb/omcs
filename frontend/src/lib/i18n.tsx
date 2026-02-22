'use client';
import React, { createContext, useContext, useMemo } from 'react';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';

type Messages = Record<string, any>;

const defaultLocale = 'ar';
const messages: Record<string, Messages> = { ar, en };

function getNestedValue(obj: any, path: string): string | undefined {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current === undefined || current === null) return undefined;
        current = current[key];
    }
    return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
}

interface I18nContextType {
    locale: string;
    t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
    locale: defaultLocale,
    t: (key: string) => key,
});

export function I18nProvider({ children, locale = defaultLocale }: { children: React.ReactNode; locale?: string }) {
    const value = useMemo(() => {
        const primary = messages[locale] || messages[defaultLocale];
        const fallback = messages['en'];

        const t = (key: string, vars?: Record<string, string | number>): string => {
            const val = getNestedValue(primary, key) ?? getNestedValue(fallback, key) ?? key;
            return vars ? interpolate(val, vars) : val;
        };

        return { locale, t };
    }, [locale]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
    return useContext(I18nContext);
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

async function fetchJson(url: string, options?: RequestInit) {
    const res = await fetch(`${API_URL}${url}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `API error: ${res.status}`);
    }
    return res.json();
}

// ─── Public Storefront API ───

export const storefrontApi = {
    getProducts: (params: Record<string, string | number> = {}) => {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
        return fetchJson(`/api/storefront/products?${qs.toString()}`);
    },
    getProduct: (id: string) => fetchJson(`/api/storefront/products/${id}`),
    getCategories: () => fetchJson('/api/storefront/categories'),
    getBrands: () => fetchJson('/api/storefront/brands'),
    getSizes: (category?: string, brand?: string) => {
        const qs = new URLSearchParams();
        if (category) qs.set('category', category);
        if (brand) qs.set('brand', brand);
        return fetchJson(`/api/storefront/sizes?${qs.toString()}`);
    },
    getColors: (category?: string, brand?: string) => {
        const qs = new URLSearchParams();
        if (category) qs.set('category', category);
        if (brand) qs.set('brand', brand);
        return fetchJson(`/api/storefront/colors?${qs.toString()}`);
    },
};

export const ordersApi = {
    create: (data: any) => fetchJson('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
    uploadProof: (orderId: string, proofUrl: string) =>
        fetchJson(`/api/orders/${orderId}/payment-proof`, { method: 'POST', body: JSON.stringify({ proofUrl }) }),
    track: (orderNumber: string) => fetchJson(`/api/orders/track/${orderNumber}`),
};

export function imgSrc(imageUrl?: string) {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('http')) return imageUrl;
    return `${API_URL}${imageUrl}`;
}

export function formatPrice(n: number) {
    return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

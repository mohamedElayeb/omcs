const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

interface FetchOptions extends RequestInit {
    token?: string;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const { token, headers: customHeaders, ...rest } = options;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((customHeaders as Record<string, string>) || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${path}`, { headers, ...rest });
    if (!res.ok) {
        // Auto-logout on expired / invalid token
        if (res.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem('omcs_token');
            localStorage.removeItem('omcs_user');
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
            throw new Error('Session expired – redirecting to login');
        }
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || 'API Error');
    }
    return res.json();
}

// Auth
export const authApi = {
    login: (email: string, password: string) =>
        apiFetch<{ accessToken: string; user: any }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),
    me: (token: string) => apiFetch<any>('/api/auth/me', { token }),
    verifyPin: (token: string, branchId: string, pin: string) =>
        apiFetch<{ managerId: string; managerName: string }>('/api/auth/verify-pin', {
            token, method: 'POST',
            body: JSON.stringify({ branchId, pin }),
        }),
};

// Dashboard
export const dashboardApi = {
    overview: (token: string) => apiFetch<any>('/api/dashboard/overview', { token }),
    revenueTrend: (token: string, days = 7) =>
        apiFetch<any[]>(`/api/dashboard/revenue-trend?days=${days}`, { token }),
    topProducts: (token: string, limit = 10) =>
        apiFetch<any[]>(`/api/dashboard/top-products?limit=${limit}`, { token }),
    branchComparison: (token: string) =>
        apiFetch<any[]>('/api/dashboard/branch-comparison', { token }),
    employeeRanking: (token: string) =>
        apiFetch<any[]>('/api/dashboard/employee-ranking', { token }),
};

// Branches
export const branchesApi = {
    findAll: (token: string) => apiFetch<any[]>('/api/branches', { token }),
    create: (token: string, data: any) =>
        apiFetch<any>('/api/branches', { token, method: 'POST', body: JSON.stringify(data) }),
};

// Products
export const productsApi = {
    findAll: (token: string, query = '') =>
        apiFetch<any[]>(`/api/products${query ? `?${query}` : ''}`, { token }),
    findOne: (token: string, id: string) => apiFetch<any>(`/api/products/${id}`, { token }),
    findBySku: (token: string, sku: string) =>
        apiFetch<any>(`/api/products/sku/${sku}`, { token }),
    create: (token: string, data: any) =>
        apiFetch<any>('/api/products', { token, method: 'POST', body: JSON.stringify(data) }),
    update: (token: string, id: string, data: any) =>
        apiFetch<any>(`/api/products/${id}`, { token, method: 'PATCH', body: JSON.stringify(data) }),
    updateVariant: (token: string, variantId: string, data: any) =>
        apiFetch<any>(`/api/variants/${variantId}`, { token, method: 'PATCH', body: JSON.stringify(data) }),
    addVariant: (token: string, productId: string, data: any) =>
        apiFetch<any>(`/api/products/${productId}/variants`, { token, method: 'POST', body: JSON.stringify(data) }),
    deleteVariant: (token: string, variantId: string) =>
        apiFetch<any>(`/api/variants/${variantId}`, { token, method: 'DELETE' }),
    bulkPriceUpdate: (token: string, data: any) =>
        apiFetch<any>('/api/products/bulk-price-update', { token, method: 'POST', body: JSON.stringify(data) }),
    priceHistory: (token: string, variantId?: string) =>
        apiFetch<any[]>(`/api/price-history${variantId ? `?variantId=${variantId}` : ''}`, { token }),
    uploadImage: async (token: string, file: File, productId?: string): Promise<{ imageUrl: string }> => {
        const formData = new FormData();
        formData.append('image', file);
        if (productId) formData.append('productId', productId);
        const res = await fetch(`${API_URL}/api/products/upload-image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Upload failed'); }
        return res.json();
    },
    addImage: async (token: string, productId: string, file: File, isPrimary = false): Promise<any> => {
        const formData = new FormData();
        formData.append('image', file);
        if (isPrimary) formData.append('isPrimary', 'true');
        const res = await fetch(`${API_URL}/api/products/${productId}/images`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Upload failed'); }
        return res.json();
    },
    removeImage: (token: string, imageId: string) =>
        apiFetch<any>(`/api/products/images/${imageId}/delete`, { token, method: 'PATCH' }),
    getImages: (token: string, productId: string) =>
        apiFetch<any[]>(`/api/products/${productId}/images`, { token }),
    deleteProduct: (token: string, id: string) =>
        apiFetch<any>(`/api/products/${id}`, { token, method: 'DELETE' }),
};

// Categories
export const categoriesApi = {
    findAll: (token: string) => apiFetch<any[]>('/api/categories', { token }),
};

// Inventory
export const inventoryApi = {
    findAll: (token: string, branchId?: string) =>
        apiFetch<any[]>(`/api/inventory${branchId ? `?branchId=${branchId}` : ''}`, { token }),
    alerts: (token: string) => apiFetch<any[]>('/api/inventory/alerts', { token }),
    restock: (token: string, data: any) =>
        apiFetch<any>('/api/inventory/restock', { token, method: 'POST', body: JSON.stringify(data) }),
    grouped: (token: string, branchId?: string, filters?: Record<string, string | boolean | undefined>) => {
        const params = new URLSearchParams();
        if (branchId) params.set('branchId', branchId);
        if (filters) {
            Object.entries(filters).forEach(([k, v]) => {
                if (v !== undefined && v !== '' && v !== false) params.set(k, String(v));
            });
        }
        const qs = params.toString();
        return apiFetch<any[]>(`/api/inventory/grouped${qs ? `?${qs}` : ''}`, { token });
    },
    lowStock: (token: string, branchId?: string) =>
        apiFetch<any[]>(`/api/inventory/low-stock${branchId ? `?branchId=${branchId}` : ''}`, { token }),
};

// Transfers
export const transfersApi = {
    findAll: (token: string, query = '') =>
        apiFetch<any[]>(`/api/inventory/transfers${query ? `?${query}` : ''}`, { token }),
    findOne: (token: string, id: string) =>
        apiFetch<any>(`/api/inventory/transfers/${id}`, { token }),
    create: (token: string, data: any) =>
        apiFetch<any>('/api/inventory/transfers', { token, method: 'POST', body: JSON.stringify(data) }),
    // Immediate transfer (Feature D) — default mode
    immediate: (token: string, data: any) =>
        apiFetch<any>('/api/inventory/transfers/immediate', { token, method: 'POST', body: JSON.stringify(data) }),
    dispatch: (token: string, id: string) =>
        apiFetch<any>(`/api/inventory/transfers/${id}/dispatch`, { token, method: 'PATCH' }),
    receive: (token: string, id: string) =>
        apiFetch<any>(`/api/inventory/transfers/${id}/receive`, { token, method: 'PATCH' }),
    cancel: (token: string, id: string) =>
        apiFetch<any>(`/api/inventory/transfers/${id}/cancel`, { token, method: 'PATCH' }),
};

// Sales
export const salesApi = {
    create: (token: string, data: any) =>
        apiFetch<any>('/api/sales', { token, method: 'POST', body: JSON.stringify(data) }),
    findAll: (token: string, query = '') =>
        apiFetch<any[]>(`/api/sales${query ? `?${query}` : ''}`, { token }),
    findOne: (token: string, id: string) => apiFetch<any>(`/api/sales/${id}`, { token }),
    dailySummary: (token: string, branchId: string, date?: string) =>
        apiFetch<any>(`/api/sales/daily-summary?branchId=${branchId}${date ? `&date=${date}` : ''}`, { token }),
    // Delivery status
    updateDeliveryStatus: (token: string, saleId: string, status: string, note?: string) =>
        apiFetch<any>(`/api/sales/${saleId}/delivery-status`, {
            token, method: 'PATCH',
            body: JSON.stringify({ status, note }),
        }),
    deliveryLogs: (token: string, saleId: string) =>
        apiFetch<any[]>(`/api/sales/${saleId}/delivery-logs`, { token }),
    // Bank transfer status (Feature A)
    updateTransferStatus: (token: string, saleId: string, status: string, note?: string) =>
        apiFetch<any>(`/api/sales/${saleId}/transfer-status`, {
            token, method: 'PATCH',
            body: JSON.stringify({ status, note }),
        }),
    bankTransferLogs: (token: string, saleId: string) =>
        apiFetch<any[]>(`/api/sales/${saleId}/bank-transfer-logs`, { token }),
};

// Returns
export const returnsApi = {
    create: (token: string, data: any) =>
        apiFetch<any>('/api/returns', { token, method: 'POST', body: JSON.stringify(data) }),
    findAll: (token: string, branchId?: string) =>
        apiFetch<any[]>(`/api/returns${branchId ? `?branchId=${branchId}` : ''}`, { token }),
    // POS Returns
    posPreview: (token: string, invoiceNo: string) =>
        apiFetch<any>(`/api/returns/pos/preview?invoiceNo=${encodeURIComponent(invoiceNo)}`, { token }),
    posCreate: (token: string, data: any) =>
        apiFetch<any>('/api/returns/pos', { token, method: 'POST', body: JSON.stringify(data) }),
    posUpdateStatus: (token: string, returnId: string, data: { status: string; adminNotes?: string }) =>
        apiFetch<any>(`/api/returns/pos/${returnId}/status`, { token, method: 'PATCH', body: JSON.stringify(data) }),
    posFindOne: (token: string, id: string) =>
        apiFetch<any>(`/api/returns/pos/${id}`, { token }),
    posFindAll: (token: string, query?: Record<string, string>) => {
        const params = new URLSearchParams();
        if (query) Object.entries(query).forEach(([k, v]) => { if (v) params.set(k, v); });
        const qs = params.toString();
        return apiFetch<any[]>(`/api/returns/pos${qs ? `?${qs}` : ''}`, { token });
    },
};

// Settings
export const settingsApi = {
    getAll: (token: string) => apiFetch<Record<string, string>>('/api/settings', { token }),
    updateUsdRate: (token: string, data: { rate: number; recalculate?: boolean; categoryId?: string; brand?: string }) =>
        apiFetch<{ rate: number; updated: number }>('/api/settings/usd-rate', {
            token, method: 'POST', body: JSON.stringify(data),
        }),
    recalculatePrices: (token: string, data?: { categoryId?: string; brand?: string }) =>
        apiFetch<{ rate: number; updated: number }>('/api/settings/recalculate-prices', {
            token, method: 'POST', body: JSON.stringify(data || {}),
        }),
    update: (token: string, key: string, value: string) =>
        apiFetch<any>('/api/settings', {
            token, method: 'POST', body: JSON.stringify({ key, value }),
        }),
};

// Orders (Admin)
export const ordersApi = {
    findAll: (token: string, params: Record<string, string | number> = {}) => {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
        return apiFetch<any>(`/api/orders/admin?${qs.toString()}`, { token });
    },
    findOne: (token: string, id: string) =>
        apiFetch<any>(`/api/orders/admin/${id}`, { token }),
    getStats: (token: string) =>
        apiFetch<any>('/api/orders/admin/stats', { token }),
    updateStatus: (token: string, id: string, status: string, notes?: string) =>
        apiFetch<any>(`/api/orders/admin/${id}/status`, {
            token, method: 'PATCH', body: JSON.stringify({ status, notes }),
        }),
    confirmPayment: (token: string, id: string, note?: string) =>
        apiFetch<any>(`/api/orders/admin/${id}/payment/confirm`, {
            token, method: 'PATCH', body: JSON.stringify({ note }),
        }),
    rejectPayment: (token: string, id: string, note?: string) =>
        apiFetch<any>(`/api/orders/admin/${id}/payment/reject`, {
            token, method: 'PATCH', body: JSON.stringify({ note }),
        }),
    updateDelivery: (token: string, id: string, data: any) =>
        apiFetch<any>(`/api/orders/admin/${id}/delivery`, {
            token, method: 'PATCH', body: JSON.stringify(data),
        }),
};

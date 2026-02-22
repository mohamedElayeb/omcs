import { create } from 'zustand';

interface Branch {
    id: string;
    name: string;
    nameEn: string;
}

interface User {
    id: string;
    email: string;
    fullName: string;
    role: string;
    branch?: Branch;
    maxDiscountPercent?: number;
    maxDiscountValue?: number;
}

interface AuthState {
    token: string | null;
    user: User | null;
    selectedBranchId: string | null; // null = all branches
    branches: Branch[];
    isHydrated: boolean;
    setAuth: (token: string, user: User) => void;
    logout: () => void;
    hydrate: () => void;
    setSelectedBranch: (branchId: string | null) => void;
    setBranches: (branches: Branch[]) => void;
    isAuthenticated: () => boolean;
    isOwner: () => boolean;
    isManager: () => boolean;
    isCashier: () => boolean;
    canViewProfit: () => boolean;
    canChangePrice: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    token: null,
    user: null,
    selectedBranchId: null,
    branches: [],
    isHydrated: false,

    setAuth: (token, user) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('omcs_token', token);
            localStorage.setItem('omcs_user', JSON.stringify(user));
        }
        set({ token, user });
    },

    logout: () => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('omcs_token');
            localStorage.removeItem('omcs_user');
        }
        set({ token: null, user: null, selectedBranchId: null });
    },

    hydrate: () => {
        if (typeof window === 'undefined') return;
        const token = localStorage.getItem('omcs_token');
        const userStr = localStorage.getItem('omcs_user');
        if (token && userStr) {
            try {
                const user = JSON.parse(userStr);
                set({ token, user, isHydrated: true });
                // Non-owner users default to their branch
                if (user.role !== 'OWNER' && user.branch) {
                    set({ selectedBranchId: user.branch.id });
                }
            } catch {
                set({ isHydrated: true });
            }
        } else {
            set({ isHydrated: true });
        }
    },

    setSelectedBranch: (branchId) => set({ selectedBranchId: branchId }),
    setBranches: (branches) => set({ branches }),

    isAuthenticated: () => !!get().token,
    isOwner: () => get().user?.role === 'OWNER',
    isManager: () => get().user?.role === 'MANAGER',
    isCashier: () => get().user?.role === 'CASHIER',
    canViewProfit: () => ['OWNER', 'MANAGER'].includes(get().user?.role || ''),
    canChangePrice: () => ['OWNER', 'MANAGER'].includes(get().user?.role || ''),
}));

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
    variantId: string;
    productId: string;
    productName: string;
    brand: string;
    imageUrl: string;
    size: string;
    color: string;
    sku: string;
    salePrice: number;
    quantity: number;
}

interface CartStore {
    items: CartItem[];
    addItem: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
    removeItem: (variantId: string) => void;
    updateQuantity: (variantId: string, qty: number) => void;
    clearCart: () => void;
    getSubtotal: () => number;
    getItemCount: () => number;
}

export const useCart = create<CartStore>()(
    persist(
        (set, get) => ({
            items: [],

            addItem: (item, qty = 1) => {
                const existing = get().items.find(i => i.variantId === item.variantId);
                if (existing) {
                    set({
                        items: get().items.map(i =>
                            i.variantId === item.variantId
                                ? { ...i, quantity: i.quantity + qty }
                                : i
                        ),
                    });
                } else {
                    set({ items: [...get().items, { ...item, quantity: qty }] });
                }
            },

            removeItem: (variantId) => {
                set({ items: get().items.filter(i => i.variantId !== variantId) });
            },

            updateQuantity: (variantId, qty) => {
                if (qty <= 0) {
                    set({ items: get().items.filter(i => i.variantId !== variantId) });
                } else {
                    set({
                        items: get().items.map(i =>
                            i.variantId === variantId ? { ...i, quantity: qty } : i
                        ),
                    });
                }
            },

            clearCart: () => set({ items: [] }),

            getSubtotal: () => get().items.reduce((s, i) => s + i.salePrice * i.quantity, 0),

            getItemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
        }),
        {
            name: 'omcs-cart',
        }
    )
);

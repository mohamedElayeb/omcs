'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuthStore } from '../../lib/store';
import { productsApi, salesApi, authApi, inventoryApi, categoriesApi } from '../../lib/api';
import { useSocket } from '../../lib/useSocket';
import { addToOutbox, generateIdempotencyKey } from '../../lib/outbox';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../lib/i18n';

// Sanitize SKU for barcode encoding — must match barcodes page logic
const sanitizeForBarcode = (sku: string): string => {
    const ascii = sku.replace(/[^\x20-\x7E]/g, '').trim();
    if (ascii.length >= 3) return ascii;
    let h = 0;
    for (let i = 0; i < sku.length; i++) h = ((h << 5) - h + sku.charCodeAt(i)) | 0;
    return 'OM' + Math.abs(h % 100000000).toString().padStart(8, '0');
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

interface CartItem {
    variantId: string;
    sku: string;
    productName: string;
    imageUrl: string;
    size: string;
    color: string;
    salePrice: number;
    costPrice: number;
    quantity: number;
    discount: number;
    stock: number;
}

export default function POSPage() {
    const { token, user, selectedBranchId } = useAuthStore();
    const { on } = useSocket();
    const toast = useToast();
    const { t } = useTranslation();
    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [inventory, setInventory] = useState<any[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [search, setSearch] = useState('');
    const [discountPercent, setDiscountPercent] = useState(0);
    const [loading, setLoading] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [managerOverrideBy, setManagerOverrideBy] = useState<string | null>(null);
    const [saleResult, setSaleResult] = useState<any>(null);
    const [isOnline, setIsOnline] = useState(true);
    const [paymentMethod, setPaymentMethod] = useState('CASH');
    const [saleNotes, setSaleNotes] = useState('');
    // Bank transfer fields
    const [transferRef, setTransferRef] = useState('');
    const [transferBank, setTransferBank] = useState('');
    // Delivery fields
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [deliveryCity, setDeliveryCity] = useState('');
    const [deliveryCompany, setDeliveryCompany] = useState('');
    const [deliveryFee, setDeliveryFee] = useState(0);
    // New: category filter & variant picker
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedProduct, setSelectedProduct] = useState<any>(null);

    // ─── Barcode Scanner ───
    const [scannerBuffer, setScannerBuffer] = useState('');
    const [scannerActive, setScannerActive] = useState(false);
    const scannerTimeout = useRef<NodeJS.Timeout | null>(null);
    const lastKeyTime = useRef<number>(0);

    const branchId = selectedBranchId || user?.branch?.id;

    // Load products, categories, and inventory
    useEffect(() => {
        if (!token) return;
        productsApi.findAll(token).then(setProducts).catch(console.error);
        categoriesApi.findAll(token).then(setCategories).catch(console.error);
        if (branchId) {
            inventoryApi.findAll(token, branchId).then(setInventory).catch(console.error);
        }
    }, [token, branchId]);

    // Network status
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        setIsOnline(navigator.onLine);
        return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
    }, []);

    // WebSocket live inventory
    useEffect(() => {
        const unsub = on('inventory.updated', (data: any) => {
            setInventory(prev => prev.map(i =>
                i.variantId === data.variantId && i.branchId === data.branchId
                    ? { ...i, quantity: data.quantity }
                    : i
            ));
        });
        return () => unsub();
    }, [on]);

    // ─── Barcode Scanner Listener ───
    // Barcode scanners act as keyboard wedge: they type characters very fast then press Enter
    // We detect rapid sequential keystrokes (< 50ms apart) and treat them as a scan
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input/textarea
            const tag = (e.target as HTMLElement)?.tagName;
            const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

            const now = Date.now();
            const timeDiff = now - lastKeyTime.current;
            lastKeyTime.current = now;

            // If Enter is pressed with buffer content, try to process the scan
            if (e.key === 'Enter' && scannerBuffer.length >= 3) {
                e.preventDefault();
                e.stopPropagation();
                processScan(scannerBuffer);
                setScannerBuffer('');
                setScannerActive(false);
                if (scannerTimeout.current) clearTimeout(scannerTimeout.current);
                return;
            }

            // Only accumulate single printable characters typed rapidly
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                // If time between keystrokes is < 80ms, it's likely a scanner
                if (timeDiff < 80 || scannerBuffer.length > 0) {
                    if (isInput && scannerBuffer.length === 0 && timeDiff > 80) {
                        // First character typed slowly in an input — normal typing, ignore
                        return;
                    }
                    // If we're in an input and scanner is active, prevent default
                    if (isInput && scannerBuffer.length > 0) {
                        e.preventDefault();
                    }
                    setScannerBuffer(prev => prev + e.key);
                    setScannerActive(true);
                    // Reset timeout — if no more chars come in 150ms, it was probably manual typing
                    if (scannerTimeout.current) clearTimeout(scannerTimeout.current);
                    scannerTimeout.current = setTimeout(() => {
                        setScannerBuffer('');
                        setScannerActive(false);
                    }, 150);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            if (scannerTimeout.current) clearTimeout(scannerTimeout.current);
        };
    }, [scannerBuffer, products, inventory, cart]);

    // Process a scanned barcode value
    const processScan = useCallback((scannedValue: string) => {
        const code = scannedValue.trim();
        if (code.length < 3) return;

        // Find the variant matching the scanned barcode
        // Check both: raw SKU match and sanitized barcode match
        let matchedProduct: any = null;
        let matchedVariant: any = null;

        for (const product of products) {
            for (const variant of (product.variants || [])) {
                const sku = variant.sku || '';
                const barcodeValue = sanitizeForBarcode(sku);
                if (sku === code || sku.toUpperCase() === code.toUpperCase() ||
                    barcodeValue === code || barcodeValue.toUpperCase() === code.toUpperCase()) {
                    matchedProduct = product;
                    matchedVariant = variant;
                    break;
                }
            }
            if (matchedVariant) break;
        }

        if (matchedVariant && matchedProduct) {
            const stock = getStock(matchedVariant.id);
            if (stock <= 0) {
                toast.error(`⚠️ ${matchedProduct.name} (${matchedVariant.size || matchedVariant.sku}) — ${t('pos.outOfStock')}`);
                return;
            }
            addToCart(matchedProduct, matchedVariant);
            toast.success(`✅ ${matchedProduct.name} ${matchedVariant.size || ''} — ${t('pos.scannedAdded')}`);
        } else {
            toast.error(`❌ ${t('pos.barcodeNotFound')}: ${code}`);
        }
    }, [products, inventory, cart, toast, t]);

    const getStock = (variantId: string) => {
        const inv = inventory.find(i => i.variantId === variantId);
        return inv?.quantity || 0;
    };

    // Get total stock for a product (all variants)
    const getProductTotalStock = useCallback((product: any) => {
        return (product.variants || []).reduce((sum: number, v: any) => sum + getStock(v.id), 0);
    }, [inventory]);

    // Get price range for product
    const getPriceRange = useCallback((product: any) => {
        const prices = (product.variants || []).map((v: any) => Number(v.salePrice)).filter((p: number) => p > 0);
        if (prices.length === 0) return { min: 0, max: 0 };
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        return { min, max };
    }, []);

    const addToCart = (product: any, variant: any) => {
        const existing = cart.find(c => c.variantId === variant.id);
        const stock = getStock(variant.id);
        if (existing) {
            if (existing.quantity >= stock) return;
            setCart(cart.map(c => c.variantId === variant.id ? { ...c, quantity: c.quantity + 1 } : c));
        } else {
            if (stock <= 0) return;
            setCart([...cart, {
                variantId: variant.id, sku: variant.sku, productName: product.name,
                imageUrl: product.imageUrl || '',
                size: variant.size || '', color: variant.color || '',
                salePrice: Number(variant.salePrice), costPrice: Number(variant.costPrice),
                quantity: 1, discount: 0, stock,
            }]);
        }
        setSelectedProduct(null);
    };

    const updateQuantity = (variantId: string, qty: number) => {
        if (qty <= 0) setCart(cart.filter(c => c.variantId !== variantId));
        else setCart(cart.map(c => c.variantId === variantId ? { ...c, quantity: Math.min(qty, c.stock) } : c));
    };

    const updateItemDiscount = (variantId: string, discount: number) => {
        setCart(cart.map(c => c.variantId === variantId ? { ...c, discount } : c));
    };

    // Totals
    const subtotal = cart.reduce((s, c) => s + (c.salePrice * c.quantity), 0);
    const itemDiscounts = cart.reduce((s, c) => s + c.discount, 0);
    const saleDiscount = subtotal * (discountPercent / 100);
    const total = subtotal - itemDiscounts - saleDiscount;

    const maxDiscountPercent = Number(user?.maxDiscountPercent || 10);
    const maxDiscountValue = Number(user?.maxDiscountValue || 50);
    const discountExceeded = discountPercent > maxDiscountPercent ||
        cart.some(c => c.discount > maxDiscountValue);

    // Checkout
    const handleCheckout = async () => {
        if (!branchId || cart.length === 0) return;
        if (discountExceeded && !managerOverrideBy) { setShowPinModal(true); return; }

        const payload: any = {
            branchId,
            items: cart.map(c => ({ variantId: c.variantId, quantity: c.quantity, discount: c.discount })),
            discountPercent,
            idempotencyKey: generateIdempotencyKey(),
            managerOverrideBy: managerOverrideBy || undefined,
            paymentMethod,
            notes: saleNotes || undefined,
            paidAmount: (paymentMethod === 'DELIVERY' || paymentMethod === 'BANK_TRANSFER') ? 0 : total,
        };
        if (paymentMethod === 'BANK_TRANSFER') {
            payload.transferReference = transferRef || undefined;
            payload.transferBankName = transferBank || undefined;
            payload.transferAmount = total;
        }
        if (paymentMethod === 'DELIVERY') {
            payload.customerName = customerName || undefined;
            payload.customerPhone = customerPhone || undefined;
            payload.deliveryAddress = deliveryAddress || undefined;
            payload.deliveryCity = deliveryCity || undefined;
            payload.deliveryCompany = deliveryCompany || undefined;
            payload.deliveryFee = deliveryFee || undefined;
        }

        setLoading(true);
        try {
            if (isOnline) {
                const result = await salesApi.create(token!, payload);
                setSaleResult(result);
            } else {
                await addToOutbox('sale', payload);
                setSaleResult({ offline: true, total });
            }
            setCart([]); setDiscountPercent(0); setManagerOverrideBy(null);
            setPaymentMethod('CASH'); setSaleNotes('');
            setTransferRef(''); setTransferBank('');
            setCustomerName(''); setCustomerPhone(''); setDeliveryAddress(''); setDeliveryCity(''); setDeliveryCompany(''); setDeliveryFee(0);
        } catch (err: any) { toast.error(t('common.error') + ': ' + err.message); }
        finally { setLoading(false); }
    };

    // Manager PIN verification
    const verifyPin = async () => {
        if (!token || !branchId) return;
        setPinError('');
        try {
            const result = await authApi.verifyPin(token, branchId, pin);
            setManagerOverrideBy(result.managerId);
            setShowPinModal(false); setPin('');
            setTimeout(handleCheckout, 100);
        } catch (err: any) { setPinError(err.message || t('common.error')); }
    };

    // Product image helper
    const imgSrc = (imageUrl?: string) => {
        if (!imageUrl) return '';
        if (imageUrl.startsWith('http')) return imageUrl;
        return `${API_URL}${imageUrl}`;
    };

    const fmt = (n: number) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Group products by category (deduplicated — one per product)
    const groupedProducts = useMemo(() => {
        const q = search.toLowerCase();
        // Filter products
        const filtered = products.filter(p => {
            if (!q) return true;
            if (p.name.toLowerCase().includes(q)) return true;
            if ((p.nameAr || '').toLowerCase().includes(q)) return true;
            if ((p.brand || '').toLowerCase().includes(q)) return true;
            if ((p.variants || []).some((v: any) => {
                if (v.sku.toLowerCase().includes(q)) return true;
                if ((v.size || '').toLowerCase().includes(q)) return true;
                if ((v.color || '').toLowerCase().includes(q)) return true;
                // Also match against barcode-encoded value
                const barcodeVal = sanitizeForBarcode(v.sku || '').toLowerCase();
                if (barcodeVal.includes(q)) return true;
                return false;
            })) return true;
            return false;
        });

        // Filter by category
        const catFiltered = selectedCategory === 'all'
            ? filtered
            : filtered.filter(p => p.categoryId === selectedCategory);

        // Filter out products with 0 stock in the selected branch
        const stockFiltered = catFiltered.filter(p => {
            const totalStock = (p.variants || []).reduce((sum: number, v: any) => sum + getStock(v.id), 0);
            return totalStock > 0;
        });

        // Group by category
        const groups: { categoryName: string; categoryId: string; products: any[] }[] = [];
        const catMap = new Map<string, any[]>();

        for (const p of stockFiltered) {
            const catId = p.categoryId || 'uncategorized';
            if (!catMap.has(catId)) catMap.set(catId, []);
            catMap.get(catId)!.push(p);
        }

        for (const [catId, prods] of catMap) {
            const cat = categories.find((c: any) => c.id === catId);
            groups.push({
                categoryId: catId,
                categoryName: cat?.name || t('common.all'),
                products: prods,
            });
        }

        groups.sort((a, b) => {
            if (a.categoryName === t('common.all')) return 1;
            if (b.categoryName === t('common.all')) return -1;
            return a.categoryName.localeCompare(b.categoryName);
        });

        return groups;
    }, [products, categories, search, selectedCategory, inventory, t]);

    // Available categories for filter tabs
    const availableCategories = useMemo(() => {
        const catIds = new Set(products.map(p => p.categoryId).filter(Boolean));
        return categories.filter((c: any) => catIds.has(c.id));
    }, [products, categories]);

    return (
        <div className="pos-layout">
            {/* Barcode Scanner Indicator */}
            {scannerActive && (
                <div style={{
                    position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 9999, background: 'rgba(34, 197, 94, 0.95)', color: '#fff',
                    padding: '8px 24px', borderRadius: 30, fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 10,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
                    animation: 'pulse 0.5s ease-in-out infinite',
                }}>
                    <span style={{ fontSize: 20 }}>📡</span>
                    {t('pos.scanning')}... <span style={{ fontFamily: 'monospace', letterSpacing: 2 }}>{scannerBuffer}</span>
                </div>
            )}

            {/* Left: Products */}
            <div className="pos-products">
                {/* Search bar */}
                <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="simple-search__wrap" style={{ flex: 1 }}>
                        <span className="simple-search__icon">🔍</span>
                        <input
                            type="text"
                            className="simple-search__input"
                            placeholder={t('pos.searchPlaceholder')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && search.trim().length >= 3) {
                                    e.preventDefault();
                                    // Try exact barcode/SKU match and add to cart
                                    processScan(search.trim());
                                    setSearch('');
                                }
                            }}
                            autoFocus
                            autoComplete="off"
                            spellCheck={false}
                        />
                        {search && (
                            <button
                                className="simple-search__clear"
                                onClick={() => setSearch('')}
                                type="button"
                            >✕</button>
                        )}
                    </div>
                    {/* Scanner status indicator */}
                    <div title={t('pos.scannerReady')} style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, cursor: 'default',
                    }}>
                        📡
                    </div>
                </div>

                {/* Category tabs */}
                <div style={{
                    display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto',
                    paddingBottom: 4, scrollbarWidth: 'thin',
                }}>
                    <button
                        onClick={() => setSelectedCategory('all')}
                        style={{
                            padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                            background: selectedCategory === 'all' ? 'var(--gold)' : 'var(--bg-secondary)',
                            color: selectedCategory === 'all' ? '#000' : 'var(--text-secondary)',
                            fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
                            transition: 'all 0.2s',
                            borderBottom: selectedCategory === 'all' ? '2px solid var(--gold)' : '2px solid transparent',
                        }}
                    >
                        {t('common.all')}
                    </button>
                    {availableCategories.map((cat: any) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            style={{
                                padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                                background: selectedCategory === cat.id ? 'var(--gold)' : 'var(--bg-secondary)',
                                color: selectedCategory === cat.id ? '#000' : 'var(--text-secondary)',
                                fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
                                transition: 'all 0.2s',
                                borderBottom: selectedCategory === cat.id ? '2px solid var(--gold)' : '2px solid transparent',
                            }}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>

                {!branchId && (
                    <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                        {t('pos.selectBranchMsg')}
                    </div>
                )}

                {/* Products grouped by category */}
                {groupedProducts.map(group => (
                    <div key={group.categoryId} style={{ marginBottom: 24 }}>
                        {/* Category header */}
                        {selectedCategory === 'all' && (
                            <div style={{
                                fontSize: 14, fontWeight: 700, color: 'var(--gold)',
                                marginBottom: 10, paddingBottom: 6,
                                borderBottom: '1px solid var(--border)',
                                display: 'flex', alignItems: 'center', gap: 8,
                                textTransform: 'uppercase', letterSpacing: 1,
                            }}>
                                <span style={{ opacity: 0.6 }}>⬥</span>
                                {group.categoryName}
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>
                                    ({group.products.length})
                                </span>
                            </div>
                        )}

                        {/* Product cards (one per product) */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                            gap: 10,
                        }}>
                            {group.products.map((product: any) => {
                                const totalStock = getProductTotalStock(product);
                                const priceRange = getPriceRange(product);
                                const hasImage = !!product.imageUrl;
                                const variantCount = (product.variants || []).length;
                                const sizes = (product.variants || [])
                                    .map((v: any) => v.size).filter(Boolean);
                                const uniqueSizes = [...new Set(sizes)];
                                const inCart = cart.some(c =>
                                    (product.variants || []).some((v: any) => v.id === c.variantId)
                                );

                                return (
                                    <div key={product.id}
                                        onClick={() => {
                                            if (variantCount === 1) {
                                                addToCart(product, product.variants[0]);
                                            } else {
                                                setSelectedProduct(product);
                                            }
                                        }}
                                        style={{
                                            opacity: totalStock <= 0 ? 0.35 : 1,
                                            pointerEvents: totalStock <= 0 ? 'none' : 'auto',
                                            background: inCart ? 'rgba(212, 175, 55, 0.08)' : 'var(--bg-secondary)',
                                            borderRadius: 12,
                                            border: inCart ? '2px solid var(--gold)' : '1px solid var(--border)',
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.2s',
                                            position: 'relative',
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                                    >
                                        {/* In-cart indicator */}
                                        {inCart && (
                                            <div style={{
                                                position: 'absolute', top: 6, insetInlineEnd: 6, zIndex: 2,
                                                background: 'var(--gold)', color: '#000',
                                                borderRadius: '50%', width: 22, height: 22,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 11, fontWeight: 700,
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                            }}>
                                                ✓
                                            </div>
                                        )}

                                        {/* Variant count badge */}
                                        {variantCount > 1 && (
                                            <div style={{
                                                position: 'absolute', top: 6, left: 6, zIndex: 2,
                                                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                                                color: '#fff', borderRadius: 10, padding: '2px 7px',
                                                fontSize: 10, fontWeight: 600,
                                            }}>
                                                {uniqueSizes.length > 0 ? t('pos.sizesCount', { count: uniqueSizes.length }) : t('pos.variantsCount', { count: variantCount })}
                                            </div>
                                        )}

                                        {/* Product Image */}
                                        <div style={{
                                            width: '100%', aspectRatio: '1', overflow: 'hidden',
                                            background: 'var(--bg-tertiary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {hasImage ? (
                                                <img src={imgSrc(product.imageUrl)} alt="" loading="lazy"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <span style={{ fontSize: 36, opacity: 0.15 }}>👕</span>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div style={{ padding: '8px 10px' }}>
                                            <div style={{
                                                fontWeight: 600, fontSize: 13,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {product.name}
                                            </div>
                                            {product.brand && (
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                                                    {product.brand}
                                                </div>
                                            )}
                                            <div style={{
                                                display: 'flex', justifyContent: 'space-between',
                                                alignItems: 'center', marginTop: 5,
                                            }}>
                                                <span style={{ fontWeight: 700, color: 'var(--gold)', fontSize: 13 }}>
                                                    {priceRange.min === priceRange.max
                                                        ? fmt(priceRange.min)
                                                        : `${fmt(priceRange.min)}–${fmt(priceRange.max)}`
                                                    }
                                                </span>
                                                <span style={{
                                                    fontSize: 10,
                                                    color: totalStock <= 5 ? 'var(--red)' : 'var(--text-muted)',
                                                    fontWeight: totalStock <= 5 ? 600 : 400,
                                                }}>
                                                    {t('pos.left', { count: totalStock })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {groupedProducts.length === 0 && branchId && (
                    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                        {search ? t('pos.noProductsMatch') : t('pos.noProductsAvailable')}
                    </div>
                )}
            </div>

            {/* Right: Cart */}
            <div className="pos-cart">
                <div className="pos-cart-header">
                    {t('pos.cart')} ({cart.reduce((s, c) => s + c.quantity, 0)} {t('pos.items')})
                    {!isOnline && <span className="badge badge-red" style={{ marginInlineStart: 8 }}>{t('common.offline')}</span>}
                </div>

                <div className="pos-cart-items">
                    {cart.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{t('pos.cartEmpty')}</div>
                    ) : (
                        cart.map(item => (
                            <div key={item.variantId} className="pos-cart-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    {/* Cart Thumbnail */}
                                    <div style={{
                                        width: 40, height: 40, minWidth: 40, borderRadius: 6,
                                        overflow: 'hidden', background: 'var(--bg-tertiary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        border: '1px solid var(--border)',
                                    }}>
                                        {item.imageUrl ? (
                                            <img src={imgSrc(item.imageUrl)} alt="" loading="lazy"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <span style={{ fontSize: 16, opacity: 0.3 }}>📦</span>
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.productName}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {item.size && <span style={{
                                                background: 'var(--bg-tertiary)', padding: '1px 6px',
                                                borderRadius: 4, marginInlineEnd: 4, fontWeight: 600,
                                            }}>{item.size}</span>}
                                            {item.sku}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'end' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--gold)' }}>
                                            {fmt(item.salePrice * item.quantity - item.discount)} {t('common.lyd')}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => updateQuantity(item.variantId, item.quantity - 1)}>−</button>
                                    <span style={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</span>
                                    <button className="btn btn-secondary btn-sm" onClick={() => updateQuantity(item.variantId, item.quantity + 1)}>+</button>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>@ {fmt(item.salePrice)}</span>
                                    <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <input type="number" min={0} step="0.5"
                                            value={item.discount || ''} onChange={e => updateItemDiscount(item.variantId, Number(e.target.value) || 0)}
                                            placeholder={t('pos.disc')}
                                            style={{ width: 60, padding: '4px 6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, textAlign: 'end' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="pos-cart-total">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                        <span>{t('pos.subtotal')}</span><span>{fmt(subtotal)} {t('common.lyd')}</span>
                    </div>
                    {itemDiscounts > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: 'var(--red)' }}>
                            <span>{t('pos.itemDiscounts')}</span><span>-{fmt(itemDiscounts)} {t('common.lyd')}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 13 }}>{t('pos.saleDiscount')}</span>
                        <input type="number" min={0} max={100} step={1}
                            value={discountPercent || ''} onChange={e => setDiscountPercent(Number(e.target.value) || 0)}
                            style={{ width: 60, padding: '4px 8px', background: 'var(--bg-tertiary)', border: `1px solid ${discountExceeded ? 'var(--red)' : 'var(--border)'}`, borderRadius: 4, color: 'var(--text-primary)', fontSize: 13, textAlign: 'end' }}
                        />
                        {saleDiscount > 0 && <span style={{ fontSize: 12, color: 'var(--red)' }}>-{fmt(saleDiscount)}</span>}
                    </div>
                    {discountExceeded && !managerOverrideBy && (
                        <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>
                            {t('pos.discountExceeded', { maxPercent: maxDiscountPercent, maxValue: fmt(maxDiscountValue) })}
                        </div>
                    )}
                    {managerOverrideBy && (
                        <div style={{ fontSize: 11, color: 'var(--green)', marginBottom: 8 }}>{t('pos.managerApproved')}</div>
                    )}
                    {/* Payment Method */}
                    <div style={{ marginBottom: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('pos.paymentMethod')}</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {[{ k: 'CASH', icon: '💵', label: t('pos.cashLabel') }, { k: 'CARD', icon: '💳', label: t('pos.cardLabel') }, { k: 'BANK_TRANSFER', icon: '🏦', label: t('pos.bankLabel') }, { k: 'DELIVERY', icon: '🚚', label: t('pos.deliveryLabel') }].map(m => (
                                <button key={m.k}
                                    className={`btn btn-sm ${paymentMethod === m.k ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ flex: 1, minWidth: 'calc(50% - 4px)', fontSize: 11 }}
                                    onClick={() => setPaymentMethod(m.k)}>
                                    {m.icon} {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Bank Transfer Fields */}
                    {paymentMethod === 'BANK_TRANSFER' && (
                        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input className="form-input" placeholder={t('pos.bankName')}
                                    value={transferBank} onChange={e => setTransferBank(e.target.value)}
                                    style={{ fontSize: 12, padding: '6px 10px', flex: 1 }} />
                                <input className="form-input" placeholder={t('pos.transferRef')}
                                    value={transferRef} onChange={e => setTransferRef(e.target.value)}
                                    style={{ fontSize: 12, padding: '6px 10px', flex: 1 }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--gold)' }}>{t('pos.bankPending')}</span>
                        </div>
                    )}
                    {/* Delivery Fields */}
                    {paymentMethod === 'DELIVERY' && (
                        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input className="form-input" placeholder={t('pos.customerName')}
                                    value={customerName} onChange={e => setCustomerName(e.target.value)}
                                    style={{ fontSize: 12, padding: '6px 10px', flex: 1 }} />
                                <input className="form-input" placeholder={t('pos.phoneNumber')}
                                    value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                                    style={{ fontSize: 12, padding: '6px 10px', flex: 1 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input className="form-input" placeholder={t('pos.cityLabel')}
                                    value={deliveryCity} onChange={e => setDeliveryCity(e.target.value)}
                                    style={{ fontSize: 12, padding: '6px 10px', flex: '0 0 120px' }} />
                                <input className="form-input" placeholder={t('pos.fullAddress')}
                                    value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)}
                                    style={{ fontSize: 12, padding: '6px 10px', flex: 1 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <select className="form-input" value={deliveryCompany} onChange={e => setDeliveryCompany(e.target.value)}
                                    style={{ fontSize: 12, padding: '6px 10px', flex: 1 }}>
                                    <option value="">{t('pos.deliveryCompany')}</option>
                                    <option value="SELF_PICKUP">{t('pos.selfPickup')}</option>
                                    <option value="SPRINT">Sprint</option>
                                    <option value="YALLA_DELIVERY">Yalla Delivery</option>
                                    <option value="WASIL">Wasil</option>
                                    <option value="OTHER">{t('common.all')}</option>
                                </select>
                                <input className="form-input" type="number" min={0} step={1} placeholder={t('pos.deliveryFee')}
                                    value={deliveryFee || ''} onChange={e => setDeliveryFee(Number(e.target.value) || 0)}
                                    style={{ fontSize: 12, padding: '6px 10px', flex: '0 0 100px' }} />
                            </div>
                            <input className="form-input" placeholder={t('pos.deliveryNotes')}
                                value={saleNotes} onChange={e => setSaleNotes(e.target.value)}
                                style={{ fontSize: 12, padding: '6px 10px' }} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('pos.deliveryUnpaid')}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
                        <span>{t('pos.total')}</span><span style={{ color: 'var(--gold)' }}>{fmt(total)} {t('common.lyd')}</span>
                    </div>
                    <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={handleCheckout} disabled={loading || cart.length === 0 || !branchId}>
                        {loading ? t('pos.processing') : isOnline ? (
                            paymentMethod === 'DELIVERY' ? t('pos.createDeliverySale') :
                                paymentMethod === 'BANK_TRANSFER' ? t('pos.submitBankTransfer') :
                                    t('pos.completeSale')
                        ) : t('pos.queueOffline')}
                    </button>
                </div>
            </div>

            {/* ─── SIZE / VARIANT PICKER MODAL ─── */}
            {selectedProduct && (
                <div className="modal-overlay" onClick={() => setSelectedProduct(null)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{
                        maxWidth: 500, width: '90vw', maxHeight: '80vh', overflow: 'auto',
                    }}>
                        {/* Product header */}
                        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                            <div style={{
                                width: 100, height: 100, borderRadius: 12, overflow: 'hidden',
                                background: 'var(--bg-tertiary)', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {selectedProduct.imageUrl ? (
                                    <img src={imgSrc(selectedProduct.imageUrl)} alt=""
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{ fontSize: 40, opacity: 0.15 }}>👕</span>
                                )}
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 20 }}>{selectedProduct.name}</h2>
                                {selectedProduct.brand && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
                                        {selectedProduct.brand}
                                    </div>
                                )}
                                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                                    {t('pos.pickSize')}
                                </div>
                            </div>
                        </div>

                        {/* Variant grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                            gap: 8,
                        }}>
                            {(selectedProduct.variants || []).map((variant: any) => {
                                const stock = getStock(variant.id);
                                const inCart = cart.some(c => c.variantId === variant.id);
                                const cartItem = cart.find(c => c.variantId === variant.id);
                                return (
                                    <button
                                        key={variant.id}
                                        onClick={() => addToCart(selectedProduct, variant)}
                                        disabled={stock <= 0}
                                        style={{
                                            padding: '12px 10px',
                                            borderRadius: 10,
                                            border: inCart ? '2px solid var(--gold)' : '1px solid var(--border)',
                                            background: inCart ? 'rgba(212, 175, 55, 0.1)' : 'var(--bg-secondary)',
                                            cursor: stock <= 0 ? 'not-allowed' : 'pointer',
                                            opacity: stock <= 0 ? 0.35 : 1,
                                            textAlign: 'center',
                                            transition: 'all 0.15s',
                                            position: 'relative',
                                        }}
                                    >
                                        {/* Size label */}
                                        <div style={{
                                            fontSize: 18, fontWeight: 700,
                                            color: inCart ? 'var(--gold)' : 'var(--text-primary)',
                                            marginBottom: 4,
                                        }}>
                                            {variant.size || variant.color || t('pos.default')}
                                        </div>
                                        {/* Price */}
                                        <div style={{
                                            fontSize: 13, fontWeight: 600,
                                            color: 'var(--gold)',
                                        }}>
                                            {fmt(variant.salePrice)} {t('common.lyd')}
                                        </div>
                                        {/* Stock */}
                                        <div style={{
                                            fontSize: 11, marginTop: 4,
                                            color: stock <= 5 ? 'var(--red)' : 'var(--text-muted)',
                                            fontWeight: stock <= 5 ? 600 : 400,
                                        }}>
                                            {stock <= 0 ? t('pos.outOfStock') : t('pos.inStock', { count: stock })}
                                        </div>
                                        {/* In cart indicator */}
                                        {inCart && cartItem && (
                                            <div style={{
                                                position: 'absolute', top: -6, right: -6,
                                                background: 'var(--gold)', color: '#000',
                                                borderRadius: '50%', width: 22, height: 22,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 11, fontWeight: 700,
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                            }}>
                                                {cartItem.quantity}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <button className="btn btn-secondary" style={{
                            width: '100%', justifyContent: 'center', marginTop: 16,
                        }} onClick={() => setSelectedProduct(null)}>
                            {t('pos.done')}
                        </button>
                    </div>
                </div>
            )}

            {/* Manager PIN Modal */}
            {showPinModal && (
                <div className="modal-overlay" onClick={() => setShowPinModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{t('pos.managerOverride')}</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
                            {t('pos.discountExceedsLimit')}
                        </p>
                        {pinError && (
                            <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                                {pinError}
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">{t('pos.managerPin')}</label>
                            <input type="password" className="form-input" maxLength={10}
                                value={pin} onChange={e => setPin(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && verifyPin()}
                                autoFocus placeholder={t('pos.enterPin')} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}
                                onClick={() => { setShowPinModal(false); setPin(''); setPinError(''); }}>{t('common.cancel')}</button>
                            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                                onClick={verifyPin}>{t('pos.verifyAndContinue')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sale Success Modal */}
            {saleResult && (
                <div className="modal-overlay" onClick={() => setSaleResult(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>{saleResult.offline ? '📤' : '✅'}</div>
                        <h2>{saleResult.offline ? t('pos.saleQueued') : t('pos.saleComplete')}</h2>
                        {saleResult.invoiceNumber && (
                            <p style={{ color: 'var(--gold)', fontSize: 18, fontWeight: 600, marginTop: 8 }}>
                                #{saleResult.invoiceNumber}
                            </p>
                        )}
                        <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                            {t('pos.totalLabel')} {fmt(saleResult.total || 0)} {t('common.lyd')}
                        </p>
                        {saleResult.offline && (
                            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                                {t('pos.syncWhenOnline')}
                            </p>
                        )}
                        <button className="btn btn-primary" style={{ marginTop: 20 }}
                            onClick={() => setSaleResult(null)}>{t('common.ok')}</button>
                    </div>
                </div>
            )}
        </div>
    );
}

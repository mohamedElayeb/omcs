'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { storefrontApi, ordersApi, imgSrc, formatPrice } from '../lib/api';
import { useCart, CartItem } from '../lib/cart';

// ─── Types ───
interface Variant {
  id: string; sku: string; size: string; color: string;
  salePrice: number; inStock: boolean; stockQuantity: number;
  totalStock: number;
  branches?: { branchId: string; branchName: string; quantity: number }[];
}

interface ProductCard {
  id: string; name: string; nameAr: string; brand: string;
  imageUrl: string; minPrice: number; maxPrice: number;
  totalStock: number; inStock: boolean;
  category: { id: string; name: string; nameAr: string } | null;
  variants: Variant[];
}

interface ProductDetail {
  id: string; name: string; nameAr: string; brand: string;
  imageUrl: string;
  category: { id: string; name: string; nameAr: string } | null;
  variants: Variant[];
}

type Page = 'shop' | 'checkout' | 'success' | 'track';

// ─── Hero Slides ───
const HERO_SLIDES = [
  {
    bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
    badge: '✦ موسم جديد',
    title: 'تشكيلة أزياء فاخرة',
    subtitle: 'اكتشف ماركات أصلية بأسعار لا تُقاوم. توصيل مجاني في جميع أنحاء ليبيا.',
  },
  {
    bg: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #0a0a0a 100%)',
    badge: '🔥 كمية محدودة',
    title: 'إصدارات حصرية',
    subtitle: 'تسوق Nike, Zara, H&M والمزيد — بأسعار الأوتلت.',
  },
  {
    bg: 'linear-gradient(135deg, #16213e 0%, #0f3460 50%, #1a1a2e 100%)',
    badge: '⚡ عرض خاص',
    title: 'خصومات تصل إلى 50%',
    subtitle: 'لا تفوّت أكبر تخفيضاتنا لهذا الموسم. لفترة محدودة فقط.',
  },
];

const WS_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

export default function StorefrontPage() {
  // ─── State ───
  const [page, setPage] = useState<Page>('shop');
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [sort, setSort] = useState('newest');
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [detailImgIdx, setDetailImgIdx] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [orderResult, setOrderResult] = useState<any>(null);
  const [trackNumber, setTrackNumber] = useState('');
  const [trackResult, setTrackResult] = useState<any>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [reservationRemaining, setReservationRemaining] = useState<number | null>(null);
  const [reservationExpired, setReservationExpired] = useState(false);
  const [heroSlide, setHeroSlide] = useState(0);

  // Cart
  const cart = useCart();
  const cartCount = useMemo(() => cart.getItemCount(), [cart.items]);
  const cartSubtotal = useMemo(() => cart.getSubtotal(), [cart.items]);

  // Checkout form
  const [form, setForm] = useState({
    customerName: '', customerPhone: '', customerEmail: '',
    shippingAddress: '', shippingCity: '', addressNotes: '',
    paymentMethod: 'BANK_TRANSFER', deliveryCompany: '',
  });
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  // ─── Hero slider auto-play ───
  useEffect(() => {
    const timer = setInterval(() => {
      setHeroSlide(s => (s + 1) % HERO_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // ─── Load data ───
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await storefrontApi.getProducts({
        search, category: selectedCategory, brand: selectedBrand, sort, limit: 48,
      });
      setProducts(data.products || []);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory, selectedBrand, sort]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  useEffect(() => {
    storefrontApi.getCategories().then(setCategories).catch(console.error);
    storefrontApi.getBrands().then(setBrands).catch(console.error);
  }, []);

  // ─── Real-time: auto-refresh when products change ───
  useEffect(() => {
    const socket = io(`${WS_URL}/ws`, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('🔌 Storefront WS connected');
    });

    socket.on('product.changed', () => {
      console.log('📦 Product changed — refreshing catalog');
      loadProducts();
      storefrontApi.getCategories().then(setCategories).catch(console.error);
      storefrontApi.getBrands().then(setBrands).catch(console.error);
    });

    socket.on('inventory.updated', () => {
      // Stock levels changed — refresh products to update availability
      loadProducts();
    });

    return () => {
      socket.disconnect();
    };
  }, [loadProducts]);

  // ─── Derived data ───
  const bestSellers = useMemo(() =>
    [...products].sort((a, b) => a.totalStock - b.totalStock).slice(0, 8),
    [products]
  );
  const lowStockProducts = useMemo(() =>
    products.filter(p => p.totalStock > 0 && p.totalStock <= 5).slice(0, 4),
    [products]
  );

  // ─── View product detail ───
  const viewProduct = async (productId: string) => {
    const detail = await storefrontApi.getProduct(productId);
    setProductDetail(detail);
    setSelectedVariant(detail?.variants?.[0] || null);
    setAddQty(1);
    setDetailImgIdx(0);
  };

  // ─── Quick add (first available variant) ───
  const quickAdd = (e: React.MouseEvent, product: ProductCard) => {
    e.stopPropagation();
    const v = product.variants.find(v => v.inStock);
    if (!v) return;
    cart.addItem({
      variantId: v.id, productId: product.id,
      productName: product.name, brand: product.brand || '',
      imageUrl: product.imageUrl || '',
      size: v.size || '', color: v.color || '',
      sku: v.sku || '', salePrice: v.salePrice,
    }, 1);
    setToast(`✓ تمت إضافة ${product.name} إلى السلة`);
    setTimeout(() => setToast(''), 3000);
  };

  // ─── Add to cart ───
  const addToCart = (variant: Variant) => {
    if (!productDetail || !variant) return;
    cart.addItem({
      variantId: variant.id, productId: productDetail.id,
      productName: productDetail.name, brand: productDetail.brand || '',
      imageUrl: productDetail.imageUrl || '',
      size: variant.size || '', color: variant.color || '',
      sku: variant.sku || '', salePrice: variant.salePrice,
    }, addQty);
    setToast(`✓ تمت إضافة ${productDetail.name} إلى السلة`);
    setTimeout(() => setToast(''), 3000);
    setProductDetail(null);
  };

  // ─── Checkout ───
  const handleCheckout = async () => {
    setCheckoutError('');
    if (!form.customerName || !form.customerPhone || !form.shippingAddress || !form.shippingCity) {
      setCheckoutError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    if (cart.items.length === 0) {
      setCheckoutError('سلة التسوق فارغة');
      return;
    }
    setCheckoutLoading(true);
    try {
      const result = await ordersApi.create({
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail || undefined,
        shippingAddress: form.shippingAddress,
        shippingCity: form.shippingCity,
        addressNotes: form.addressNotes || undefined,
        paymentMethod: form.paymentMethod,
        deliveryCompany: form.deliveryCompany || undefined,
        items: cart.items.map(i => ({ variantId: i.variantId, quantity: i.quantity })),
      });
      setOrderResult(result);
      cart.clearCart();
      setPage('success');
    } catch (err: any) {
      setCheckoutError(err.message || 'فشل في إرسال الطلب');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ─── Track order ───
  const [trackError, setTrackError] = useState('');
  const handleTrack = async () => {
    const num = trackNumber.trim();
    if (!num) return;
    setTrackLoading(true); setTrackError(''); setTrackResult(null);
    try {
      const result = await ordersApi.track(num);
      setTrackResult(result);
    } catch (err: any) {
      setTrackResult(null);
      setTrackError(err.message || 'Order not found.');
    } finally { setTrackLoading(false); }
  };

  // ─── Reservation Countdown ───
  useEffect(() => {
    if (!orderResult?.reservationExpiresAt || page !== 'success') return;
    const expiresAt = new Date(orderResult.reservationExpiresAt).getTime();
    const tick = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) { setReservationRemaining(0); setReservationExpired(true); return; }
      setReservationRemaining(Math.ceil(diff / 1000));
      setReservationExpired(false);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [orderResult?.reservationExpiresAt, page]);

  // ─── WhatsApp URL ───
  const getWhatsAppUrl = () => {
    if (!orderResult) return '#';
    const phone = '218915666605';
    const msg = `مرحباً OMCS,\n\nلقد أتممت التحويل البنكي.\n\nرقم الطلب: ${orderResult.orderNumber}\nالمبلغ: ${formatPrice(orderResult.total)} د.ل\nالمرجع: ${orderResult.orderNumber}\n\nيرجى تأكيد الدفع.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };
  const fmtCountdown = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Scroll to products ───
  const scrollToProducts = () => {
    document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  // ─── Product Card Component ───
  const ProductCardComponent = ({ p, onClick }: { p: ProductCard; onClick: () => void }) => {
    const isLow = p.totalStock > 0 && p.totalStock <= 5;
    const isSelling = p.totalStock > 0 && p.totalStock <= 10;
    return (
      <div className="product-card" onClick={onClick}>
        <div className="img-wrap">
          {p.imageUrl ? (
            <img src={imgSrc(p.imageUrl)} alt={p.name} loading="lazy" />
          ) : (
            <span className="img-placeholder">👟</span>
          )}
          {/* Badges */}
          <div className="card-badges">
            {isLow && <span className="badge-selling-fast">باقي {p.totalStock} فقط</span>}
            {!isLow && isSelling && <span className="badge-new">يباع بسرعة</span>}
          </div>
          {/* Wishlist */}
          <button className="card-wishlist" onClick={e => e.stopPropagation()}>♡</button>
          {/* Quick Add Overlay */}
          {p.inStock && (
            <div className="card-overlay">
              <button className="quick-add-btn" onClick={e => quickAdd(e, p)}>
                + إضافة سريعة
              </button>
            </div>
          )}
        </div>
        <div className="card-body">
          {p.brand && <div className="brand">{p.brand}</div>}
          <div className="name">{p.name}</div>
          {p.variants.length > 0 && (
            <div className="sizes-row">
              {Array.from(new Set(p.variants.map(v => v.size).filter(Boolean))).slice(0, 5).map(s => (
                <span key={s} className="size-chip">{s}</span>
              ))}
              {p.variants.length > 5 && <span className="size-chip">+{p.variants.length - 5}</span>}
            </div>
          )}
          <div className="price-row">
            <span className="price">
              {formatPrice(p.minPrice)} <small>د.ل</small>
              {p.maxPrice > p.minPrice && <> – {formatPrice(p.maxPrice)}</>}
            </span>
            {isLow && <span className="stock-badge low">باقي {p.totalStock}!</span>}
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <>
      {/* ─── HEADER ─── */}
      <header className="header">
        <div className="header-inner">
          <button className="logo" onClick={() => { setPage('shop'); setProductDetail(null); }}>
            <img src="/logo.png" alt="OMCS" className="logo-img" />
          </button>
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              placeholder="ابحث عن منتجات، ماركات..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setPage('shop')}
            />
          </div>
          <div className="header-actions">
            <button className="btn btn-outline" style={{ padding: '7px 16px', fontSize: '.82rem', borderRadius: 100 }}
              onClick={() => { setPage('track'); setTrackResult(null); }}>
              تتبع الطلب
            </button>
            <button className="cart-btn" onClick={() => setCartOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></svg>
              السلة
              {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* ─── TOAST ─── */}
      {toast && <div className="toast">{toast}</div>}

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  SHOP PAGE                                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      {page === 'shop' && !productDetail && (
        <>
          {/* ─── HERO ─── */}
          <section className="hero">
            {/* Animated background */}
            <div className="hero-bg">
              {HERO_SLIDES.map((slide, i) => (
                <div
                  key={i}
                  className={`hero-bg-slide ${i === heroSlide ? 'active' : ''}`}
                >
                  <div className="hero-bg-gradient" style={{ background: slide.bg }} />
                </div>
              ))}
            </div>
            {/* Floating orbs */}
            <div className="hero-orb hero-orb-1" />
            <div className="hero-orb hero-orb-2" />
            <div className="hero-orb hero-orb-3" />
            {/* Content */}
            <div className="hero-content">
              <div className="hero-badge">{HERO_SLIDES[heroSlide].badge}</div>
              <h1 className="gradient-text">{HERO_SLIDES[heroSlide].title}</h1>
              <p>{HERO_SLIDES[heroSlide].subtitle}</p>
              <button className="hero-cta" onClick={scrollToProducts}>
                تسوق الآن
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>
            </div>
            <div className="hero-dots">
              {HERO_SLIDES.map((_, i) => (
                <button key={i} className={`hero-dot ${i === heroSlide ? 'active' : ''}`} onClick={() => setHeroSlide(i)} />
              ))}
            </div>
          </section>

          {/* ─── SCROLLING MARQUEE ─── */}
          <div className="marquee-strip">
            <div className="marquee-track">
              {[...Array(2)].map((_, idx) => (
                <span key={idx} style={{ display: 'contents' }}>
                  <span>🚚 توصيل مجاني في جميع أنحاء ليبيا</span><span className="dot" />
                  <span>🔒 دفع آمن</span><span className="dot" />
                  <span>✦ ماركات أصلية 100%</span><span className="dot" />
                  <span>↩️ إرجاع سهل</span><span className="dot" />
                  <span>⚡ وصول جديد أسبوعياً</span><span className="dot" />
                  <span>🏆 جودة عالية</span><span className="dot" />
                  <span>🚚 توصيل مجاني في جميع أنحاء ليبيا</span><span className="dot" />
                  <span>🔒 دفع آمن</span><span className="dot" />
                  <span>✦ ماركات أصلية 100%</span><span className="dot" />
                  <span>↩️ إرجاع سهل</span><span className="dot" />
                  <span>⚡ وصول جديد أسبوعياً</span><span className="dot" />
                  <span>🏆 جودة عالية</span><span className="dot" />
                </span>
              ))}
            </div>
          </div>

          {/* ─── BEST SELLERS ─── */}
          {!loading && bestSellers.length > 0 && !search && !selectedCategory && !selectedBrand && (
            <section className="container" style={{ paddingTop: 48 }}>
              <div className="section-header">
                <div>
                  <h2 className="section-title">الأكثر مبيعاً</h2>
                  <p className="section-subtitle">المنتجات الأكثر شعبية هذا الأسبوع</p>
                </div>
                <button className="section-link" onClick={scrollToProducts}>
                  عرض الكل ←
                </button>
              </div>
              <div className="products-grid">
                {bestSellers.map(p => (
                  <ProductCardComponent key={`bs-${p.id}`} p={p} onClick={() => viewProduct(p.id)} />
                ))}
              </div>
            </section>
          )}

          {/* ─── LOW STOCK / SPECIAL OFFERS ─── */}
          {!loading && lowStockProducts.length > 0 && !search && !selectedCategory && !selectedBrand && (
            <section className="container" style={{ paddingTop: 8 }}>
              <div className="section-header">
                <div>
                  <h2 className="section-title" style={{ color: 'var(--red)' }}>🔥 يباع بسرعة</h2>
                  <p className="section-subtitle">احصل عليها قبل نفاد الكمية — مخزون محدود!</p>
                </div>
              </div>
              <div className="products-grid">
                {lowStockProducts.map(p => (
                  <ProductCardComponent key={`lw-${p.id}`} p={p} onClick={() => viewProduct(p.id)} />
                ))}
              </div>
            </section>
          )}

          {/* ─── ALL PRODUCTS ─── */}
          <div className="container" id="products-section" style={{ paddingTop: 48 }}>
            <div className="section-header">
              <h2 className="section-title">جميع المنتجات</h2>
            </div>

            {/* Filters */}
            <div className="filters-bar">
              <button className={`filter-chip ${!selectedCategory ? 'active' : ''}`}
                onClick={() => setSelectedCategory('')}>الكل</button>
              {categories.map((c: any) => (
                <button key={c.id}
                  className={`filter-chip ${selectedCategory === c.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(selectedCategory === c.id ? '' : c.id)}>
                  {c.name}
                </button>
              ))}
              {brands.length > 0 && (
                <select className="filter-select" value={selectedBrand}
                  onChange={e => setSelectedBrand(e.target.value)}>
                  <option value="">جميع الماركات</option>
                  {brands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              <select className="filter-select" value={sort}
                onChange={e => setSort(e.target.value)}>
                <option value="newest">الأحدث</option>
                <option value="price_asc">السعر: من الأقل</option>
                <option value="price_desc">السعر: من الأعلى</option>
                <option value="name">الاسم أ-ي</option>
              </select>
            </div>

            {/* Grid */}
            {loading ? (
              <div className="products-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="product-card">
                    <div className="skeleton" style={{ paddingTop: '125%' }} />
                    <div className="card-body">
                      <div className="skeleton" style={{ height: 10, width: '35%', marginBottom: 8 }} />
                      <div className="skeleton" style={{ height: 14, width: '75%', marginBottom: 10 }} />
                      <div className="skeleton" style={{ height: 18, width: '45%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: .4 }}>🔍</div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>لم يتم العثور على منتجات</div>
                <div style={{ fontSize: '.88rem', marginTop: 6 }}>حاول تعديل البحث أو الفلاتر</div>
              </div>
            ) : (
              <div className="products-grid">
                {products.map(p => (
                  <ProductCardComponent key={p.id} p={p} onClick={() => viewProduct(p.id)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  PRODUCT DETAIL MODAL                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      {productDetail && page === 'shop' && (
        <div className="modal-overlay" onClick={() => setProductDetail(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 700, fontSize: '1rem' }}>{productDetail.name}</h2>
              <button className="modal-close" onClick={() => setProductDetail(null)}>✕</button>
            </div>
            <div className="product-detail">
              <div className="detail-image">
                {(() => {
                  const allImages = (productDetail as any).images?.length > 0
                    ? (productDetail as any).images.map((img: any) => imgSrc(img.imageUrl))
                    : productDetail.imageUrl ? [imgSrc(productDetail.imageUrl)] : [];
                  if (allImages.length === 0) return (
                    <div className="gallery-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '4rem', opacity: .15 }}>👟</span>
                    </div>
                  );
                  const currentIdx = detailImgIdx % allImages.length;
                  return (
                    <>
                      <div className="gallery-main">
                        <img src={allImages[currentIdx]} alt={productDetail.name} />
                        {allImages.length > 1 && (
                          <span className="gallery-counter">{currentIdx + 1} / {allImages.length}</span>
                        )}
                      </div>
                      {allImages.length > 1 && (
                        <div className="gallery-thumbs">
                          {allImages.map((url: string, i: number) => (
                            <button key={i}
                              className={`gallery-thumb ${i === currentIdx ? 'active' : ''}`}
                              onClick={() => setDetailImgIdx(i)}>
                              <img src={url} alt="" />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="detail-info">
                {productDetail.brand && <div className="detail-brand">{productDetail.brand}</div>}
                <h2>{productDetail.name}</h2>
                {selectedVariant && (
                  <div className="detail-price">
                    {formatPrice(selectedVariant.salePrice)} <small>د.ل</small>
                  </div>
                )}
                {/* Size selector */}
                {productDetail.variants.some(v => v.size) && (
                  <div className="variant-selector">
                    <h4>المقاس</h4>
                    <div className="variant-options">
                      {productDetail.variants.map(v => (
                        <button key={v.id}
                          className={`variant-option ${selectedVariant?.id === v.id ? 'selected' : ''} ${!v.inStock ? 'out-of-stock' : ''}`}
                          onClick={() => v.inStock && setSelectedVariant(v)}
                          disabled={!v.inStock}>
                          {v.size || v.color || v.sku}
                          {v.totalStock <= 3 && v.inStock && <span style={{ fontSize: '.68rem', color: 'var(--danger)', marginLeft: 4 }}>({v.totalStock})</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Quantity */}
                <div className="qty-selector">
                  <label>الكمية</label>
                  <div className="qty-controls">
                    <button onClick={() => setAddQty(Math.max(1, addQty - 1))}>−</button>
                    <span>{addQty}</span>
                    <button onClick={() => setAddQty(addQty + 1)}>+</button>
                  </div>
                </div>
                {/* Add to cart */}
                <button className="btn btn-primary btn-full"
                  disabled={!selectedVariant || !selectedVariant.inStock}
                  onClick={() => selectedVariant && addToCart(selectedVariant)}>
                  أضف إلى السلة — {selectedVariant ? formatPrice(selectedVariant.salePrice * addQty) : 0} د.ل
                </button>
                {/* Stock */}
                {selectedVariant && selectedVariant.totalStock <= 5 && selectedVariant.inStock && (
                  <div style={{ marginTop: 12, fontSize: '.82rem', color: 'var(--danger)', fontWeight: 600 }}>
                    ⚡ باقي {selectedVariant.totalStock} فقط في المخزون
                  </div>
                )}
                {selectedVariant && selectedVariant.branches && selectedVariant.branches.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: '.82rem', color: 'var(--text-muted)' }}>
                    متوفر في: {selectedVariant.branches.map(b => b.branchName).join('، ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  CHECKOUT PAGE                                         */}
      {/* ═══════════════════════════════════════════════════════ */}
      {page === 'checkout' && (
        <div className="container">
          <h2 className="section-title" style={{ marginTop: 32, marginBottom: 24 }}>إتمام الطلب</h2>
          <div className="checkout-layout">
            <div>
              {/* Contact */}
              <div className="form-section">
                <h3>معلومات الاتصال</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>الاسم الكامل *</label>
                    <input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })}
                      placeholder="محمد أحمد" />
                  </div>
                  <div className="form-group">
                    <label>رقم الهاتف *</label>
                    <input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })}
                      placeholder="091XXXXXXX" />
                  </div>
                </div>
                <div className="form-group">
                  <label>البريد الإلكتروني (اختياري)</label>
                  <input type="email" value={form.customerEmail}
                    onChange={e => setForm({ ...form, customerEmail: e.target.value })}
                    placeholder="email@example.com" />
                </div>
              </div>

              {/* Shipping */}
              <div className="form-section">
                <h3>عنوان الشحن</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>المدينة *</label>
                    <select value={form.shippingCity}
                      onChange={e => setForm({ ...form, shippingCity: e.target.value })}>
                      <option value="">اختر المدينة...</option>
                      <option value="Tripoli">طرابلس — Tripoli</option>
                      <option value="Benghazi">بنغازي — Benghazi</option>
                      <option value="Misrata">مصراتة — Misrata</option>
                      <option value="Zawiya">الزاوية — Zawiya</option>
                      <option value="Zliten">زليتن — Zliten</option>
                      <option value="Sabratha">صبراتة — Sabratha</option>
                      <option value="Khoms">الخمس — Khoms</option>
                      <option value="Gharyan">غريان — Gharyan</option>
                      <option value="Sebha">سبها — Sebha</option>
                      <option value="Other">أخرى</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>شركة التوصيل</label>
                    <select value={form.deliveryCompany}
                      onChange={e => setForm({ ...form, deliveryCompany: e.target.value })}>
                      <option value="">اختر...</option>
                      <option value="SPRINT">Sprint</option>
                      <option value="YALLA_DELIVERY">Yalla Delivery</option>
                      <option value="WASIL">Wasil</option>
                      <option value="SELF_PICKUP">استلام ذاتي</option>
                      <option value="OTHER">أخرى</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>العنوان بالكامل *</label>
                  <textarea rows={3} value={form.shippingAddress}
                    onChange={e => setForm({ ...form, shippingAddress: e.target.value })}
                    placeholder="اسم الشارع، المبنى، رقم الشقة..." />
                </div>
                <div className="form-group">
                  <label>ملاحظات (اختياري)</label>
                  <input value={form.addressNotes}
                    onChange={e => setForm({ ...form, addressNotes: e.target.value })}
                    placeholder="تعليمات التوصيل، معالم..." />
                </div>
              </div>

              {/* Payment */}
              <div className="form-section">
                <h3>طريقة الدفع</h3>
                <div className="payment-options">
                  <button className={`payment-option ${form.paymentMethod === 'BANK_TRANSFER' ? 'selected' : ''}`}
                    onClick={() => setForm({ ...form, paymentMethod: 'BANK_TRANSFER' })}>
                    <span className="pm-icon">🏦</span>
                    <div className="pm-info">
                      <div className="pm-title">تحويل بنكي</div>
                      <div className="pm-desc">حوّل وأكد عبر الواتساب</div>
                    </div>
                  </button>
                  {/* ARCHIVED: Card Payment — uncomment when ready to implement
                  <button className={`payment-option ${form.paymentMethod === 'CARD' ? 'selected' : ''}`}
                    onClick={() => setForm({ ...form, paymentMethod: 'CARD' })}>
                    <span className="pm-icon">💳</span>
                    <div className="pm-info">
                      <div className="pm-title">Card Payment</div>
                      <div className="pm-desc">Debit or credit card</div>
                    </div>
                  </button>
                  */}
                </div>

                {/* ARCHIVED: Card Details form — uncomment when Card Payment is enabled
                {form.paymentMethod === 'CARD' && (
                  <div style={{
                    marginTop: 16, padding: 20, background: '#fafaf8',
                    borderRadius: 12, border: '1px solid var(--border)',
                  }}>
                    <div style={{ marginBottom: 14, fontWeight: 700, fontSize: '.88rem' }}>💳 Card Details</div>
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <label>Card Number</label>
                      <input placeholder="XXXX XXXX XXXX XXXX" maxLength={19}
                        style={{ letterSpacing: '2px', fontFamily: 'monospace' }}
                        onChange={e => { let v = e.target.value.replace(/\D/g, '').slice(0, 16); v = v.replace(/(.{4})/g, '$1 ').trim(); e.target.value = v; }} />
                    </div>
                    <div className="form-row" style={{ gap: 10 }}>
                      <div className="form-group">
                        <label>Expiry</label>
                        <input placeholder="MM/YY" maxLength={5}
                          onChange={e => { let v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); e.target.value = v; }} />
                      </div>
                      <div className="form-group">
                        <label>CVV</label>
                        <input type="password" placeholder="•••" maxLength={4} />
                      </div>
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 10 }}>
                      🔒 Your card details are encrypted and secure
                    </div>
                  </div>
                )}
                */}
              </div>

              {checkoutError && (
                <div style={{
                  background: 'var(--red-soft)', color: 'var(--danger)',
                  padding: '12px 16px', borderRadius: 'var(--radius)',
                  fontWeight: 600, fontSize: '.88rem', marginBottom: 16,
                }}>⚠️ {checkoutError}</div>
              )}

              <button className="btn btn-primary btn-full" onClick={handleCheckout} disabled={checkoutLoading}
                style={{ padding: '16px 28px', fontSize: '.95rem' }}>
                {checkoutLoading ? <><span className="spinner" /> جاري إرسال الطلب...</> : `إرسال الطلب — ${formatPrice(cartSubtotal)} د.ل`}
              </button>
            </div>

            {/* Order Summary */}
            <div>
              <div className="order-summary-card">
                <h3>ملخص الطلب ({cartCount} منتجات)</h3>
                {cart.items.map(item => (
                  <div key={item.variantId} className="summary-item">
                    <div className="s-thumb">
                      {item.imageUrl ? <img src={imgSrc(item.imageUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📦'}
                    </div>
                    <div className="s-info">
                      <div className="s-name">{item.productName}</div>
                      <div className="s-meta">{[item.size, item.color].filter(Boolean).join(' / ')} × {item.quantity}</div>
                    </div>
                    <div className="s-price">{formatPrice(item.salePrice * item.quantity)} د.ل</div>
                  </div>
                ))}
                <div className="cart-totals" style={{ marginTop: 14 }}>
                  <div className="row"><span>المجموع الفرعي</span><span>{formatPrice(cartSubtotal)} د.ل</span></div>
                  <div className="row"><span>التوصيل</span><span style={{ color: 'var(--text-muted)' }}>يحدد لاحقاً</span></div>
                  <div className="row total"><span>الإجمالي</span><span>{formatPrice(cartSubtotal)} د.ل</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  SUCCESS PAGE                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      {page === 'success' && orderResult && (
        <div className="success-page">
          <img src="/logo.png" alt="OMCS" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px', display: 'block' }} />
          <div className="success-icon">✅</div>
          <h1>تم تأكيد طلبك بنجاح!</h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
            {orderResult.message}
          </p>
          <div className="order-number">{orderResult.orderNumber}</div>
          <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            احفظ هذا الرقم لتتبع طلبك.
          </p>

          {/* Countdown */}
          {orderResult.paymentMethod === 'BANK_TRANSFER' && reservationRemaining !== null && (
            <div style={{
              background: reservationExpired ? '#fef2f2' : '#f0f4ff',
              border: `1.5px solid ${reservationExpired ? '#ef4444' : '#3b82f6'}`,
              borderRadius: 10, padding: '12px 18px', maxWidth: 400,
              margin: '0 auto 18px', textAlign: 'center',
            }}>
              {reservationExpired ? (
                <div style={{ fontSize: '.85rem', color: '#991b1b', fontWeight: 700 }}>
                  ⚠️ انتهى الحجز — يرجى تقديم طلب جديد.
                </div>
              ) : (
                <div style={{ fontSize: '.85rem', color: '#1e40af', fontWeight: 600 }}>
                  ⏱️ المنتجات محجوزة لمدة <strong style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{fmtCountdown(reservationRemaining)}</strong>
                </div>
              )}
            </div>
          )}

          {/* Bank Transfer */}
          {orderResult.paymentMethod === 'BANK_TRANSFER' && orderResult.paymentStatus === 'PENDING' && (
            <div style={{
              background: '#fffbeb', border: '1.5px solid #f59e0b',
              borderRadius: 12, padding: 20, maxWidth: 460, margin: '0 auto 20px', textAlign: 'left',
            }}>
              <h3 style={{ color: '#92400e', fontSize: '.95rem', marginBottom: 10, fontWeight: 700 }}>🏦 مطلوب تحويل بنكي</h3>
              <p style={{ fontSize: '.85rem', color: '#78350f', lineHeight: 1.7, marginBottom: 10 }}>
                حوّل مبلغ <strong>{formatPrice(orderResult.total)} د.ل</strong> إلى:
              </p>
              <div style={{ background: 'rgba(255,255,255,.7)', borderRadius: 8, padding: 12, fontSize: '.82rem', lineHeight: 1.8, color: '#78350f' }}>
                <div><strong>البنك:</strong> مصرف الجمهورية</div>
                <div><strong>رقم الحساب:</strong> XXXX-XXXX-XXXX</div>
                <div><strong>الاسم:</strong> OMCS</div>
                <div><strong>المرجع:</strong> {orderResult.orderNumber}</div>
              </div>
              <p style={{ fontSize: '.8rem', color: '#92400e', marginTop: 10, fontStyle: 'italic' }}>
                بعد التحويل، أكد عبر الزر أدناه.
              </p>
            </div>
          )}

          {/* WhatsApp Button */}
          {orderResult.paymentMethod === 'BANK_TRANSFER' && orderResult.paymentStatus === 'PENDING' && (
            <div style={{ maxWidth: 460, margin: '0 auto 20px' }}>
              <a href={reservationExpired ? undefined : getWhatsAppUrl()} target="_blank" rel="noopener noreferrer"
                onClick={e => { if (reservationExpired) e.preventDefault(); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  background: reservationExpired ? '#9ca3af' : 'linear-gradient(135deg, #25d366, #128c7e)',
                  color: '#fff', fontWeight: 700, fontSize: '.95rem',
                  padding: '14px 24px', borderRadius: 100, textDecoration: 'none',
                  boxShadow: reservationExpired ? 'none' : '0 4px 20px rgba(37,211,102,.35)',
                  cursor: reservationExpired ? 'not-allowed' : 'pointer',
                  opacity: reservationExpired ? .5 : 1, transition: 'all .3s ease',
                }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {reservationExpired ? 'انتهى الحجز' : 'تأكيد الدفع عبر الواتساب'}
              </a>
            </div>
          )}

          {/* COD */}
          {orderResult.paymentMethod === 'COD' && (
            <div style={{ background: '#ecfdf5', border: '1.5px solid #10b981', borderRadius: 12, padding: 18, maxWidth: 460, margin: '0 auto 20px', textAlign: 'center' }}>
              <p style={{ fontSize: '.88rem', color: '#065f46', fontWeight: 600 }}>
                💵 الدفع عند الاستلام — ادفع <strong>{formatPrice(orderResult.total)} د.ل</strong> عند التسليم.
              </p>
            </div>
          )}

          {/* Card */}
          {orderResult.paymentMethod === 'CARD' && (
            <div style={{ background: '#f5f3ff', border: '1.5px solid #8b5cf6', borderRadius: 12, padding: 18, maxWidth: 460, margin: '0 auto 20px', textAlign: 'center' }}>
              <p style={{ fontSize: '.88rem', color: '#4c1d95', fontWeight: 600 }}>
                💳 تم تأكيد الدفع — تم خصم <strong>{formatPrice(orderResult.total)} د.ل</strong>.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => { setPage('shop'); setOrderResult(null); }}>
              متابعة التسوق
            </button>
            <button className="btn btn-outline" onClick={() => {
              setTrackNumber(orderResult.orderNumber); setPage('track');
              setTimeout(async () => {
                setTrackLoading(true);
                try { setTrackResult(await ordersApi.track(orderResult.orderNumber)); }
                catch { setTrackResult(null); }
                finally { setTrackLoading(false); }
              }, 100);
            }}>
              تتبع الطلب
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  TRACK PAGE                                            */}
      {/* ═══════════════════════════════════════════════════════ */}
      {page === 'track' && (
        <div className="track-page">
          <h2 className="section-title" style={{ textAlign: 'center' }}>تتبع طلبك</h2>
          <div className="track-input-group">
            <input placeholder="أدخل رقم الطلب (OMC-...)" value={trackNumber}
              onChange={e => setTrackNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTrack()} />
            <button className="btn btn-primary" onClick={handleTrack} disabled={trackLoading}>
              {trackLoading ? <span className="spinner" /> : 'تتبع'}
            </button>
          </div>

          {trackError && (
            <div style={{ background: 'var(--red-soft)', color: 'var(--danger)', padding: '12px 16px', borderRadius: 10, fontWeight: 600, fontSize: '.88rem', marginTop: 16, textAlign: 'center' }}>
              ⚠️ {trackError}
            </div>
          )}

          {trackResult && (
            <div style={{ background: '#fff', borderRadius: 'var(--radius-xl)', padding: 24, border: '1px solid var(--border)', marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{trackResult.orderNumber}</div>
                  <div style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>
                    {new Date(trackResult.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span className={`badge ${trackResult.status === 'DELIVERED' ? 'badge-green' : trackResult.status === 'CANCELLED' ? 'badge-red' : trackResult.status === 'SHIPPED' ? 'badge-blue' : 'badge-gold'}`}>
                  {trackResult.status}
                </span>
              </div>
              <div className="status-timeline">
                {['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].map(step => {
                  const steps = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
                  const ci = steps.indexOf(trackResult.status), si = steps.indexOf(step);
                  return (
                    <div key={step} className={`timeline-step ${si === ci ? 'active' : si < ci ? 'completed' : ''}`}>
                      <div className="step-label">{step}</div>
                    </div>
                  );
                })}
              </div>
              {trackResult.trackingNumber && (
                <div style={{ marginTop: 18, padding: 14, background: 'var(--bg)', borderRadius: 'var(--radius)', fontSize: '.88rem' }}>
                  <strong>Delivery:</strong> {trackResult.deliveryCompany || '—'}<br />
                  <strong>Tracking:</strong> {trackResult.trackingNumber}
                </div>
              )}
              <div style={{ marginTop: 18 }}>
                <h4 style={{ fontWeight: 700, marginBottom: 8, fontSize: '.88rem' }}>المنتجات</h4>
                {trackResult.items?.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.88rem' }}>
                    <span>{item.productName} {item.size && `(${item.size})`} × {item.quantity}</span>
                    <span style={{ fontWeight: 700 }}>{formatPrice(item.lineTotal)} د.ل</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 800, fontSize: '1.05rem' }}>
                  <span>الإجمالي</span><span>{formatPrice(trackResult.total)} د.ل</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  CART DRAWER                                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      {cartOpen && (
        <>
          <div className="cart-drawer-overlay" onClick={() => setCartOpen(false)} />
          <div className="cart-drawer">
            <div className="cart-header">
              <h3>السلة ({cartCount})</h3>
              <button className="modal-close" onClick={() => setCartOpen(false)}>✕</button>
            </div>
            {cart.items.length === 0 ? (
              <div className="cart-empty">
                <div className="empty-icon">🛍️</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>سلتك فارغة</div>
                <div style={{ fontSize: '.85rem' }}>تصفح مجموعتنا وأضف منتجات</div>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.items.map(item => (
                    <div key={item.variantId} className="cart-item">
                      <div className="thumb">
                        {item.imageUrl ? <img src={imgSrc(item.imageUrl)} alt="" /> : <span>📦</span>}
                      </div>
                      <div className="item-details">
                        <div className="item-name">{item.productName}</div>
                        <div className="item-meta">{[item.size, item.color].filter(Boolean).join(' / ')}</div>
                        <div className="qty-controls" style={{ marginTop: 4, border: '1px solid var(--border)', borderRadius: 6, display: 'inline-flex' }}>
                          <button style={{ width: 26, height: 26, fontSize: '.85rem' }}
                            onClick={() => cart.updateQuantity(item.variantId, item.quantity - 1)}>−</button>
                          <span style={{ width: 28, fontSize: '.82rem', lineHeight: '26px' }}>{item.quantity}</span>
                          <button style={{ width: 26, height: 26, fontSize: '.85rem' }}
                            onClick={() => cart.updateQuantity(item.variantId, item.quantity + 1)}>+</button>
                        </div>
                        <div className="item-price" style={{ marginTop: 2 }}>
                          {formatPrice(item.salePrice * item.quantity)} د.ل
                        </div>
                      </div>
                      <button className="item-remove" onClick={() => cart.removeItem(item.variantId)}>✕</button>
                    </div>
                  ))}
                </div>
                <div className="cart-footer">
                  <div className="cart-totals">
                    <div className="row"><span>المجموع الفرعي</span><span>{formatPrice(cartSubtotal)} د.ل</span></div>
                    <div className="row"><span>التوصيل</span><span style={{ color: 'var(--text-muted)' }}>يحدد لاحقاً</span></div>
                    <div className="row total"><span>الإجمالي</span><span>{formatPrice(cartSubtotal)} د.ل</span></div>
                  </div>
                  <button className="btn btn-primary btn-full"
                    onClick={() => { setCartOpen(false); setPage('checkout'); }}>
                    إتمام الطلب ←
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ─── MOBILE STICKY CART ─── */}
      {page === 'shop' && cartCount > 0 && !cartOpen && (
        <div className={`mobile-cart-bar ${cartCount > 0 ? 'visible' : ''}`}
          onClick={() => setCartOpen(true)}>
          <div style={{ fontWeight: 700 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: -3 }}>
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" />
            </svg>
            {' '}{cartCount} منتجات
          </div>
          <div style={{ fontWeight: 800 }}>{formatPrice(cartSubtotal)} د.ل ←</div>
        </div>
      )}

      {/* ─── FOOTER ─── */}
      {page === 'shop' && !productDetail && (
        <footer className="footer">
          <div className="footer-grid">
            <div>
              <img src="/logo.png" alt="OMCS" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', marginBottom: 12 }} />
              <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: 10, color: '#fff' }}>OMCS</div>
              <p style={{ fontSize: '.85rem', lineHeight: 1.7 }}>
                أزياء وماركات عالمية بأسعار الأوتلت.
                نخدم عملاءنا في جميع أنحاء ليبيا بتوصيل سريع.
              </p>
            </div>
            <div>
              <h4>تسوق</h4>
              <a href="#">وصل حديثاً</a>
              <a href="#">أحذية</a>
              <a href="#">ملابس</a>
              <a href="#">إكسسوارات</a>
            </div>
            <div>
              <h4>الدعم</h4>
              <a href="#" onClick={e => { e.preventDefault(); setPage('track'); }}>تتبع الطلب</a>
              <a href="#">سياسة الإرجاع</a>
              <a href="#">اتصل بنا</a>
            </div>
            <div>
              <h4>تواصل معنا</h4>
              <a href="https://wa.me/218915666605" target="_blank" rel="noopener noreferrer">📱 +218 91 566 6605</a>
              <a href="mailto:info@omcs.com.ly">📧 info@omcs.com.ly</a>
              <a href="#">📍 طرابلس، ليبيا</a>
            </div>
          </div>
          <div className="footer-bottom">
            © 2026 OMCS. جميع الحقوق محفوظة.
          </div>
        </footer>
      )}
    </>
  );
}

'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useAuthStore } from '../../lib/store';
import { productsApi, categoriesApi, settingsApi, branchesApi } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../lib/i18n';
// Simple search — no complex component needed

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

type GeneratorMode = 'pick' | 'matrix' | 'range' | 'paste';

// ─── Size Presets ───
const SIZE_PRESETS = {
    clothing: { label: '👕 Clothing', sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'] },
    jeans: {
        label: '👖 Jeans', sizes: [
            '28/30', '28/32', '28/34',
            '30/30', '30/32', '30/34', '30/36',
            '32/30', '32/32', '32/34', '32/36', '32/38',
            '34/30', '34/32', '34/34', '34/36', '34/38',
            '36/32', '36/34', '36/36', '36/38',
            '38/32', '38/34', '38/36', '38/38',
            '40/34', '40/36', '40/38',
            '42/34', '42/36', '42/38',
        ]
    },
    shoes: { label: '👟 Shoes', sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'] },
    polo: { label: '👔 Polo Shirts', sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'] },
};
type SizePresetKey = keyof typeof SIZE_PRESETS;

// Map category names to size presets
const CATEGORY_PRESET_MAP: Record<string, SizePresetKey> = {
    'shoes': 'shoes',
    'jeans': 'jeans',
    'polo shirts': 'polo',
    'polo': 'polo',
    't-shirts': 'clothing',
    'jackets': 'clothing',
    'clothing': 'clothing',
    'hoodies': 'clothing',
    'sweaters': 'clothing',
};

interface VariantRow {
    sku: string;
    size: string;
    color: string;
    costUsd: string;
    sellUsd: string;
    costPrice: string;
    salePrice: string;
    marginOverride: string;
}

// Round UP to nearest 5 LYD for sale price (Libya requirement)
const roundUp5 = (price: number): number => Math.ceil(price / 5) * 5;

export default function ProductsPage() {
    const { token } = useAuthStore();
    const toast = useToast();
    const { t } = useTranslation();
    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [brandFilter, setBrandFilter] = useState('');
    const [stockFilter, setStockFilter] = useState<'all' | 'inStock' | 'lowStock' | 'outOfStock'>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    const [showCreate, setShowCreate] = useState(false);
    const [newProduct, setNewProduct] = useState({ name: '', nameAr: '', brand: '', categoryId: '' });
    const [variants, setVariants] = useState<VariantRow[]>([]);
    const [creating, setCreating] = useState(false);

    // Edit product state
    const [editProduct, setEditProduct] = useState<any>(null);
    const [editForm, setEditForm] = useState({ name: '', nameAr: '', brand: '', categoryId: '' });
    const [editImageFiles, setEditImageFiles] = useState<File[]>([]);
    const [editImagePreviews, setEditImagePreviews] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // Image upload state (create form — multi-image)
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editFileInputRef = useRef<HTMLInputElement>(null);
    const [previewModal, setPreviewModal] = useState<string | null>(null);
    // Carousel index per product card
    const [cardImageIndex, setCardImageIndex] = useState<Record<string, number>>({});

    // Generator state
    const [genMode, setGenMode] = useState<GeneratorMode>('pick');
    const [matrixSizes, setMatrixSizes] = useState('');
    const [matrixColors, setMatrixColors] = useState('');
    const [rangeFrom, setRangeFrom] = useState('');
    const [rangeTo, setRangeTo] = useState('');
    const [rangeStep, setRangeStep] = useState('1');
    const [rangeColors, setRangeColors] = useState('');
    // Quick pick state
    const [pickPreset, setPickPreset] = useState<SizePresetKey>('clothing');
    const [pickedSizes, setPickedSizes] = useState<Set<string>>(new Set());
    const [pickColors, setPickColors] = useState('');
    const [pasteText, setPasteText] = useState('');
    const [bulkCost, setBulkCost] = useState('');
    const [bulkSale, setBulkSale] = useState('');
    const [bulkCostUsd, setBulkCostUsd] = useState('');
    const [bulkSellUsd, setBulkSellUsd] = useState('');

    // Helper: compute LYD from USD for display
    const costLydFromUsd = (costUsd: string) => {
        const n = Number(costUsd);
        if (!n || n <= 0) return '';
        return (n * (Number(purchaseUsdRate) || usdRate)).toFixed(2);
    };
    const saleLydFromUsd = (sellUsd: string) => {
        const n = Number(sellUsd);
        if (!n || n <= 0) return '';
        return String(roundUp5(n * sellingUsdRate));
    };

    // USD rates & margin
    const [usdRate, setUsdRate] = useState(6.30);          // purchase rate (parallelUsdRate)
    const [sellingUsdRate, setSellingUsdRate] = useState(6.30); // selling rate
    const [defaultMargin, setDefaultMargin] = useState(35);

    // Purchase data
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
    const [purchaseUsdRate, setPurchaseUsdRate] = useState('');

    // Initial stock
    const [branches, setBranches] = useState<any[]>([]);
    const [initialBranchId, setInitialBranchId] = useState('');

    // Validation
    const [errors, setErrors] = useState<string[]>([]);

    const loadData = async () => {
        if (!token) return;
        const query = new URLSearchParams();
        if (search) query.set('search', search);
        if (categoryFilter) query.set('categoryId', categoryFilter);
        try {
            const [p, c, s, b] = await Promise.all([
                productsApi.findAll(token, query.toString()),
                categoriesApi.findAll(token),
                settingsApi.getAll(token),
                branchesApi.findAll(token),
            ]);
            setProducts(p);
            setCategories(c);
            setBranches(b);
            const purchaseRate = Number(s.parallelUsdRate) || 6.30;
            const sellRate = Number(s.sellingUsdRate) || purchaseRate;
            setUsdRate(purchaseRate);
            setSellingUsdRate(sellRate);
            setDefaultMargin(Number(s.defaultMarginPercent) || 35);
            if (!purchaseUsdRate) setPurchaseUsdRate(String(purchaseRate));
            if (b.length > 0 && !initialBranchId) setInitialBranchId(b[0].id);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, [token, categoryFilter]);

    // Search input ref for focus shortcut
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Debounced server search
    useEffect(() => {
        if (!search.trim()) return;
        const t = setTimeout(() => { loadData(); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    // Ctrl+K / "/" shortcut to focus search
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName))) {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // Derive unique brands from loaded products
    const brands = useMemo(() => {
        const set = new Set<string>();
        products.forEach((p: any) => { if (p.brand) set.add(p.brand); });
        return Array.from(set).sort();
    }, [products]);

    // Client-side instant filter (search + category + brand + stock)
    const filteredProducts = useMemo(() => {
        return products.filter((p: any) => {
            // Text search
            if (search.trim()) {
                const q = search.toLowerCase().trim();
                const name = (p.name || '').toLowerCase();
                const nameAr = (p.nameAr || '').toLowerCase();
                const brand = (p.brand || '').toLowerCase();
                const cat = (p.category?.name || '').toLowerCase();
                const skus = (p.variants || []).map((v: any) => (v.sku || '').toLowerCase()).join(' ');
                const sizes = (p.variants || []).map((v: any) => (v.size || '').toLowerCase()).join(' ');
                if (!(name.includes(q) || nameAr.includes(q) || brand.includes(q) || cat.includes(q) || skus.includes(q) || sizes.includes(q))) return false;
            }
            // Brand filter
            if (brandFilter && p.brand !== brandFilter) return false;
            // Stock filter
            if (stockFilter !== 'all') {
                const vs = p.variants || [];
                const totalQty = vs.reduce((s: number, v: any) => s + (Number(v.quantity) || 0), 0);
                const hasLow = vs.some((v: any) => {
                    const qty = Number(v.quantity) || 0;
                    const thresh = Number(v.lowStockThreshold) || 5;
                    return qty > 0 && qty <= thresh;
                });
                if (stockFilter === 'inStock' && totalQty <= 0) return false;
                if (stockFilter === 'lowStock' && !hasLow) return false;
                if (stockFilter === 'outOfStock' && totalQty > 0) return false;
            }
            return true;
        });
    }, [products, search, brandFilter, stockFilter]);

    // Image helpers
    const imgSrc = (imageUrl?: string) => {
        if (!imageUrl) return '';
        if (imageUrl.startsWith('http')) return imageUrl;
        return `${API_URL}${imageUrl}`;
    };

    const handleImageSelect = (file: File) => {
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) { toast.warning('Only JPG, PNG, WEBP images allowed'); return; }
        if (file.size > 50 * 1024 * 1024) { toast.warning('Max file size is 50MB'); return; }
        setImageFiles(prev => [...prev, file]);
        const reader = new FileReader();
        reader.onload = (e) => setImagePreviews(prev => [...prev, e.target?.result as string]);
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setDragActive(false);
        if (e.dataTransfer.files?.[0]) handleImageSelect(e.dataTransfer.files[0]);
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragActive(true); };
    const handleDragLeave = () => setDragActive(false);

    // ─── GENERATORS ───
    const parseSeparated = (s: string): string[] =>
        s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);

    // Compute LYD prices from USD
    // costLyd = costUsd × purchaseUsdRate (immutable historical cost)
    // saleLyd = sellUsd × sellingUsdRate (or fallback: margin-based from costUsd)
    const calcFromUsd = (costUsdStr: string, sellUsdStr?: string, marginStr?: string) => {
        const costUsd = Number(costUsdStr);
        const sellUsdVal = Number(sellUsdStr);
        const rateToUse = Number(purchaseUsdRate) || usdRate;

        const costLyd = costUsd > 0 ? Math.round(costUsd * rateToUse * 100) / 100 : 0;

        let saleLyd = 0;
        if (sellUsdVal > 0) {
            // Primary: sellUsd × sellingUsdRate
            saleLyd = roundUp5(sellUsdVal * sellingUsdRate);
        } else if (costUsd > 0) {
            // Fallback: margin-based from costUsd
            const margin = Number(marginStr) || defaultMargin;
            saleLyd = roundUp5(costLyd / (1 - margin / 100));
        }

        return {
            costPrice: costLyd > 0 ? String(costLyd) : '',
            salePrice: saleLyd > 0 ? String(saleLyd) : '',
        };
    };

    const makeRow = (size: string, color: string): VariantRow => {
        const calc = calcFromUsd(bulkCostUsd, bulkSellUsd);
        return {
            sku: '', size, color,
            costUsd: bulkCostUsd, sellUsd: bulkSellUsd,
            costPrice: calc.costPrice || bulkCost,
            salePrice: calc.salePrice || bulkSale,
            marginOverride: '',
        };
    };

    const generateMatrix = () => {
        const sizes = parseSeparated(matrixSizes);
        const colors = parseSeparated(matrixColors);
        if (sizes.length === 0) { toast.warning('Enter at least one size'); return; }
        const rows: VariantRow[] = [];
        if (colors.length === 0) {
            for (const size of sizes) rows.push(makeRow(size, ''));
        } else {
            for (const size of sizes) for (const color of colors)
                rows.push(makeRow(size, color));
        }
        setVariants(prev => [...prev, ...rows]);
    };

    const generateRange = () => {
        const from = Number(rangeFrom), to = Number(rangeTo), step = Number(rangeStep) || 1;
        if (isNaN(from) || isNaN(to) || from > to) { toast.warning('Invalid range'); return; }
        const colors = parseSeparated(rangeColors);
        const rows: VariantRow[] = [];
        for (let s = from; s <= to; s += step) {
            const size = String(s);
            if (colors.length === 0) rows.push(makeRow(size, ''));
            else for (const color of colors) rows.push(makeRow(size, color));
        }
        setVariants(prev => [...prev, ...rows]);
    };

    const generatePaste = () => {
        const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) { toast.warning('Paste at least one line'); return; }
        const rows: VariantRow[] = [];
        for (const line of lines) {
            const parts = line.split(/[\t,]+/).map(p => p.trim());
            rows.push(makeRow(parts[0] || '', parts[1] || ''));
        }
        setVariants(prev => [...prev, ...rows]);
    };

    // Quick pick: toggle a size on/off
    const togglePickSize = (size: string) => {
        setPickedSizes(prev => {
            const next = new Set(prev);
            if (next.has(size)) next.delete(size); else next.add(size);
            return next;
        });
    };

    // Quick pick: select all sizes in current preset
    const pickAll = () => {
        setPickedSizes(new Set(SIZE_PRESETS[pickPreset].sizes));
    };

    // Quick pick: clear all
    const pickNone = () => setPickedSizes(new Set());

    // Quick pick: generate variants from selected sizes
    const generateFromPick = () => {
        if (pickedSizes.size === 0) { toast.warning('Select at least one size'); return; }
        const colors = parseSeparated(pickColors);
        const sizes = SIZE_PRESETS[pickPreset].sizes.filter(s => pickedSizes.has(s)); // maintain order
        const rows: VariantRow[] = [];
        for (const size of sizes) {
            if (colors.length === 0) rows.push(makeRow(size, ''));
            else for (const color of colors) rows.push(makeRow(size, color));
        }
        setVariants(prev => [...prev, ...rows]);
        setPickedSizes(new Set()); // clear after generating
    };

    const autoGenerateSkus = () => {
        // Helper: strip non-ASCII, keep only A-Z, 0-9
        const asciiOnly = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

        // Helper: generate a short numeric hash from a string (for Arabic names)
        const shortHash = (s: string) => {
            let h = 0;
            for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
            return Math.abs(h % 10000).toString().padStart(3, '0');
        };

        const brand = newProduct.brand || 'OM';
        const brandCode = asciiOnly(brand).substring(0, 3) || shortHash(brand).substring(0, 3);

        // For product name: try ASCII first, fall back to numeric hash
        const rawProdCode = asciiOnly(newProduct.name);
        const prodCode = rawProdCode.length >= 2
            ? rawProdCode.substring(0, 4)
            : shortHash(newProduct.name);

        setVariants(prev => prev.map((v, idx) => {
            const colorCode = v.color ? (asciiOnly(v.color).substring(0, 3) || shortHash(v.color).substring(0, 3)) : '';
            const sizePart = asciiOnly(v.size) || v.size.replace(/[^0-9]/g, '') || String(idx);
            const sku = colorCode
                ? `OM-${brandCode}-${prodCode}-${sizePart}-${colorCode}`
                : `OM-${brandCode}-${prodCode}-${sizePart}`;
            return { ...v, sku };
        }));
    };

    const applyCostToAll = () => { if (bulkCost) setVariants(prev => prev.map(v => ({ ...v, costPrice: bulkCost }))); };
    const applySaleToAll = () => {
        if (!bulkSale) return;
        const rounded = String(roundUp5(Number(bulkSale)));
        setVariants(prev => prev.map(v => ({ ...v, salePrice: rounded })));
    };
    const applyCostUsdToAll = () => {
        if (!bulkCostUsd && !bulkSellUsd) return;
        setVariants(prev => prev.map(v => {
            const newCostUsd = bulkCostUsd || v.costUsd;
            const newSellUsd = bulkSellUsd || v.sellUsd;
            const calc = calcFromUsd(newCostUsd, newSellUsd, v.marginOverride);
            return { ...v, costUsd: newCostUsd, sellUsd: newSellUsd, costPrice: calc.costPrice || v.costPrice, salePrice: calc.salePrice || v.salePrice };
        }));
    };
    const removeVariant = (idx: number) => setVariants(prev => prev.filter((_, i) => i !== idx));
    const updateVariant = (idx: number, field: keyof VariantRow, value: string) => {
        setVariants(prev => prev.map((v, i) => {
            if (i !== idx) return v;
            const updated = { ...v, [field]: value };
            // Auto-calc when costUsd, sellUsd, or marginOverride changes
            if (field === 'costUsd' || field === 'sellUsd' || field === 'marginOverride') {
                const cUsd = field === 'costUsd' ? value : v.costUsd;
                const sUsd = field === 'sellUsd' ? value : v.sellUsd;
                const mOvr = field === 'marginOverride' ? value : v.marginOverride;
                const calc = calcFromUsd(cUsd, sUsd, mOvr);
                if (calc.costPrice) updated.costPrice = calc.costPrice;
                if (calc.salePrice) updated.salePrice = calc.salePrice;
            }
            return updated;
        }));
    };

    // Round sale price on blur (when user manually types a value)
    const roundSalePriceOnBlur = (idx: number) => {
        setVariants(prev => prev.map((v, i) => {
            if (i !== idx) return v;
            const n = Number(v.salePrice);
            if (n > 0) return { ...v, salePrice: String(roundUp5(n)) };
            return v;
        }));
    };

    // ─── VALIDATION ───
    const validate = (): string[] => {
        const errs: string[] = [];
        if (!newProduct.name.trim()) errs.push('Product name is required');
        if (variants.length === 0) errs.push('Add at least one variant');
        const skus = new Set<string>(), combos = new Set<string>();
        variants.forEach((v, i) => {
            if (!v.sku.trim()) errs.push(`Row ${i + 1}: SKU is required`);
            else if (skus.has(v.sku.toUpperCase())) errs.push(`Duplicate SKU: ${v.sku}`);
            else skus.add(v.sku.toUpperCase());
            const combo = `${v.size.toLowerCase()}__${v.color.toLowerCase()}`;
            if (combos.has(combo)) errs.push(`Duplicate Size/Color: ${v.size} / ${v.color || '(none)'}`);
            else combos.add(combo);
            // Must have USD values OR manual LYD values
            const hasCostUsd = v.costUsd && Number(v.costUsd) > 0;
            const hasSellUsd = v.sellUsd && Number(v.sellUsd) > 0;
            const hasCostLyd = v.costPrice && !isNaN(Number(v.costPrice)) && Number(v.costPrice) > 0;
            const hasSaleLyd = v.salePrice && !isNaN(Number(v.salePrice)) && Number(v.salePrice) > 0;
            if (!hasCostUsd && !hasCostLyd) errs.push(`Row ${i + 1}: Enter Cost USD`);
            if (!hasSellUsd && !hasSaleLyd) errs.push(`Row ${i + 1}: Enter Sell USD`);
        });
        return errs;
    };

    // ─── CREATE ───
    const handleCreate = async () => {
        const errs = validate();
        if (errs.length > 0) { setErrors(errs); return; }
        setErrors([]);
        if (!token) return;
        setCreating(true);
        try {
            // Step 1: Upload first image if selected (becomes primary/imageUrl)
            let imageUrl: string | undefined;
            if (imageFiles.length > 0) {
                const uploadResult = await productsApi.uploadImage(token, imageFiles[0]);
                imageUrl = uploadResult.imageUrl;
            }

            // Step 2: Create product with variants + purchase data + initial stock
            const rateAtPurchase = Number(purchaseUsdRate) || usdRate;
            const created = await productsApi.create(token, {
                ...newProduct,
                imageUrl,
                variants: variants.map(v => {
                    // Compute LYD from USD at submission time
                    const costUsd = v.costUsd ? Number(v.costUsd) : undefined;
                    const sellUsd = v.sellUsd ? Number(v.sellUsd) : undefined;
                    const computedCostLyd = costUsd ? Math.round(costUsd * rateAtPurchase * 100) / 100 : Number(v.costPrice) || 0;
                    const computedSaleLyd = sellUsd ? roundUp5(sellUsd * sellingUsdRate) : roundUp5(Number(v.salePrice) || 0);

                    return {
                        sku: v.sku.trim(), size: v.size.trim(), color: v.color.trim(),
                        costUsd,
                        sellUsd,
                        costPrice: computedCostLyd,
                        salePrice: computedSaleLyd,
                        marginPercent: v.marginOverride ? Number(v.marginOverride) : undefined,
                        purchaseUsdRate: costUsd ? rateAtPurchase : undefined,
                        costLydAtPurchase: computedCostLyd,
                        purchaseDate: purchaseDate || undefined,
                    };
                }),
                initialStock: initialBranchId ? { branchId: initialBranchId } : undefined,
            });
            // Step 3: Upload additional images to product_images table
            if (created?.id && imageFiles.length > 0) {
                // First image as primary
                await productsApi.addImage(token, created.id, imageFiles[0], true);
                // Additional images
                for (let i = 1; i < imageFiles.length; i++) {
                    await productsApi.addImage(token, created.id, imageFiles[i]);
                }
            }
            setShowCreate(false);
            resetForm();
            loadData();
        } catch (err: any) { toast.error(err.message); }
        finally { setCreating(false); }
    };

    const resetForm = () => {
        setNewProduct({ name: '', nameAr: '', brand: '', categoryId: '' });
        setVariants([]);
        setMatrixSizes(''); setMatrixColors('');
        setRangeFrom(''); setRangeTo(''); setRangeStep('1'); setRangeColors('');
        setPasteText('');
        setBulkCost(''); setBulkSale(''); setBulkCostUsd(''); setBulkSellUsd('');
        setErrors([]);
        setImageFiles([]); setImagePreviews([]);
        setPurchaseDate(new Date().toISOString().slice(0, 10));
    };

    // ─── EDIT PRODUCT ───
    const openEdit = (p: any) => {
        setEditProduct(p);
        setEditForm({ name: p.name || '', nameAr: p.nameAr || '', brand: p.brand || '', categoryId: p.categoryId || p.category?.id || '' });
        // Load existing images
        const existingImages = (p.images || []).map((img: any) => imgSrc(img.imageUrl));
        setEditImagePreviews(existingImages.length > 0 ? existingImages : (p.imageUrl ? [imgSrc(p.imageUrl)] : []));
        setEditImageFiles([]);
    };

    const handleEditSave = async () => {
        if (!token || !editProduct) return;
        setSaving(true);
        try {
            // Upload new images
            for (const file of editImageFiles) {
                await productsApi.addImage(token, editProduct.id, file);
            }
            // Update product fields
            await productsApi.update(token, editProduct.id, editForm);
            // Update variant sizes (existing) and create new variants
            for (const v of editProduct.variants || []) {
                if (v._isNew) {
                    await productsApi.addVariant(token, editProduct.id, {
                        sku: v.sku, size: v.size, color: v.color,
                        costPrice: v.costPrice || 0, salePrice: v.salePrice || 0,
                    });
                } else {
                    await productsApi.updateVariant(token, v.id, { size: v.size });
                }
            }
            setEditProduct(null);
            loadData();
        } catch (err: any) { toast.error(err.message); }
        finally { setSaving(false); }
    };

    // Auto-select size preset when category changes
    const handleCategoryChange = (categoryId: string) => {
        setNewProduct(prev => ({ ...prev, categoryId }));
        const cat = categories.find((c: any) => c.id === categoryId);
        if (cat) {
            const preset = CATEGORY_PRESET_MAP[cat.name.toLowerCase()];
            if (preset) {
                setPickPreset(preset);
                setPickedSizes(new Set());
            }
        }
    };

    const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ─── Shared UI Model ───
    interface ProductUIModel {
        id: string;
        name: string;
        nameAr: string;
        brand: string;
        category: string;
        imageUrl: string;
        imageUrls: string[];
        sizes: string[];
        prices: number[];
        priceDisplay: string;
        margins: string[];
        marginDisplay: string;
        marginAvg: number;
        totalQty: number;
        lowStock: boolean;
        variantCount: number;
        raw: any;
    }

    const productModels = useMemo((): ProductUIModel[] => {
        return filteredProducts.map((p: any) => {
            const vs = p.variants || [];
            const allPrices = vs.map((v: any) => Number(v.salePrice)).filter((n: number) => n > 0);
            const uniquePrices = [...new Set(allPrices)] as number[];
            const allMargins = vs.map((v: any) => Number(v.profitMargin || 0).toFixed(1));
            const uniqueMargins = [...new Set(allMargins)] as string[];
            const sizes: string[] = vs.map((v: any) => v.size).filter(Boolean);
            const totalQty = vs.reduce((s: number, v: any) => s + (Number(v.quantity) || 0), 0);
            const lowStock = vs.some((v: any) => {
                const qty = Number(v.quantity) || 0;
                const threshold = Number(v.lowStockThreshold) || 5;
                return qty > 0 && qty <= threshold;
            });
            const marginAvg = allMargins.length > 0 ? allMargins.reduce((s: number, m: string) => s + Number(m), 0) / allMargins.length : 0;

            let priceDisplay = '—';
            if (uniquePrices.length === 1) priceDisplay = `${fmt(uniquePrices[0])}`;
            else if (uniquePrices.length > 1) priceDisplay = `${fmt(Math.min(...uniquePrices))} – ${fmt(Math.max(...uniquePrices))}`;

            let marginDisplay = '—';
            if (uniqueMargins.length === 1) marginDisplay = `${uniqueMargins[0]}%`;
            else if (uniqueMargins.length > 1) marginDisplay = `${uniqueMargins[0]}–${uniqueMargins[uniqueMargins.length - 1]}%`;

            const imageUrls = (p.images || []).length > 0
                ? (p.images as any[]).map((img: any) => imgSrc(img.imageUrl))
                : (p.imageUrl ? [imgSrc(p.imageUrl)] : []);

            return {
                id: p.id,
                name: p.name || '',
                nameAr: p.nameAr || '',
                brand: p.brand || '',
                category: p.category?.name || '',
                imageUrl: imageUrls[0] || '',
                imageUrls,
                sizes,
                prices: uniquePrices,
                priceDisplay,
                margins: uniqueMargins,
                marginDisplay,
                marginAvg,
                totalQty,
                lowStock,
                variantCount: vs.length,
                raw: p,
            };
        });
    }, [filteredProducts]);

    // Restore viewMode from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('productsViewMode');
            if (saved === 'grid' || saved === 'table') setViewMode(saved);
        }
    }, []);

    const handleViewModeChange = (mode: 'grid' | 'table') => {
        setViewMode(mode);
        if (typeof window !== 'undefined') localStorage.setItem('productsViewMode', mode);
    };

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{t('common.loading')}</div>;

    return (
        <div>
            {/* ─── TOOLBAR (Sales-page style) ─── */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Search Input */}
                <div className="simple-search" style={{ minWidth: 200, maxWidth: 320, flex: 1 }}>
                    <div className="simple-search__wrap">
                        <span className="simple-search__icon">🔍</span>
                        <input
                            ref={searchInputRef}
                            type="text"
                            className="simple-search__input"
                            value={search}
                            onChange={e => { setSearch(e.target.value); if (!e.target.value) loadData(); }}
                            placeholder={t('products.searchPlaceholder')}
                            autoComplete="off"
                            spellCheck={false}
                        />
                        {search && (
                            <button
                                className="simple-search__clear"
                                onClick={() => { setSearch(''); searchInputRef.current?.focus(); loadData(); }}
                                type="button"
                            >✕</button>
                        )}
                    </div>
                </div>

                {/* Stock Quick Chips */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {[
                        { key: 'all' as const, label: t('products.stockAll') },
                        { key: 'inStock' as const, label: t('products.inStockBadge') },
                        { key: 'lowStock' as const, label: t('products.lowStockBadge') },
                        { key: 'outOfStock' as const, label: t('products.noStockBadge') },
                    ].map(chip => (
                        <button
                            key={chip.key}
                            className={`btn btn-secondary btn-sm ${stockFilter === chip.key ? 'filter-chip--active' : ''}`}
                            style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={() => setStockFilter(chip.key)}
                        >{chip.label}</button>
                    ))}
                </div>

                {/* Category Dropdown */}
                <select className="branch-selector" value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}>
                    <option value="">{t('products.allCategories')}</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                {/* Brand Dropdown */}
                <select className="branch-selector" value={brandFilter}
                    onChange={e => setBrandFilter(e.target.value)}>
                    <option value="">{t('products.allBrands')}</option>
                    {brands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>

                {/* Right side: count + view + add */}
                <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filteredProducts.length} {t('products.title')}</span>
                    {/* View Switcher */}
                    <div className="view-switcher">
                        <button
                            className={`view-switcher__btn ${viewMode === 'grid' ? 'view-switcher__btn--active' : ''}`}
                            onClick={() => handleViewModeChange('grid')}
                        >▦</button>
                        <button
                            className={`view-switcher__btn ${viewMode === 'table' ? 'view-switcher__btn--active' : ''}`}
                            onClick={() => handleViewModeChange('table')}
                        >☰</button>
                    </div>
                    <button className="btn btn-primary" onClick={() => { resetForm(); setShowCreate(true); }}>{t('products.newProduct')}</button>
                </div>
            </div>

            {/* ═══════════ GRID VIEW ═══════════ */}
            {viewMode === 'grid' && (
                <div className="product-grid">
                    {productModels.length === 0 && (
                        <div className="product-grid__empty">
                            <div className="product-grid__empty-icon">📦</div>
                            <div className="product-grid__empty-text">{t('products.emptyTitle')}</div>
                            <div style={{ fontSize: 13, marginTop: 6 }}>{t('products.emptySubtitle')}</div>
                        </div>
                    )}
                    {productModels.map(pm => (
                        <div key={pm.id} className="product-card" onClick={() => openEdit(pm.raw)}>
                            {/* Image Carousel */}
                            <div className="product-card__image">
                                {(() => {
                                    const imgs = pm.imageUrls;
                                    const idx = cardImageIndex[pm.id] || 0;
                                    const currentImg = imgs[idx] || pm.imageUrl;
                                    return (
                                        <>
                                            {currentImg ? (
                                                <img src={currentImg} alt={pm.name} loading="lazy" />
                                            ) : (
                                                <span className="product-card__image-placeholder">📦</span>
                                            )}
                                            {imgs.length > 1 && (
                                                <>
                                                    <button onClick={e => { e.stopPropagation(); setCardImageIndex(prev => ({ ...prev, [pm.id]: (idx - 1 + imgs.length) % imgs.length })); }}
                                                        style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                                                    <button onClick={e => { e.stopPropagation(); setCardImageIndex(prev => ({ ...prev, [pm.id]: (idx + 1) % imgs.length })); }}
                                                        style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
                                                    <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 3 }}>
                                                        {imgs.map((_, di) => (
                                                            <span key={di} style={{ width: 6, height: 6, borderRadius: '50%', background: di === idx ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'background 0.2s' }} />
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                            {imgs.length > 1 && (
                                                <span style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 9, padding: '2px 5px', borderRadius: 4 }}>{idx + 1}/{imgs.length}</span>
                                            )}
                                        </>
                                    );
                                })()}
                                {/* Category pill */}
                                {pm.category && (
                                    <span className="product-card__category">{pm.category}</span>
                                )}
                                {/* Stock badge */}
                                {pm.lowStock ? (
                                    <span className="product-card__stock-badge product-card__stock-badge--low">⚠ {t('products.lowStockBadge')}</span>
                                ) : pm.totalQty > 0 ? (
                                    <span className="product-card__stock-badge product-card__stock-badge--ok">{pm.totalQty} {t('products.totalQty')}</span>
                                ) : (
                                    <span className="product-card__stock-badge product-card__stock-badge--none">{t('products.noStockBadge')}</span>
                                )}
                            </div>

                            {/* Body */}
                            <div className="product-card__body">
                                <div className="product-card__name">{pm.nameAr || pm.name}</div>
                                {pm.nameAr && pm.name && (
                                    <div className="product-card__name-ar">{pm.name}</div>
                                )}
                                {pm.brand && (
                                    <div className="product-card__brand">{pm.brand}</div>
                                )}

                                {/* Sizes */}
                                {pm.sizes.length > 0 && (
                                    <div className="product-card__sizes">
                                        {pm.sizes.slice(0, 6).map((s, i) => (
                                            <span key={i} className="product-card__size-badge">{s}</span>
                                        ))}
                                        {pm.sizes.length > 6 && (
                                            <span className="product-card__size-more">+{pm.sizes.length - 6}</span>
                                        )}
                                    </div>
                                )}

                                {/* Price + Margin */}
                                <div className="product-card__price-row">
                                    <span className="product-card__price">
                                        {pm.priceDisplay} <small>{t('common.lyd')}</small>
                                    </span>
                                    {pm.marginDisplay !== '—' && (
                                        <span className={`product-card__margin ${pm.marginAvg < 15 ? 'product-card__margin--low' : ''}`}>
                                            {pm.marginDisplay}
                                        </span>
                                    )}
                                </div>

                                {/* Variant count */}
                                <div className="product-card__variant-count">
                                    📋 {t('products.variantsCount', { count: pm.variantCount })}
                                </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="product-card__actions">
                                <button className="product-card__action-btn"
                                    onClick={e => { e.stopPropagation(); openEdit(pm.raw); }}>
                                    ✏️ {t('products.editAction')}
                                </button>
                                <button className="product-card__action-btn"
                                    onClick={e => { e.stopPropagation(); window.location.href = '/inventory'; }}>
                                    🏪 {t('products.inventoryAction')}
                                </button>
                                <button className="product-card__action-btn"
                                    onClick={e => { e.stopPropagation(); if (pm.imageUrl) setPreviewModal(pm.imageUrl); }}>
                                    👁 {t('products.viewAction')}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══════════ TABLE VIEW ═══════════ */}
            {viewMode === 'table' && (
                <div className="card">
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr><th style={{ width: 52 }}></th><th>{t('products.th.product')}</th><th>{t('products.th.brand')}</th><th>{t('products.th.category')}</th><th>{t('products.th.sizes')}</th><th>{t('products.th.price')}</th><th>{t('products.th.margin')}</th><th style={{ width: 60 }}></th></tr>
                            </thead>
                            <tbody>
                                {productModels.map(pm => (
                                    <tr key={pm.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(pm.raw)}>
                                        <td>
                                            <div style={{
                                                width: 44, height: 44, borderRadius: 8, overflow: 'hidden',
                                                background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', border: '1px solid var(--border)',
                                            }}>
                                                {pm.imageUrl ? (
                                                    <img src={pm.imageUrl} alt="" loading="lazy"
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <span style={{ fontSize: 18, opacity: 0.3 }}>📦</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{pm.nameAr || pm.name}</div>
                                            {pm.nameAr && pm.name && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pm.name}</div>}
                                        </td>
                                        <td>{pm.brand || '—'}</td>
                                        <td>{pm.category || '—'}</td>
                                        <td>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                                {pm.sizes.slice(0, 6).map((s, i) => (
                                                    <span key={i} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{s}</span>
                                                ))}
                                                {pm.sizes.length > 6 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{pm.sizes.length - 6}</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ color: 'var(--gold)', fontWeight: 600 }}>
                                                {pm.priceDisplay !== '—' ? `${pm.priceDisplay} ${t('common.lyd')}` : '—'}
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ color: pm.marginAvg > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                                                {pm.marginDisplay}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(pm.raw); }}
                                                style={{ padding: '4px 10px', fontSize: 11 }}>✏️ {t('products.editAction')}</button>
                                        </td>
                                    </tr>
                                ))}
                                {productModels.length === 0 && (
                                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{t('products.noProducts')}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══════════ CREATE PRODUCT MODAL ═══════════ */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }}>
                        <h2>{t('products.newProductTitle')}</h2>

                        {/* Product Info + Image Upload in top row */}
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                            {/* Image Drop Zone — multi-image */}
                            <div style={{ flex: '0 0 200px' }}>
                                <label className="form-label">{t('products.productImages')}</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                                    {imagePreviews.map((prev, idx) => (
                                        <div key={idx} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                            <img src={prev} alt={`Preview ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <button onClick={() => {
                                                setImageFiles(f => f.filter((_, i) => i !== idx));
                                                setImagePreviews(p => p.filter((_, i) => i !== idx));
                                            }} style={{
                                                position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)',
                                                color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18,
                                                fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>✕</button>
                                            {idx === 0 && <span style={{ position: 'absolute', bottom: 2, left: 2, background: 'var(--gold)', color: '#000', fontSize: 8, padding: '1px 4px', borderRadius: 4, fontWeight: 700 }}>PRIMARY</span>}
                                        </div>
                                    ))}
                                    {/* Add more button */}
                                    <div
                                        onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{
                                            width: 72, height: 72, borderRadius: 8,
                                            border: `2px dashed ${dragActive ? 'var(--gold)' : 'var(--border)'}`,
                                            background: dragActive ? 'rgba(212,175,55,0.08)' : 'var(--bg-tertiary)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', transition: 'all 0.2s',
                                        }}>
                                        <span style={{ fontSize: 20, opacity: 0.4 }}>+</span>
                                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Add</span>
                                    </div>
                                </div>
                                <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" hidden multiple
                                    onChange={e => {
                                        if (e.target.files) {
                                            Array.from(e.target.files).forEach(f => handleImageSelect(f));
                                        }
                                    }} />
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('products.imageFormatMax')}</span>
                            </div>

                            {/* Product Fields */}
                            <div style={{ flex: 1, minWidth: 280 }}>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">{t('products.productName')}</label>
                                        <input className="form-input" value={newProduct.name}
                                            onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                                            placeholder="e.g. Nike Air Max 90" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('products.nameArabicLabel')}</label>
                                        <input className="form-input" value={newProduct.nameAr}
                                            onChange={e => setNewProduct({ ...newProduct, nameAr: e.target.value })}
                                            placeholder="الاسم بالعربي" dir="rtl" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Brand</label>
                                        <input className="form-input" value={newProduct.brand}
                                            onChange={e => setNewProduct({ ...newProduct, brand: e.target.value })}
                                            placeholder="e.g. Nike" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Category</label>
                                        <select className="form-input" value={newProduct.categoryId}
                                            onChange={e => handleCategoryChange(e.target.value)}>
                                            <option value="">{t('products.selectCategoryOption')}</option>
                                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── BULK VARIANT GENERATOR ─── */}
                        <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-tertiary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <span style={{ fontWeight: 700, fontSize: 15 }}>🏭 Bulk Variant Generator</span>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {(['pick', 'matrix', 'range', 'paste'] as GeneratorMode[]).map(m => (
                                        <button key={m} onClick={() => setGenMode(m)}
                                            className={`btn btn-sm ${genMode === m ? 'btn-primary' : 'btn-secondary'}`}>
                                            {m === 'pick' ? '👆 Quick Pick' : m === 'matrix' ? '🔢 Matrix' : m === 'range' ? '📏 Range' : '📋 Paste'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {genMode === 'pick' && (
                                <div>
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                                        Pick a category, then click sizes to select. Each selected size creates a variant.
                                    </p>
                                    {/* Preset category tabs */}
                                    <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                                        {(Object.keys(SIZE_PRESETS) as SizePresetKey[]).map(key => (
                                            <button key={key}
                                                onClick={() => { setPickPreset(key); setPickedSizes(new Set()); }}
                                                className={`btn btn-sm ${pickPreset === key ? 'btn-primary' : 'btn-secondary'}`}
                                                style={{ fontSize: 12 }}>
                                                {SIZE_PRESETS[key].label}
                                            </button>
                                        ))}
                                    </div>
                                    {/* Size toggle buttons */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                        {SIZE_PRESETS[pickPreset].sizes.map(size => {
                                            const active = pickedSizes.has(size);
                                            return (
                                                <button key={size}
                                                    onClick={() => togglePickSize(size)}
                                                    style={{
                                                        padding: '6px 14px',
                                                        borderRadius: 8,
                                                        border: active ? '2px solid var(--gold)' : '2px solid var(--border)',
                                                        background: active ? 'rgba(212, 175, 55, 0.15)' : 'var(--bg-secondary)',
                                                        color: active ? 'var(--gold)' : 'var(--text-secondary)',
                                                        fontWeight: active ? 700 : 500,
                                                        fontSize: 13,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s',
                                                        minWidth: 42,
                                                        textAlign: 'center',
                                                    }}>
                                                    {size}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {/* Select all / Clear + Colors */}
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
                                        <button className="btn btn-secondary btn-sm" onClick={pickAll} style={{ fontSize: 11 }}>✅ All</button>
                                        <button className="btn btn-secondary btn-sm" onClick={pickNone} style={{ fontSize: 11 }}>✕ Clear</button>
                                        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                                            <label className="form-label">Colors (optional)</label>
                                            <input className="form-input" value={pickColors}
                                                onChange={e => setPickColors(e.target.value)}
                                                placeholder="Black, White, Grey" />
                                        </div>
                                    </div>
                                    {pickedSizes.size > 0 && (
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                                            Selected: <strong style={{ color: 'var(--gold)' }}>{Array.from(pickedSizes).join(', ')}</strong>
                                            {pickColors && ` × ${parseSeparated(pickColors).length} color(s)`}
                                            {' → '}
                                            <strong>{pickedSizes.size * Math.max(1, parseSeparated(pickColors).length)} variants</strong>
                                        </div>
                                    )}
                                    <button className="btn btn-primary btn-sm" onClick={generateFromPick}
                                        disabled={pickedSizes.size === 0}>
                                        ⚡ Generate {pickedSizes.size * Math.max(1, parseSeparated(pickColors).length)} Variants
                                    </button>
                                </div>
                            )}

                            {genMode === 'matrix' && (
                                <div>
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                                        Enter sizes and colors separated by commas or spaces. Each Size × Color combination creates a variant.
                                    </p>
                                    <div className="grid-2" style={{ marginBottom: 8 }}>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label">Sizes *</label>
                                            <input className="form-input" value={matrixSizes}
                                                onChange={e => setMatrixSizes(e.target.value)}
                                                placeholder="S, M, L, XL  or  40, 41, 42, 43" />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label">Colors (optional)</label>
                                            <input className="form-input" value={matrixColors}
                                                onChange={e => setMatrixColors(e.target.value)}
                                                placeholder="Black, White, Grey" />
                                        </div>
                                    </div>
                                    <button className="btn btn-primary btn-sm" onClick={generateMatrix}>⚡ Generate Variants</button>
                                </div>
                            )}

                            {genMode === 'range' && (
                                <div>
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                                        Generate sizes from a numeric range.
                                    </p>
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                                        <div className="form-group" style={{ marginBottom: 0, flex: '0 0 100px' }}>
                                            <label className="form-label">From</label>
                                            <input type="number" className="form-input" value={rangeFrom}
                                                onChange={e => setRangeFrom(e.target.value)} placeholder="36" />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0, flex: '0 0 100px' }}>
                                            <label className="form-label">To</label>
                                            <input type="number" className="form-input" value={rangeTo}
                                                onChange={e => setRangeTo(e.target.value)} placeholder="46" />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0, flex: '0 0 80px' }}>
                                            <label className="form-label">Step</label>
                                            <input type="number" className="form-input" value={rangeStep}
                                                onChange={e => setRangeStep(e.target.value)} placeholder="1" />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                                            <label className="form-label">Colors (optional)</label>
                                            <input className="form-input" value={rangeColors}
                                                onChange={e => setRangeColors(e.target.value)} placeholder="Black, White" />
                                        </div>
                                    </div>
                                    <button className="btn btn-primary btn-sm" onClick={generateRange}>⚡ Generate Variants</button>
                                </div>
                            )}

                            {genMode === 'paste' && (
                                <div>
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                                        Paste one variant per line: <code>size, color</code> or <code>size</code> only. Tab or comma separated.
                                    </p>
                                    <div className="form-group" style={{ marginBottom: 8 }}>
                                        <textarea className="form-input" rows={5} value={pasteText}
                                            onChange={e => setPasteText(e.target.value)}
                                            placeholder={"42, Black\n43, Black\n42, White\n43, White\nXL\n2XL"} style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
                                    </div>
                                    <button className="btn btn-primary btn-sm" onClick={generatePaste}>⚡ Generate Variants</button>
                                </div>
                            )}

                            {/* USD Pricing — user enters USD only, system converts */}
                            <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div className="form-group" style={{ marginBottom: 0, flex: '0 0 140px' }}>
                                    <label className="form-label">💵 Cost USD</label>
                                    <input type="number" className="form-input" value={bulkCostUsd}
                                        onChange={e => setBulkCostUsd(e.target.value)}
                                        placeholder="$0.00" step="0.01" style={{ fontSize: 16, fontWeight: 600 }} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0, flex: '0 0 140px' }}>
                                    <label className="form-label">💰 Sell USD</label>
                                    <input type="number" className="form-input" value={bulkSellUsd}
                                        onChange={e => setBulkSellUsd(e.target.value)}
                                        placeholder="$0.00" step="0.01" style={{ fontSize: 16, fontWeight: 600 }} />
                                </div>
                                <button className="btn btn-primary btn-sm" onClick={applyCostUsdToAll}
                                    disabled={!bulkCostUsd && !bulkSellUsd}
                                    style={{ height: 40, padding: '0 16px' }}>
                                    ⚡ Apply to All Variants
                                </button>
                            </div>
                            {/* Live conversion preview */}
                            {(bulkCostUsd || bulkSellUsd) && (
                                <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', border: '1px solid var(--border)' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>💱 Rate: {purchaseUsdRate || usdRate} LYD/USD</span>
                                    {bulkCostUsd && (
                                        <span>Cost: <strong>${bulkCostUsd}</strong> → <strong style={{ color: 'var(--text-secondary)' }}>{costLydFromUsd(bulkCostUsd)} LYD</strong></span>
                                    )}
                                    {bulkSellUsd && (
                                        <span>Sale: <strong>${bulkSellUsd}</strong> → <strong style={{ color: 'var(--gold)' }}>{saleLydFromUsd(bulkSellUsd)} LYD</strong> <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(↑5)</span></span>
                                    )}
                                    {bulkCostUsd && bulkSellUsd && Number(bulkSellUsd) > Number(bulkCostUsd) && (
                                        <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                                            Profit: +${(Number(bulkSellUsd) - Number(bulkCostUsd)).toFixed(2)} USD
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Purchase Data: Rate + Date */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                                <div className="form-group" style={{ marginBottom: 0, flex: '0 0 140px' }}>
                                    <label className="form-label">📅 Purchase Date</label>
                                    <input type="date" className="form-input" value={purchaseDate}
                                        onChange={e => setPurchaseDate(e.target.value)} />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0, flex: '0 0 140px' }}>
                                    <label className="form-label">💱 USD Rate at Purchase</label>
                                    <input type="number" className="form-input" value={purchaseUsdRate}
                                        onChange={e => setPurchaseUsdRate(e.target.value)}
                                        placeholder={String(usdRate)} step="0.01" />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0, flex: '0 0 200px' }}>
                                    <label className="form-label">📍 Initial Stock Branch</label>
                                    <select className="form-input" value={initialBranchId}
                                        onChange={e => setInitialBranchId(e.target.value)}>
                                        <option value="">{t('products.noInitialStock')}</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 4 }}>
                                    {initialBranchId ? '✅ Inventory rows (qty=0) will be created' : 'Product won\'t appear in inventory until stocked'}
                                </div>
                            </div>
                        </div>

                        {/* ─── GENERATED VARIANTS TABLE ─── */}
                        {variants.length > 0 && (
                            <div style={{ marginTop: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <span style={{ fontWeight: 700 }}>📋 Generated Variants ({variants.length})</span>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-secondary btn-sm" onClick={autoGenerateSkus} disabled={!newProduct.name}>
                                            {t('products.autoGenerateSkus')}
                                        </button>
                                        <button className="btn btn-danger btn-sm" onClick={() => setVariants([])}>{t('products.clearAll')}</button>
                                    </div>
                                </div>
                                <div className="table-container" style={{ maxHeight: 320, overflow: 'auto' }}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th style={{ width: 30 }}>#</th><th>SKU</th><th>Size</th><th>Color</th>
                                                <th>{t('products.costUsdTh')}</th><th>{t('products.sellUsdTh')}</th><th>{t('products.costLydTh')}</th><th>{t('products.saleLydTh')}</th><th style={{ width: 50 }}>{t('products.profitTh')}</th><th style={{ width: 40 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {variants.map((v, i) => {
                                                // Auto-compute LYD from USD
                                                const computedCostLyd = v.costUsd ? costLydFromUsd(v.costUsd) : v.costPrice;
                                                const computedSaleLyd = v.sellUsd ? saleLydFromUsd(v.sellUsd) : v.salePrice;
                                                const cost = Number(computedCostLyd) || 0;
                                                const sale = Number(computedSaleLyd) || 0;
                                                const profit = sale > 0 && cost > 0 ? (sale - cost).toFixed(0) : '—';
                                                return (
                                                    <tr key={i}>
                                                        <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                                                        <td>
                                                            <input className="form-input" value={v.sku}
                                                                onChange={e => updateVariant(i, 'sku', e.target.value)}
                                                                placeholder="SKU" style={{ padding: '4px 8px', fontSize: 12, fontFamily: 'monospace' }} />
                                                        </td>
                                                        <td><input className="form-input" value={v.size} onChange={e => updateVariant(i, 'size', e.target.value)} style={{ padding: '4px 8px', fontSize: 12, width: 60 }} /></td>
                                                        <td><input className="form-input" value={v.color} onChange={e => updateVariant(i, 'color', e.target.value)} style={{ padding: '4px 8px', fontSize: 12, width: 80 }} /></td>
                                                        <td>
                                                            <input type="number" className="form-input" value={v.costUsd}
                                                                onChange={e => updateVariant(i, 'costUsd', e.target.value)}
                                                                placeholder="$" step="0.01" style={{ padding: '4px 8px', fontSize: 12, width: 75, textAlign: 'end', fontWeight: 600 }} />
                                                        </td>
                                                        <td>
                                                            <input type="number" className="form-input" value={v.sellUsd}
                                                                onChange={e => updateVariant(i, 'sellUsd', e.target.value)}
                                                                placeholder="$" step="0.01" style={{ padding: '4px 8px', fontSize: 12, width: 75, textAlign: 'end', fontWeight: 600 }} />
                                                        </td>
                                                        {/* LYD values — auto-computed, read-only display */}
                                                        <td style={{ fontSize: 12, textAlign: 'end', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{computedCostLyd || '—'}</td>
                                                        <td style={{ fontSize: 12, textAlign: 'end', color: 'var(--gold)', fontWeight: 600, fontFamily: 'monospace' }}>{computedSaleLyd || '—'}</td>
                                                        <td style={{ fontSize: 12, fontWeight: 600, color: profit !== '—' && Number(profit) > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                                                            {profit !== '—' ? `+${profit}` : profit}
                                                        </td>
                                                        <td><button className="btn btn-danger btn-sm" onClick={() => removeVariant(i)} style={{ padding: '2px 6px', fontSize: 11 }}>✕</button></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Validation Errors */}
                        {errors.length > 0 && (
                            <div style={{ marginTop: 16, padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8 }}>
                                <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>⚠️ Please fix the following:</div>
                                {errors.map((e, i) => (
                                    <div key={i} style={{ fontSize: 12, color: 'var(--red)', paddingInlineStart: 8 }}>• {e}</div>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}
                                onClick={() => setShowCreate(false)}>Cancel</button>
                            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                                onClick={handleCreate} disabled={creating || variants.length === 0}>
                                {creating ? 'Creating...' : `✅ Create Product (${variants.length} variants)`}
                            </button>
                        </div>
                    </div>
                </div>
            )
            }

            {/* ═══════════ EDIT PRODUCT MODAL ═══════════ */}
            {editProduct && (
                <div className="modal-overlay" onClick={() => setEditProduct(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <h2>✏️ Edit Product</h2>
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                            {/* Images — multi */}
                            <div style={{ flex: '0 0 200px' }}>
                                <label className="form-label">Images</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                    {editImagePreviews.map((prev, idx) => (
                                        <div key={idx} style={{ position: 'relative', width: 56, height: 56, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                            <img src={prev} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <button onClick={async () => {
                                                // If this is a server image, delete via API
                                                const serverImages = editProduct?.images || [];
                                                if (idx < serverImages.length && token) {
                                                    try {
                                                        await productsApi.removeImage(token, serverImages[idx].id);
                                                    } catch (e) { /* ignore */ }
                                                }
                                                setEditImagePreviews(p => p.filter((_, i) => i !== idx));
                                                if (idx >= (serverImages.length || 0)) {
                                                    const newIdx = idx - (serverImages.length || 0);
                                                    setEditImageFiles(f => f.filter((_, i) => i !== newIdx));
                                                }
                                            }} style={{
                                                position: 'absolute', top: 1, right: 1, background: 'rgba(0,0,0,0.6)',
                                                color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16,
                                                fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>✕</button>
                                            {idx === 0 && <span style={{ position: 'absolute', bottom: 1, left: 1, background: 'var(--gold)', color: '#000', fontSize: 7, padding: '1px 3px', borderRadius: 3, fontWeight: 700 }}>1ST</span>}
                                        </div>
                                    ))}
                                    <div onClick={() => editFileInputRef.current?.click()}
                                        style={{
                                            width: 56, height: 56, borderRadius: 6,
                                            border: '2px dashed var(--border)', background: 'var(--bg-tertiary)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer',
                                        }}>
                                        <span style={{ fontSize: 16, opacity: 0.4 }}>+</span>
                                    </div>
                                </div>
                                <input ref={editFileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" hidden multiple
                                    onChange={e => {
                                        if (e.target.files) {
                                            Array.from(e.target.files).forEach(f => {
                                                setEditImageFiles(prev => [...prev, f]);
                                                const reader = new FileReader();
                                                reader.onload = (ev) => setEditImagePreviews(prev => [...prev, ev.target?.result as string]);
                                                reader.readAsDataURL(f);
                                            });
                                        }
                                    }} />
                            </div>
                            {/* Fields */}
                            <div style={{ flex: 1, minWidth: 250 }}>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">{t('products.productName')}</label>
                                        <input className="form-input" value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('products.nameArabicLabel')}</label>
                                        <input className="form-input" value={editForm.nameAr}
                                            onChange={e => setEditForm({ ...editForm, nameAr: e.target.value })} dir="rtl" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Brand</label>
                                        <input className="form-input" value={editForm.brand}
                                            onChange={e => setEditForm({ ...editForm, brand: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Category</label>
                                        <select className="form-input" value={editForm.categoryId}
                                            onChange={e => setEditForm({ ...editForm, categoryId: e.target.value })}>
                                            <option value="">{t('products.selectCategoryOption')}</option>
                                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {/* Editable Variants */}
                                <div style={{ marginTop: 12 }}>
                                    <label className="form-label" style={{ marginBottom: 6 }}>Variants ({(editProduct.variants || []).length})</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                                        {(editProduct.variants || []).map((v: any, idx: number) => (
                                            <div key={v.id || `new-${idx}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                                                <span style={{ color: 'var(--text-muted)', width: 20 }}>{idx + 1}.</span>
                                                <input className="form-input" placeholder="Size" value={v.size || ''}
                                                    style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}
                                                    onChange={e => {
                                                        const updated = [...(editProduct.variants || [])];
                                                        updated[idx] = { ...updated[idx], size: e.target.value };
                                                        setEditProduct({ ...editProduct, variants: updated });
                                                    }} />
                                                <span style={{ color: 'var(--text-muted)', fontSize: 11, minWidth: 60 }}>{v.sku ? `SKU: ${v.sku}` : (v._isNew ? '🆕 New' : '')}</span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: 11, minWidth: 50 }}>{v.color || ''}</span>
                                                <button onClick={async (e) => {
                                                    e.preventDefault();
                                                    if (v._isNew) {
                                                        // Just remove from local state
                                                        setEditProduct({ ...editProduct, variants: (editProduct.variants || []).filter((_: any, i: number) => i !== idx) });
                                                    } else {
                                                        if (!window.confirm(`Delete size "${v.size || v.sku}"?`)) return;
                                                        if (token) {
                                                            try {
                                                                await productsApi.deleteVariant(token, v.id);
                                                                setEditProduct({ ...editProduct, variants: (editProduct.variants || []).filter((_: any, i: number) => i !== idx) });
                                                                toast.success('Variant deleted');
                                                            } catch (err: any) { toast.error(err.message); }
                                                        }
                                                    }
                                                }} style={{
                                                    background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer',
                                                    fontSize: 14, padding: '0 4px', opacity: 0.6, transition: 'opacity 0.2s',
                                                }} title="Delete variant">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 6, fontSize: 11, padding: '4px 12px' }}
                                        onClick={() => {
                                            const existing = editProduct.variants || [];
                                            const baseSku = existing[0]?.sku?.split('-').slice(0, -1).join('-') || editProduct.name?.toUpperCase().replace(/\s+/g, '-') || 'NEW';
                                            setEditProduct({
                                                ...editProduct,
                                                variants: [...existing, { _isNew: true, size: '', color: '', sku: `${baseSku}-NEW${existing.length + 1}`, costPrice: existing[0]?.costPrice || 0, salePrice: existing[0]?.salePrice || 0 }],
                                            });
                                        }}>+ Add Size</button>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                            <button className="btn" style={{
                                flex: 0, padding: '8px 16px', justifyContent: 'center',
                                background: 'rgba(220,38,38,0.15)', color: '#ef4444', border: '1px solid rgba(220,38,38,0.3)',
                                borderRadius: 8, cursor: 'pointer', fontSize: 13,
                            }}
                                onClick={async () => {
                                    if (!token || !editProduct) return;
                                    const confirmed = window.confirm(`Delete "${editProduct.name}"? This will remove ALL variants, images, and inventory. This cannot be undone.`);
                                    if (!confirmed) return;
                                    try {
                                        await productsApi.deleteProduct(token, editProduct.id);
                                        toast.success('Product deleted');
                                        setEditProduct(null);
                                        loadData();
                                    } catch (err: any) { toast.error(err.message); }
                                }}>🗑️ Delete</button>
                            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}
                                onClick={() => setEditProduct(null)}>Cancel</button>
                            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                                onClick={handleEditSave} disabled={saving}>
                                {saving ? 'Saving...' : '✅ Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Preview Modal */}
            {
                previewModal && (
                    <div className="modal-overlay" onClick={() => setPreviewModal(null)}>
                        <div onClick={e => e.stopPropagation()} style={{
                            maxWidth: 500, maxHeight: '80vh', borderRadius: 12, overflow: 'hidden',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                        }}>
                            <img src={previewModal} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                    </div>
                )
            }
        </div >
    );
}

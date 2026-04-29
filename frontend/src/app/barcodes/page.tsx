'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuthStore } from '../../lib/store';
import { productsApi } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../lib/i18n';

// ─── Label Presets (mm) ───
const LABEL_PRESETS = [
    { name: '50×25mm', w: 50, h: 25 },
    { name: '40×30mm', w: 40, h: 30 },
    { name: '60×40mm', w: 60, h: 40 },
    { name: '70×35mm', w: 70, h: 35 },
    { name: 'Custom', w: 0, h: 0 },
];

// ─── Template Presets (layout arrangements) ───
const TEMPLATE_PRESETS = [
    {
        name: '🔝 Classic Top',
        desc: 'Name top, barcode center, SKU + price bottom',
        config: { namePosition: 'top' as const, showName: true, showBarcode: true, showSku: true, showPrice: true, nameFontSize: 8, skuFontSize: 7, priceFontSize: 10, barcodeHeight: 10, barcodeXScale: 1.5, paddingX: 2, paddingY: 1, marginTop: 1, marginBottom: 1 },
    },
    {
        name: '💰 Price Focus',
        desc: 'Large price top, barcode below, no name',
        config: { namePosition: 'top' as const, showName: false, showBarcode: true, showSku: true, showPrice: true, nameFontSize: 8, skuFontSize: 6, priceFontSize: 14, barcodeHeight: 8, barcodeXScale: 1.2, paddingX: 2, paddingY: 1, marginTop: 1, marginBottom: 1 },
    },
    {
        name: '📦 Compact',
        desc: 'Small label, minimal elements',
        config: { namePosition: 'top' as const, showName: true, showBarcode: true, showSku: false, showPrice: true, nameFontSize: 6, skuFontSize: 6, priceFontSize: 8, barcodeHeight: 7, barcodeXScale: 1.0, paddingX: 1, paddingY: 0.5, marginTop: 0.5, marginBottom: 0.5 },
    },
    {
        name: '🏷️ Wide Barcode',
        desc: 'Tall barcode, name bottom',
        config: { namePosition: 'bottom' as const, showName: true, showBarcode: true, showSku: true, showPrice: true, nameFontSize: 7, skuFontSize: 7, priceFontSize: 9, barcodeHeight: 14, barcodeXScale: 2.0, paddingX: 1, paddingY: 1, marginTop: 1, marginBottom: 1 },
    },
    {
        name: '🔠 SKU Only',
        desc: 'Barcode + SKU text only, no price or name',
        config: { namePosition: 'top' as const, showName: false, showBarcode: true, showSku: true, showPrice: false, nameFontSize: 8, skuFontSize: 8, priceFontSize: 10, barcodeHeight: 12, barcodeXScale: 1.8, paddingX: 2, paddingY: 2, marginTop: 1, marginBottom: 1 },
    },
];

// mm to px at 96dpi → 1mm ≈ 3.78px
const mmToPx = (mm: number) => Math.round(mm * 3.78);

interface LabelConfig {
    width: number;  // mm
    height: number; // mm
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    paddingX: number;
    paddingY: number;
    showName: boolean;
    showSku: boolean;
    showPrice: boolean;
    showBarcode: boolean;
    nameFontSize: number;
    skuFontSize: number;
    priceFontSize: number;
    barcodeHeight: number; // mm
    barcodeXScale: number; // barcode bar width multiplier (0.5 – 3.0)
    namePosition: 'top' | 'bottom';
    columnsPerRow: number;
}

interface SelectedProduct {
    productName: string;
    sku: string;
    size: string;
    color: string;
    salePrice: number;
    variantId: string;
    copies: number;
}

const DEFAULT_CONFIG: LabelConfig = {
    width: 50,
    height: 25,
    marginTop: 1,
    marginBottom: 1,
    marginLeft: 1,
    marginRight: 1,
    paddingX: 2,
    paddingY: 1,
    showName: true,
    showSku: true,
    showPrice: true,
    showBarcode: true,
    nameFontSize: 8,
    skuFontSize: 7,
    priceFontSize: 10,
    barcodeHeight: 10,
    barcodeXScale: 1.5,
    namePosition: 'top',
    columnsPerRow: 4,
};

// Round UP to nearest 5 LYD
const roundUp5 = (n: number) => Math.ceil(n / 5) * 5;

// Sanitize SKU for barcode encoding (CODE128 only supports ASCII)
const sanitizeForBarcode = (sku: string): string => {
    // Strip all non-ASCII characters
    const ascii = sku.replace(/[^\x20-\x7E]/g, '').trim();
    if (ascii.length >= 3) return ascii;
    // Fallback: generate a numeric code from the original string
    let h = 0;
    for (let i = 0; i < sku.length; i++) h = ((h << 5) - h + sku.charCodeAt(i)) | 0;
    return 'OM' + Math.abs(h % 100000000).toString().padStart(8, '0');
};

// Check if a SKU is barcode-safe (ASCII only)
const isBarcodeCompatible = (sku: string): boolean => {
    return /^[\x20-\x7E]{3,}$/.test(sku);
};

export default function BarcodesPage() {
    const { token } = useAuthStore();
    const toast = useToast();
    const { t } = useTranslation();
    const [products, setProducts] = useState<any[]>([]);
    const [selected, setSelected] = useState<SelectedProduct[]>([]);
    const [config, setConfig] = useState<LabelConfig>({ ...DEFAULT_CONFIG });
    const [labelPresetIdx, setLabelPresetIdx] = useState(0);
    const [templatePresetIdx, setTemplatePresetIdx] = useState(0);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);
    const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

    // Load products
    useEffect(() => {
        if (!token) return;
        productsApi.findAll(token).then(p => {
            setProducts(p);
            setLoading(false);
        }).catch(console.error);
    }, [token]);

    // Render barcode on canvas
    const renderBarcode = useCallback((canvas: HTMLCanvasElement | null, sku: string, heightMm: number, xScale: number) => {
        if (!canvas) return;
        try {
            const JsBarcode = (window as any).JsBarcode;
            if (!JsBarcode) return;
            const heightPx = mmToPx(heightMm);
            const barcodeValue = sanitizeForBarcode(sku);
            JsBarcode(canvas, barcodeValue, {
                format: 'CODE128',
                width: xScale,
                height: Math.max(heightPx, 20),
                displayValue: false,
                margin: 0,
                background: 'transparent',
            });
        } catch (e) {
            console.warn('Barcode error for', sku, e);
            // Draw error indicator on canvas
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width = 120;
                canvas.height = 20;
                ctx.fillStyle = '#ff4444';
                ctx.font = '10px monospace';
                ctx.fillText('INVALID SKU', 10, 14);
            }
        }
    }, []);

    // Load JsBarcode CDN
    useEffect(() => {
        if (typeof window !== 'undefined' && !(window as any).JsBarcode) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
            script.onload = () => {
                canvasRefs.current.forEach((canvas, sku) => {
                    renderBarcode(canvas, sku, config.barcodeHeight, config.barcodeXScale);
                });
            };
            document.head.appendChild(script);
        }
    }, []);

    // Re-render barcodes when config changes
    useEffect(() => {
        if (!(window as any).JsBarcode) return;
        canvasRefs.current.forEach((canvas, sku) => {
            renderBarcode(canvas, sku, config.barcodeHeight, config.barcodeXScale);
        });
    }, [config.barcodeHeight, config.barcodeXScale, selected, renderBarcode]);

    const registerCanvas = (el: HTMLCanvasElement | null, sku: string) => {
        if (el) {
            canvasRefs.current.set(sku, el);
            renderBarcode(el, sku, config.barcodeHeight, config.barcodeXScale);
        }
    };

    // ─── Product selection ───
    const toggleProduct = (product: any, variant: any) => {
        const exists = selected.find(s => s.variantId === variant.id);
        if (exists) {
            setSelected(selected.filter(s => s.variantId !== variant.id));
        } else {
            setSelected([...selected, {
                productName: product.name,
                sku: variant.sku,
                size: variant.size || '',
                color: variant.color || '',
                salePrice: roundUp5(Number(variant.salePrice)),
                variantId: variant.id,
                copies: 1,
            }]);
        }
    };

    // ─── Select/deselect ALL variants for a product ───
    const toggleAllVariants = (product: any) => {
        const variants = product.variants || [];
        const allSelected = variants.every((v: any) => selected.some(s => s.variantId === v.id));
        if (allSelected) {
            // Deselect all variants of this product
            const variantIds = new Set(variants.map((v: any) => v.id));
            setSelected(selected.filter(s => !variantIds.has(s.variantId)));
        } else {
            // Select all variants not yet selected
            const existing = new Set(selected.map(s => s.variantId));
            const newSelections = variants
                .filter((v: any) => !existing.has(v.id))
                .map((v: any) => ({
                    productName: product.name,
                    sku: v.sku,
                    size: v.size || '',
                    color: v.color || '',
                    salePrice: roundUp5(Number(v.salePrice)),
                    variantId: v.id,
                    copies: 1,
                }));
            setSelected([...selected, ...newSelections]);
        }
    };

    const updateCopies = (variantId: string, copies: number) => {
        setSelected(selected.map(s => s.variantId === variantId ? { ...s, copies: Math.max(1, copies) } : s));
    };

    // ─── Update copies for ALL variants of a product ───
    const updateAllCopies = (product: any, copies: number) => {
        const variantIds = new Set((product.variants || []).map((v: any) => v.id));
        setSelected(selected.map(s => variantIds.has(s.variantId) ? { ...s, copies: Math.max(1, copies) } : s));
    };

    // ─── Expanded product groups ───
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const toggleGroup = (productId: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(productId)) next.delete(productId);
            else next.add(productId);
            return next;
        });
    };

    // ─── Label Preset handling ───
    const applyLabelPreset = (idx: number) => {
        setLabelPresetIdx(idx);
        const p = LABEL_PRESETS[idx];
        if (p.w > 0) {
            setConfig(c => ({ ...c, width: p.w, height: p.h }));
        }
    };

    // ─── Template Preset handling ───
    const applyTemplatePreset = (idx: number) => {
        setTemplatePresetIdx(idx);
        const tmpl = TEMPLATE_PRESETS[idx];
        setConfig(c => ({ ...c, ...tmpl.config }));
    };

    // ─── Filter products (grouped by product) ───
    const q = search.toLowerCase();
    const filteredGrouped: { product: any; variants: any[] }[] = [];
    for (const p of products) {
        const matchingVariants = (p.variants || []).filter((v: any) =>
            !q || p.name.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q) ||
            (v.size || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q)
        );
        if (matchingVariants.length > 0) {
            filteredGrouped.push({ product: p, variants: matchingVariants });
        }
    }

    // ─── Build labels array (with copies) ───
    const labels: SelectedProduct[] = [];
    for (const s of selected) {
        for (let i = 0; i < s.copies; i++) {
            labels.push(s);
        }
    }

    // ─── PDF Export ───
    const exportPDF = async () => {
        setExporting(true);
        try {
            const jsPDF = (await import('jspdf')).default;
            const labelW = config.width;
            const labelH = config.height;
            const cols = config.columnsPerRow;
            const gap = 2;

            const pageW = cols * labelW + (cols - 1) * gap + 4;
            const pageH = 297;
            const rowsPerPage = Math.floor((pageH - 4) / (labelH + gap));

            const pdf = new jsPDF({
                orientation: pageW > pageH ? 'landscape' : 'portrait',
                unit: 'mm',
                format: [pageW, pageH],
            });

            let labelIdx = 0;
            let pageNum = 0;

            while (labelIdx < labels.length) {
                if (pageNum > 0) pdf.addPage();
                pageNum++;

                for (let row = 0; row < rowsPerPage && labelIdx < labels.length; row++) {
                    for (let col = 0; col < cols && labelIdx < labels.length; col++) {
                        const label = labels[labelIdx];
                        const x = 2 + col * (labelW + gap);
                        const y = 2 + row * (labelH + gap);

                        pdf.setDrawColor(200);
                        pdf.setLineWidth(0.1);
                        pdf.rect(x, y, labelW, labelH);

                        const innerX = x + config.paddingX;
                        const innerW = labelW - config.paddingX * 2;
                        let curY = y + config.paddingY + config.marginTop;

                        if (config.showName && config.namePosition === 'top') {
                            pdf.setFontSize(config.nameFontSize);
                            pdf.setFont('helvetica', 'bold');
                            const name = label.productName + (label.size ? ` ${label.size}` : '') + (label.color ? ` ${label.color}` : '');
                            pdf.text(name, innerX + innerW / 2, curY + config.nameFontSize * 0.35, { align: 'center', maxWidth: innerW });
                            curY += config.nameFontSize * 0.4 + 1;
                        }

                        if (config.showBarcode) {
                            const canvas = document.createElement('canvas');
                            try {
                                const JsBarcode = (window as any).JsBarcode;
                                if (JsBarcode) {
                                    const barcodeValue = sanitizeForBarcode(label.sku);
                                    JsBarcode(canvas, barcodeValue, {
                                        format: 'CODE128',
                                        width: config.barcodeXScale,
                                        height: mmToPx(config.barcodeHeight),
                                        displayValue: false,
                                        margin: 0,
                                    });
                                    const barcodeImg = canvas.toDataURL('image/png');
                                    const barcodeW = Math.min(innerW - 2, innerW);
                                    const barcodeX = innerX + (innerW - barcodeW) / 2;
                                    pdf.addImage(barcodeImg, 'PNG', barcodeX, curY, barcodeW, config.barcodeHeight);
                                    curY += config.barcodeHeight + 0.5;
                                }
                            } catch (e) { /* skip barcode */ }
                        }

                        if (config.showSku) {
                            pdf.setFontSize(config.skuFontSize);
                            pdf.setFont('helvetica', 'normal');
                            pdf.text(label.sku, innerX + innerW / 2, curY + config.skuFontSize * 0.35, { align: 'center' });
                            curY += config.skuFontSize * 0.4 + 0.5;
                        }

                        if (config.showPrice) {
                            pdf.setFontSize(config.priceFontSize);
                            pdf.setFont('helvetica', 'bold');
                            const priceStr = `${roundUp5(label.salePrice)} LYD`;
                            pdf.text(priceStr, innerX + innerW / 2, curY + config.priceFontSize * 0.35, { align: 'center' });
                            curY += config.priceFontSize * 0.4 + 0.5;
                        }

                        if (config.showName && config.namePosition === 'bottom') {
                            pdf.setFontSize(config.nameFontSize);
                            pdf.setFont('helvetica', 'bold');
                            const name = label.productName + (label.size ? ` ${label.size}` : '');
                            pdf.text(name, innerX + innerW / 2, y + labelH - config.paddingY - config.marginBottom, { align: 'center', maxWidth: innerW });
                        }

                        labelIdx++;
                    }
                }
            }

            pdf.save(`barcode-labels-${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err: any) {
            toast.error('PDF export error: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    // ─── Direct Print ───
    const printDirect = () => {
        if (labels.length === 0) return;
        const labelW = config.width;
        const labelH = config.height;
        const cols = config.columnsPerRow;
        const gap = 2;

        // Build label HTML
        let labelsHtml = '';
        for (const label of labels) {
            const barcodeValue = sanitizeForBarcode(label.sku);
            let inner = '';

            if (config.showName && config.namePosition === 'top') {
                const name = label.productName + (label.size ? ` ${label.size}` : '') + (label.color ? ` ${label.color}` : '');
                inner += `<div style="font-size:${config.nameFontSize}pt;font-weight:700;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;margin-bottom:1px;">${name}</div>`;
            }
            if (config.showBarcode) {
                inner += `<svg class="barcode" data-value="${barcodeValue}" data-height="${mmToPx(config.barcodeHeight)}" data-width="${config.barcodeXScale}"></svg>`;
            }
            if (config.showSku) {
                inner += `<div style="font-size:${config.skuFontSize}pt;font-family:monospace;letter-spacing:0.5px;margin-top:1px;text-align:center;">${label.sku}</div>`;
            }
            if (config.showPrice) {
                inner += `<div style="font-size:${config.priceFontSize}pt;font-weight:800;text-align:center;margin-top:1px;">${fmtPrice(label.salePrice)} LYD</div>`;
            }
            if (config.showName && config.namePosition === 'bottom') {
                const name = label.productName + (label.size ? ` ${label.size}` : '');
                inner += `<div style="font-size:${config.nameFontSize}pt;font-weight:700;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;margin-top:auto;">${name}</div>`;
            }

            labelsHtml += `<div style="width:${labelW}mm;height:${labelH}mm;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;padding:${config.paddingY}mm ${config.paddingX}mm;box-sizing:border-box;page-break-inside:avoid;">${inner}</div>`;
        }

        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) { toast.error('Popup blocked — allow popups for this site'); return; }

        printWindow.document.write(`<!DOCTYPE html>
<html><head><title>OMCS Barcode Labels</title>
<style>
  @page { margin: 2mm; size: auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  .labels-grid {
    display: flex; flex-wrap: wrap; gap: ${gap}mm;
    justify-content: flex-start;
  }
</style>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
</head><body>
<div class="labels-grid">${labelsHtml}</div>
<script>
  document.querySelectorAll('.barcode').forEach(svg => {
    try {
      JsBarcode(svg, svg.dataset.value, {
        format: 'CODE128', width: parseFloat(svg.dataset.width),
        height: parseInt(svg.dataset.height), displayValue: false,
        margin: 0, background: 'transparent',
      });
    } catch(e) {}
  });
  setTimeout(() => { window.print(); }, 500);
<\/script>
</body></html>`);
        printWindow.document.close();
    };


    const fmtPrice = (n: number) => roundUp5(n).toLocaleString('en-US');

    if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{t('common.loading')}</div>;

    return (
        <div className="barcode-page-grid">
            {/* ═══ LEFT PANEL: Config + Products ═══ */}
            <div className="barcode-config-panel">

                {/* ─── Template Presets ─── */}
                <div className="card" style={{ padding: 14 }}>
                    <div className="card-title" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>🎨 Template</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{t('barcodes.quickLayouts')}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {TEMPLATE_PRESETS.map((t, i) => (
                            <button key={i}
                                className={`btn btn-sm ${templatePresetIdx === i ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => applyTemplatePreset(i)}
                                title={t.desc}
                                style={{ fontSize: 11 }}>
                                {t.name}
                            </button>
                        ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                        {TEMPLATE_PRESETS[templatePresetIdx].desc}
                    </div>
                </div>

                {/* ─── Label Size ─── */}
                <div className="card" style={{ padding: 14 }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>📐 Label Size</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                        {LABEL_PRESETS.map((p, i) => (
                            <button key={i}
                                className={`btn btn-sm ${labelPresetIdx === i ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => applyLabelPreset(i)}>
                                {p.name}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                        <div>
                            <label className="form-label" style={{ fontSize: 10 }}>Width (mm)</label>
                            <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                value={config.width} onChange={e => setConfig({ ...config, width: Number(e.target.value) || 1 })} />
                        </div>
                        <div>
                            <label className="form-label" style={{ fontSize: 10 }}>Height (mm)</label>
                            <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                value={config.height} onChange={e => setConfig({ ...config, height: Number(e.target.value) || 1 })} />
                        </div>
                        <div>
                            <label className="form-label" style={{ fontSize: 10 }}>Columns</label>
                            <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                value={config.columnsPerRow} onChange={e => setConfig({ ...config, columnsPerRow: Number(e.target.value) || 1 })} min={1} max={10} />
                        </div>
                    </div>
                </div>

                {/* ─── Barcode & Elements ─── */}
                <div className="card" style={{ padding: 14 }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>▦ Barcode & Elements</div>

                    {/* Key barcode controls */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                        <div>
                            <label className="form-label" style={{ fontSize: 10 }}>{t('barcodes.barcodeHeight')}</label>
                            <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                value={config.barcodeHeight} onChange={e => setConfig({ ...config, barcodeHeight: Number(e.target.value) })} min={3} max={30} step={1} />
                        </div>
                        <div>
                            <label className="form-label" style={{ fontSize: 10 }}>{t('barcodes.barWidth')}</label>
                            <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                value={config.barcodeXScale} onChange={e => setConfig({ ...config, barcodeXScale: Number(e.target.value) })} min={0.5} max={3} step={0.1} />
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>0.5=thin → 3.0=thick</div>
                        </div>
                    </div>

                    {/* Toggle elements */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
                        {([
                            ['showName', '📛 Name'],
                            ['showBarcode', '▦ Barcode'],
                            ['showSku', '🏷️ SKU'],
                            ['showPrice', '💰 Price'],
                        ] as [keyof LabelConfig, string][]).map(([key, label]) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                                <input type="checkbox" checked={config[key] as boolean}
                                    onChange={e => setConfig({ ...config, [key]: e.target.checked })} />
                                {label}
                            </label>
                        ))}
                    </div>

                    {/* Name position */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('barcodes.namePosition')}</label>
                        <select style={{ fontSize: 11, padding: '3px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)' }}
                            value={config.namePosition} onChange={e => setConfig({ ...config, namePosition: e.target.value as 'top' | 'bottom' })}>
                            <option value="top">{t('barcodes.aboveBarcode')}</option>
                            <option value="bottom">{t('barcodes.belowBarcode')}</option>
                        </select>
                    </div>

                    {/* Advanced toggle */}
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center', fontSize: 11 }}
                        onClick={() => setShowAdvanced(!showAdvanced)}>
                        {showAdvanced ? '▲ Hide Fine-Tuning' : '▼ Show Fine-Tuning'}
                    </button>

                    {showAdvanced && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                            {/* Font Sizes */}
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('barcodes.fontSizes')}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                                <div>
                                    <label className="form-label" style={{ fontSize: 10 }}>Name</label>
                                    <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                        value={config.nameFontSize} onChange={e => setConfig({ ...config, nameFontSize: Number(e.target.value) || 6 })} min={5} max={20} />
                                </div>
                                <div>
                                    <label className="form-label" style={{ fontSize: 10 }}>SKU</label>
                                    <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                        value={config.skuFontSize} onChange={e => setConfig({ ...config, skuFontSize: Number(e.target.value) || 6 })} min={5} max={16} />
                                </div>
                                <div>
                                    <label className="form-label" style={{ fontSize: 10 }}>Price</label>
                                    <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                        value={config.priceFontSize} onChange={e => setConfig({ ...config, priceFontSize: Number(e.target.value) || 8 })} min={6} max={24} />
                                </div>
                            </div>

                            {/* Padding & Margins */}
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Spacing (mm)</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                                <div>
                                    <label className="form-label" style={{ fontSize: 10 }}>{t('barcodes.padX')}</label>
                                    <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                        value={config.paddingX} onChange={e => setConfig({ ...config, paddingX: Number(e.target.value) })} min={0} step={0.5} />
                                </div>
                                <div>
                                    <label className="form-label" style={{ fontSize: 10 }}>{t('barcodes.padY')}</label>
                                    <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                        value={config.paddingY} onChange={e => setConfig({ ...config, paddingY: Number(e.target.value) })} min={0} step={0.5} />
                                </div>
                                <div>
                                    <label className="form-label" style={{ fontSize: 10 }}>M.Top</label>
                                    <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                        value={config.marginTop} onChange={e => setConfig({ ...config, marginTop: Number(e.target.value) })} min={0} step={0.5} />
                                </div>
                                <div>
                                    <label className="form-label" style={{ fontSize: 10 }}>M.Bot</label>
                                    <input type="number" className="form-input" style={{ padding: '4px 6px', fontSize: 12 }}
                                        value={config.marginBottom} onChange={e => setConfig({ ...config, marginBottom: Number(e.target.value) })} min={0} step={0.5} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ─── Product Selector ─── */}
                <div className="card" style={{ padding: 14, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>📦 {t('barcodes.selectProducts')} ({selected.length})</div>
                    <div className="simple-search" style={{ marginBottom: 8 }}>
                        <div className="simple-search__wrap">
                            <span className="simple-search__icon">🔍</span>
                            <input className="simple-search__input" placeholder={t('barcodes.searchProducts')} value={search}
                                onChange={e => setSearch(e.target.value)} />
                            {search && <button className="simple-search__clear" onClick={() => setSearch('')} type="button">✕</button>}
                        </div>
                    </div>
                    <div style={{ flex: 1, overflow: 'auto' }}>
                        {filteredGrouped.map(({ product, variants }) => {
                            const allSelected = variants.every((v: any) => selected.some(s => s.variantId === v.id));
                            const someSelected = variants.some((v: any) => selected.some(s => s.variantId === v.id));
                            const selectedCount = variants.filter((v: any) => selected.some(s => s.variantId === v.id)).length;
                            const isExpanded = expandedGroups.has(product.id);

                            return (
                                <div key={product.id} style={{ marginBottom: 6 }}>
                                    {/* ── Product Group Header ── */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                                        background: allSelected ? 'rgba(212,175,55,0.12)' : someSelected ? 'rgba(212,175,55,0.05)' : 'var(--bg-tertiary)',
                                        border: allSelected ? '1px solid var(--gold)' : someSelected ? '1px solid rgba(212,175,55,0.3)' : '1px solid var(--border)',
                                        transition: 'all 0.15s',
                                    }}>
                                        <input type="checkbox"
                                            checked={allSelected}
                                            ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                                            onChange={() => toggleAllVariants(product)}
                                            style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
                                        <div style={{ flex: 1, minWidth: 0 }} onClick={() => toggleAllVariants(product)}>
                                            <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {product.name}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                {variants.length} {variants.length === 1 ? 'variant' : 'variants'}
                                                {someSelected && <span style={{ color: 'var(--gold)', marginInlineStart: 6 }}>✓ {selectedCount} selected</span>}
                                            </div>
                                        </div>
                                        {/* Group copies input (when some selected) */}
                                        {someSelected && (
                                            <input type="number" min={1}
                                                value={selected.find(s => variants.some((v: any) => v.id === s.variantId))?.copies || 1}
                                                onChange={e => { e.stopPropagation(); updateAllCopies(product, Number(e.target.value)); }}
                                                onClick={e => e.stopPropagation()}
                                                style={{
                                                    width: 42, padding: '3px 4px', fontSize: 12, textAlign: 'center',
                                                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                                                    borderRadius: 4, color: 'var(--gold)', fontWeight: 700,
                                                }}
                                                title="Copies for all variants" />
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); toggleGroup(product.id); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: '2px 4px' }}>
                                            {isExpanded ? '▲' : '▼'}
                                        </button>
                                    </div>

                                    {/* ── Individual Variants (expanded) ── */}
                                    {isExpanded && (
                                        <div style={{ paddingInlineStart: 20, marginTop: 2 }}>
                                            {variants.map((variant: any) => {
                                                const isSelected = selected.some(s => s.variantId === variant.id);
                                                const sel = selected.find(s => s.variantId === variant.id);
                                                return (
                                                    <div key={variant.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                                                        background: isSelected ? 'rgba(212,175,55,0.08)' : 'transparent',
                                                        borderInlineStart: isSelected ? '2px solid var(--gold)' : '2px solid transparent',
                                                        marginBottom: 2, transition: 'all 0.15s',
                                                    }}>
                                                        <input type="checkbox" checked={isSelected}
                                                            onChange={() => toggleProduct(product, variant)}
                                                            style={{ width: 14, height: 14, accentColor: 'var(--gold)' }} />
                                                        <div style={{ flex: 1, minWidth: 0 }} onClick={() => toggleProduct(product, variant)}>
                                                            <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                                                {variant.sku}
                                                                {variant.size && <span style={{ color: 'var(--gold)', fontWeight: 600 }}> • {variant.size}</span>}
                                                                {variant.color && <span style={{ color: 'var(--text-secondary)' }}> / {variant.color}</span>}
                                                                <span style={{ color: 'var(--text-muted)', marginInlineStart: 8 }}>
                                                                    {fmtPrice(Number(variant.salePrice))} {t('common.lyd')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {isSelected && sel && (
                                                            <input type="number" min={1} value={sel.copies}
                                                                onChange={e => updateCopies(variant.id, Number(e.target.value))}
                                                                onClick={e => e.stopPropagation()}
                                                                style={{
                                                                    width: 38, padding: '2px 4px', fontSize: 11, textAlign: 'center',
                                                                    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                                                                    borderRadius: 4, color: 'var(--text-primary)',
                                                                }}
                                                                title="Copies" />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {filteredGrouped.length === 0 && (
                            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                                {t('barcodes.noProducts')}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══ RIGHT PANEL: Preview + Export ═══ */}
            <div className="barcode-preview-panel">
                {/* Actions bar */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', minWidth: 0 }}>
                        {labels.length} label{labels.length !== 1 ? 's' : ''} • {config.width}×{config.height}mm • X-scale {config.barcodeXScale}
                    </div>
                    <button className="btn btn-secondary" onClick={exportPDF}
                        disabled={labels.length === 0 || exporting}
                        style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        {exporting ? '⏳...' : '📄 PDF'}
                    </button>
                    <button className="btn btn-primary" onClick={printDirect}
                        disabled={labels.length === 0}
                        style={{ whiteSpace: 'nowrap' }}>
                        🖨️ {t('barcodes.printDirect')}
                    </button>
                </div>

                {/* 1:1 Preview */}
                <div className="card" style={{ padding: 20, flex: 1, overflow: 'auto' }}>
                    <div className="card-title" style={{ marginBottom: 12 }}>👁️ 1:1 Preview (actual size at 96dpi)</div>
                    {labels.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>🏷️</div>
                            {t('barcodes.noProducts')}
                        </div>
                    ) : (
                        <div ref={previewRef} style={{
                            display: 'flex', flexWrap: 'wrap', gap: 6,
                            background: '#ffffff', padding: 12, borderRadius: 8,
                        }}>
                            {labels.map((label, idx) => (
                                <div key={`${label.variantId}-${idx}`} style={{
                                    width: mmToPx(config.width),
                                    height: mmToPx(config.height),
                                    border: '1px dashed #bbb',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    padding: `${mmToPx(config.paddingY)}px ${mmToPx(config.paddingX)}px`,
                                    marginTop: mmToPx(config.marginTop),
                                    marginBottom: mmToPx(config.marginBottom),
                                    marginLeft: mmToPx(config.marginLeft),
                                    marginRight: mmToPx(config.marginRight),
                                    background: '#fff',
                                    boxSizing: 'border-box',
                                }}>
                                    {/* Name top */}
                                    {config.showName && config.namePosition === 'top' && (
                                        <div style={{
                                            fontSize: config.nameFontSize,
                                            fontWeight: 700,
                                            color: '#000',
                                            textAlign: 'center',
                                            lineHeight: 1.1,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            width: '100%',
                                            marginBottom: 1,
                                        }}>
                                            {label.productName}{label.size ? ` ${label.size}` : ''}{label.color ? ` ${label.color}` : ''}
                                        </div>
                                    )}

                                    {/* Barcode */}
                                    {config.showBarcode && (
                                        <>
                                            <canvas
                                                ref={el => registerCanvas(el, label.sku)}
                                                style={{
                                                    maxWidth: '100%',
                                                    height: mmToPx(config.barcodeHeight),
                                                    objectFit: 'contain',
                                                }}
                                            />
                                            {!isBarcodeCompatible(label.sku) && (
                                                <div style={{ fontSize: 6, color: '#cc0000', marginTop: -1 }}>⚠ Non-ASCII SKU</div>
                                            )}
                                        </>
                                    )}

                                    {/* SKU text */}
                                    {config.showSku && (
                                        <div style={{
                                            fontSize: config.skuFontSize,
                                            color: !isBarcodeCompatible(label.sku) ? '#cc0000' : '#333',
                                            fontFamily: 'monospace',
                                            letterSpacing: 0.5,
                                            marginTop: 1,
                                        }}>
                                            {label.sku}
                                        </div>
                                    )}

                                    {/* Price (rounded UP to 5) */}
                                    {config.showPrice && (
                                        <div style={{
                                            fontSize: config.priceFontSize,
                                            fontWeight: 800,
                                            color: '#000',
                                            marginTop: 1,
                                        }}>
                                            {fmtPrice(label.salePrice)} LYD
                                        </div>
                                    )}

                                    {/* Name bottom */}
                                    {config.showName && config.namePosition === 'bottom' && (
                                        <div style={{
                                            fontSize: config.nameFontSize,
                                            fontWeight: 700,
                                            color: '#000',
                                            textAlign: 'center',
                                            lineHeight: 1.1,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            width: '100%',
                                            marginTop: 1,
                                        }}>
                                            {label.productName}{label.size ? ` ${label.size}` : ''}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

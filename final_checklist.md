# OMCS Finalization Checklist

## 1. Barcode Labels 🏷️
- [x] **True Label Size Output**: Implemented custom page with presets (50x25, 40x30, 60x40).
- [x] **1:1 Preview**: Added exact millimeter-to-pixel rendering for accurate preview.
- [x] **Layout Editing**: Added controls for margins, padding, font sizes (Name, SKU, Price).
- [x] **SKU Only Barcode**: Barcode now generates from SKU using CODE128 (cleaner than ID).
- [x] **Immediate Use**: Loads products via `productsApi` so labels can be printed before stock is added.

## 2. Product Creation 📦
- [x] **Bulk Variant Default**: Flow now focuses on matrix/bulk creation.
- [x] **Purchase Data fields**:
    - `costUsd` (USD Cost)
    - `purchaseUsdRate` (Exchange rate at time of purchase)
    - `costLydAtPurchase` (Calculated cost in LYD at time of purchase)
    - `purchaseDate`
- [x] **Initial Stock**: Added "Initial Stock Branch" selector to create inventory rows (qty=0) immediately.
- [x] **Image Upload**: Added drag-and-drop image upload to creation flow.

## 3. Accounting & USD Volatility 💱
- [x] **Historical Cost Tracking**: `purchaseUsdRate` and `costLydAtPurchase` are saved on variants and NOT updated when the daily rate changes.
- [x] **Sale Price Rounding**: `recalculateSalePrices` and creation logic now rounds sale price **UP to the nearest 5 LYD**.
- [x] **Invoice Details**:
    - Expanded sale row shows `usdRateAtSale`.
    - Receipt prints purchase context (for managers/owners): "Purchase: $X @ Rate = Y LYD".

## 4. Inventory Polish 📋
- [x] **Thumbnails**: Added product thumbnails to the Inventory Grouped View.
- [x] **Image Preview**: Clicking thumbnail opens a larger preview modal.

## 5. POS Optimization 🛒
- [x] **Grid/List View**: Toggle available.
- [x] **Thumbnails**: Images displayed in both grid and list modes.
- [x] **Optimized Layout**: Clean inputs and touch-friendly buttons.

## Status
**Ready for Production Deployment in Tripoli Store.** 🇱🇾
All critical "real world usage" features have been implemented.

# OMCS Accounting Architecture

## Overview

All internal pricing is USD-based. Invoices are LYD-only.

---

## 1. Product Creation

Each variant stores:
| Field | Type | Description |
|---|---|---|
| `costUsd` | decimal | Purchase cost in USD |
| `sellUsd` | decimal | **Selling price in USD** |
| `purchaseUsdRate` | decimal | USD→LYD rate at time of purchase |
| `costLydAtPurchase` | decimal | `costUsd × purchaseUsdRate` (**IMMUTABLE**) |
| `costPrice` | decimal | Same as costLydAtPurchase (legacy) |
| `salePrice` | decimal | `sellUsd × sellingUsdRate` (rounded ↑5 LYD) |
| `marginPercent` | decimal | Optional per-variant margin override |

### Formulas
```
costLydAtPurchase = costUsd × purchaseUsdRate   ← IMMUTABLE after creation
salePrice = sellUsd × sellingUsdRate            ← MUTABLE, recalculated on rate change
```

If variant has no `sellUsd`, sale price falls back to margin-based:
```
salePrice = (costUsd × sellingUsdRate) / (1 - margin/100)
```

---

## 2. System Settings (Two Separate Rates)

| Setting | Purpose |
|---|---|
| `parallelUsdRate` | Default purchase rate for new products |
| `sellingUsdRate` | Rate used to calculate sale prices |
| `defaultMarginPercent` | Fallback margin when no `sellUsd` is set |

### API Endpoints
- `POST /api/settings/selling-usd-rate` → Updates selling rate, optionally recalculates sale prices
- `POST /api/settings/purchase-usd-rate` → Updates default purchase rate (no recalculation)
- `POST /api/settings/usd-rate` → Legacy alias (updates selling rate)

---

## 3. Inventory Valuation (IMMUTABLE)

```
valueLyd = SUM(inventory.quantity × inventory.costLydAtPurchase)
```

Inventory value **NEVER** changes when:
- Selling USD rate changes
- Purchase USD rate changes
- Sale prices are recalculated

Fallback chain: `inv.costLydAtPurchase → variant.costLydAtPurchase → 0`

**NEVER** falls back to `variant.costPrice`, `variant.salePrice`, or current rate.

---

## 4. Selling Logic (`recalculateSalePrices`)

When admin updates `sellingUsdRate` with `recalculate: true`:

```
For each variant with sellUsd:
  salePrice = CEIL(sellUsd × sellingUsdRate / 5) × 5

For each variant with costUsd (no sellUsd):
  salePrice = CEIL((costUsd × sellingUsdRate) / (1 - margin/100) / 5) × 5
```

### What changes:
- ✅ `salePrice` (LYD)
- ✅ `profitMargin` (recalculated)
- ✅ Price history logged

### What NEVER changes:
- ❌ `costUsd`
- ❌ `costPrice`
- ❌ `costLydAtPurchase`
- ❌ `purchaseUsdRate`
- ❌ `purchaseDate`
- ❌ Inventory batch costs

---

## 5. Sale Snapshot (IMMUTABLE)

At time of sale, each `SaleItem` stores:
| Field | Value |
|---|---|
| `unitPrice` | Sale price in LYD at time of sale |
| `unitCost` | Weighted avg cost from FIFO batches |
| `costUsdAtPurchase` | Original USD cost |
| `purchaseUsdRateAtPurchase` | Rate when purchased |
| `costLydAtPurchase` | Historical cost LYD |
| `usdRateAtSale` | Current selling rate at sale time |
| `saleDate` | Date of sale |

All snapshot fields are **IMMUTABLE** after creation.

---

## 6. Invoice Rule

Customer invoice shows **ONLY**:
- ✅ Product name
- ✅ Quantity
- ✅ Sale price (LYD)
- ✅ Total (LYD)
- ✅ Payment method
- ✅ Date

Invoice **NEVER** shows:
- ❌ Cost / costUsd / costLydAtPurchase
- ❌ purchaseUsdRate / sellingUsdRate
- ❌ Profit / margin
- ❌ Any USD values

---

## 7. Accounting Visibility (OWNER only)

Cost, USD rates, and profit are visible **ONLY** to `OWNER` role in a separate accounting modal on the Sales page.

Never visible to:
- ❌ CASHIER
- ❌ Printed receipt
- ❌ Customer-facing displays

---

## 8. File Changes Summary

### Backend
| File | Change |
|---|---|
| `product-variant.entity.ts` | Added `sellUsd` column |
| `settings.service.ts` | Added `sellingUsdRate` default, `updateSellingUsdRate()`, simplified formula |
| `settings.controller.ts` | Added `selling-usd-rate` and `purchase-usd-rate` endpoints |
| `inventory.service.ts` | Fallbacks use `costLydAtPurchase` only |
| `dashboard.service.ts` | SQL uses `COALESCE(i.cost_lyd_at_purchase, v.cost_lyd_at_purchase, 0)` |
| `sales.service.ts` | FIFO cost fallback uses `variant.costLydAtPurchase` |

### Frontend
| File | Change |
|---|---|
| `products/page.tsx` | Added `sellUsd` field to variant creation form |
| `prices/page.tsx` | Added `Sell USD` column |
| `exchange-rate/page.tsx` | Split into Purchase Rate and Selling Rate sections |
| `inventory/page.tsx` | Uses `inventoryValue` (historical cost) |

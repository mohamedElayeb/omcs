# OMCS v1 — Feature Status Checklist & Phase 2 E-Commerce Proposal

*Generated: 2026-02-18 • Verified against actual codebase*

---

## PART 1: OMCS v1 Feature Status Checklist

### ✅ Barcode: Real Template Control
| Feature | Status | Where |
|---|---|---|
| Label size presets (50×25, 40×30, 60×40, 70×35, Custom) | ✅ Implemented | `frontend/src/app/barcodes/page.tsx` L7-13 |
| Template layout presets (Classic Top, Wide Barcode) | ✅ Implemented | Same file L16-41 |
| Margins (top, bottom, left, right) | ✅ Implemented | `LabelConfig` interface L47-67 |
| Padding X/Y for inner spacing | ✅ Implemented | Same config |
| Name position: top / bottom | ✅ Implemented | `namePosition: 'top' \| 'bottom'` |
| Show/hide: name, SKU, price, barcode | ✅ Implemented | `showName`, `showSku`, `showPrice`, `showBarcode` booleans |
| Font size control (name, SKU, price) | ✅ Implemented | `nameFontSize`, `skuFontSize`, `priceFontSize` |
| Barcode height & X-scale control | ✅ Implemented | `barcodeHeight`, `barcodeXScale` |
| Columns per row (A4 grid layouts) | ✅ Implemented | `columnsPerRow` in config |
| Roll label support (continuous) | ✅ Implemented | Individual label prints with configurable dimensions |
| A4 grid layouts | ✅ Implemented | Multi-column layout with `columnsPerRow` |
| PDF export | ✅ Implemented | `exportPDF()` function L260-371 |
| **UI Page** | `/barcodes` | Full label design studio with live preview |

---

### ✅ Product Creation: Cost in USD + Purchase USD Rate + Images
| Feature | Status | Where |
|---|---|---|
| `costUsd` stored on variant | ✅ Implemented | `entities/product-variant.entity.ts` L29 |
| `purchaseUsdRate` stored immutably on variant | ✅ Implemented | Same entity L32 |
| `costLydAtPurchase` stored immutably on inventory batch | ✅ Implemented | `entities/inventory.entity.ts` L47-50 |
| Image upload for products | ✅ Implemented | `products/page.tsx` L366-376 |
| Images displayed in Products page | ✅ Implemented | `products/page.tsx` L454-458 |
| Images displayed in POS page (grid + list views) | ✅ Implemented | `pos/page.tsx` L265, L289, L324, L343, L400 |
| Images displayed in Inventory page | ✅ Implemented | `inventory/page.tsx` L356-359 |
| Image preview modal | ✅ Implemented | `previewModal` state on Products & Inventory pages |
| **UI Pages** | `/products`, `/pos`, `/inventory` | All show product images |

---

### ✅ Pricing Rules (Libya)
| Feature | Status | Where |
|---|---|---|
| Inventory valuation = historical `costLydAtPurchase × qty` | ✅ Implemented | `inventory.service.ts` L167-199 |
| Inventory value does NOT change on USD rate update | ✅ Verified | Zero references to `exchangeRate` in inventory service |
| Only `salePrice` changes when USD rate updated | ✅ Implemented | `settings.service.ts` L104-168 |
| `costPrice`, `costLydAtPurchase`, `purchaseUsdRate` NEVER changed | ✅ Verified | Comments at L145, L158-161 |
| Sale price rounding: UP to nearest 5 LYD | ✅ Implemented | `Math.ceil((sellUsd * sellingRate) / 5) * 5` at L127, L134 |
| Cost price: NO rounding | ✅ Verified | Cost data stored as raw decimals with precision 12,3 |
| Dual USD rates (selling + parallel purchase) | ✅ Implemented | `settings.service.ts` L8-9, L53-92 |
| Per-product/brand/category rate recalculation | ✅ Implemented | Filters param in `recalculateSalePrices` L107 |
| Price change audit trail | ✅ Implemented | `PriceHistory` entity logged on every change L142-150 |
| **UI Page** | `/exchange-rate` | Rate management with optional recalculation |

---

### ✅ Invoice Log
| Feature | Status | Where |
|---|---|---|
| Invoice number per sale | ✅ Implemented | `sale.entity.ts` `invoiceNumber` |
| Payment method: CASH / CARD / DELIVERY / BANK_TRANSFER | ✅ Implemented | `PaymentMethod` enum + `paymentBadge()` in sales page |
| Delivery paid status: PAID / UNPAID / PENDING | ✅ Implemented | `DeliveryPaidStatus` enum + `deliveryBadge()` |
| Bank transfer status: PENDING / CONFIRMED / REJECTED | ✅ Implemented | `TransferPaymentStatus` enum + `transferBadge()` |
| Bank transfer audit logs | ✅ Implemented | `BankTransferLog` entity + endpoint + UI modal |
| Delivery status tracking | ✅ Implemented | `deliveryOrderStatus` field + update modal |
| Date range search: Today / 7d / 30d / Custom | ✅ Implemented | `sales/page.tsx` L184-195, quick preset buttons |
| CSV export with all fields | ✅ Implemented | `exportCSV()` L128-150 |
| CSV includes: invoice, date, branch, cashier, items, subtotal, discount, total, payment, status, delivery, transfer, customer | ✅ Verified | L130 column headers |
| OWNER-only accounting view (cost + profit) | ✅ Implemented | `sales.controller.ts` — deletes cost fields for non-OWNER |
| **UI Page** | `/sales` | Full invoice list with filters, badges, export |

---

### ✅ Permissions: Cashier Discount Limit + Manager Override
| Feature | Status | Where |
|---|---|---|
| `maxDiscountPercent` on User entity | ✅ Implemented | `user.entity.ts` L38-39, default 10% |
| `maxDiscountValue` on User entity | ✅ Implemented | `user.entity.ts` L41-42 |
| Discount exceeded → requires manager override | ✅ Implemented | `sales.service.ts` L60-65 |
| Item-level discount validation | ✅ Implemented | `sales.service.ts` L135-139 |
| Manager `overridePin` on User entity | ✅ Implemented | `user.entity.ts` L45 |
| `POST /api/auth/verify-pin` endpoint | ✅ Implemented | `auth.controller.ts` L26-30 |
| `verifyManagerPin()` service method | ✅ Implemented | `auth.service.ts` L41-45 |
| POS: PIN modal when discount exceeds limit | ✅ Implemented | `pos/page.tsx` L33-36, L135 |
| POS: `managerOverrideBy` sent with sale | ✅ Implemented | `pos/page.tsx` L142 |
| Seed data with realistic limits (Owner=100%, Manager=50%, Cashier=10%) | ✅ Implemented | `seed.ts` L48-52 |
| **UI Page** | `/pos` (PIN modal) | Manager PIN popup on discount exceed |

---

### ✅ Transfers: Immediate Transfer with Real-time Updates
| Feature | Status | Where |
|---|---|---|
| Immediate transfer (atomic, single transaction) | ✅ Implemented | `inventory.service.ts` L401-551 |
| FIFO deduction (oldest batches first) | ✅ Implemented | `order: { createdAt: 'ASC' }` L447 |
| Historical costs preserved on destination | ✅ Implemented | `costUsd`, `purchaseUsdRate`, `costLydAtPurchase` copied L456-494 |
| 400 error if insufficient stock (no partial transfers) | ✅ Implemented | L450-451, validation before deduction |
| Same-branch rejection | ✅ Implemented | L439 |
| `inventory.updated` events for BOTH branches | ✅ Implemented | L530-531 |
| `stock.alert` emission on low stock | ✅ Implemented | L536-545 (fixed event name) |
| UI: instant refresh on both branches | ✅ Implemented | WebSocket listener → `loadData()` on `inventory.updated` |
| UI: mode toggle (immediate vs 3-step) | ✅ Implemented | `transfers/page.tsx` |
| Audit trail: `StockTransfer` record with COMPLETED status | ✅ Implemented | L518-527 |
| Stock movements for both IN and OUT | ✅ Implemented | L502-515 |
| **UI Pages** | `/transfers`, `/inventory` | Both reflect changes instantly |

---

### ✅ Additional Features Confirmed
| Feature | Status | Where |
|---|---|---|
| Low stock alerts (real-time WebSocket) | ✅ Implemented | Events gateway + Inventory page toast |
| Offline POS (queued sales) | ✅ Implemented | `pos/page.tsx` L168-170, outbox pattern |
| Inventory search: field-based filters (SKU, name, brand, size, color, status) | ✅ Implemented | Backend: `inventory.service.ts` getGrouped filters; Frontend: Advanced Filters panel |
| Sales date range filtering (server-side) | ✅ Implemented | `sales.service.ts` findAll with startDate/endDate |
| Sales CSV export | ✅ Implemented | `sales/page.tsx` L128-150 |
| Receipt printing | ✅ Implemented | `sales/page.tsx` printReceipt() |

---

## ⚠️ Items NOT YET Implemented (Gaps)

| Item | Status | Notes |
|---|---|---|
| Admin UI to set per-cashier discount limits | ❌ Not yet | Backend entity and validation exist, but no admin form in `/users` to manage `maxDiscountPercent`/`maxDiscountValue`. Currently set via seed data only. |
| Admin UI to manage manager override PINs | ❌ Not yet | `overridePin` field exists on User entity but no UI to set/change it. |
| Barcode scanner input on POS | ⚠️ Partial | Barcode generation works, but POS doesn't have an explicit "scan barcode" mode (SKU search works as workaround) |
| Delivery company API integration | ❌ Not yet | Manual fields exist (company name, tracking number). No external API integration. |
| Customer database / CRM | ❌ Not yet | Customer name/phone captured per-sale but no dedicated customer entity or history view |
| Returns / Refund workflow | ⚠️ Partial | Entity + badges exist, but the full return workflow UI may need refinement |

---

## PART 2: Customer E-Commerce Website — Phase 2 Proposal

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  CUSTOMER WEBSITE (Next.js SSR/SSG)                     │
│  ├── Public Catalog (SSG + ISR for SEO)                 │
│  ├── Cart (localStorage + zustand)                      │
│  ├── Checkout (server-side validated)                   │
│  └── Order Tracking (authenticated)                     │
├─────────────────────────────────────────────────────────┤
│  SHARED BACKEND (NestJS — existing OMCS backend)        │
│  ├── Public API: /api/storefront/...                    │
│  │   ├── GET /products (paginated, filtered)            │
│  │   ├── GET /products/:slug                            │
│  │   ├── POST /orders (create order + reserve stock)    │
│  │   ├── GET /orders/:id (tracking)                     │
│  │   └── POST /orders/:id/payment-proof (bank transfer) │
│  ├── Internal (existing OMCS admin APIs — unchanged)    │
│  └── Orders Module (new)                                │
│      ├── Order entity (status lifecycle)                │
│      ├── Stock reservation (TTL-based hold)             │
│      └── Delivery integration                           │
├─────────────────────────────────────────────────────────┤
│  DATABASE (PostgreSQL — same instance, new tables)      │
│  ├── orders, order_items                                │
│  ├── customers (email, phone, address history)          │
│  └── stock_reservations (TTL-based temporary holds)     │
└─────────────────────────────────────────────────────────┘
```

### Module Breakdown

#### 1. Public Catalog API
**New endpoints on existing backend:**
```
GET  /api/storefront/products?page=1&limit=24&brand=Nike&category=Shoes&size=42
GET  /api/storefront/products/:slug
GET  /api/storefront/categories
GET  /api/storefront/brands
```

- Products shown only if `isPublished = true` and `quantity > 0`
- Cost data NEVER exposed — only `salePrice`, `name`, `brand`, `size`, `color`, `imageUrl`
- Paginated, filterable, searchable
- SEO-friendly slug-based URLs

#### 2. Cart & Checkout
- **Cart**: Client-side (zustand + localStorage), no backend state
- **Checkout**: Server-validated
  - Re-checks stock availability at checkout time
  - Creates temporary stock reservation (15-minute TTL)
  - If order not confirmed in 15 min → stock released back
  - Prevents overselling without permanent holds

#### 3. Orders Module (NEW)
```
Customer Order Lifecycle:
  PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
                ↘ CANCELLED (+ stock release)

Entities:
  - Order (id, customerId, status, total, deliveryFee, paymentMethod,
           paymentProof, shippingAddress, city, phone, deliveryCompany,
           trackingNumber, createdAt)
  - OrderItem (orderId, variantId, quantity, unitPrice, size, color)
  - Customer (id, name, email, phone, addressHistory[])
  - StockReservation (orderId, variantId, quantity, expiresAt)
```

**Key design:**
- `StockReservation` has TTL → cron job releases expired reservations
- Order confirmation converts reservation to actual `SALE` record in OMCS
- This bridges the customer website with the existing POS/accounting system

#### 4. Payment Options (Libya)
| Method | Phase | How |
|---|---|---|
| Cash on Delivery (COD) | MVP | Customer selects COD → order created as PENDING → manual confirmation by OMCS admin |
| Bank Transfer | MVP | Customer uploads payment proof (screenshot) → admin confirms in OMCS → order moves to CONFIRMED |
| Card (Tadawul/Sadad) | Phase 2 | If payment gateway available — otherwise manual proof upload |
| Wallet (Mobicash/Edfa3ly) | Phase 3 | API integration when available |

**Libya reality:** Most customers pay COD or bank transfer. Card gateways are limited. MVP should focus on COD + bank transfer proof upload.

#### 5. Delivery Integration
| Phase | Approach |
|---|---|
| **Phase 1 (MVP)** | Manual: customer selects city → admin selects delivery company → enters tracking number → customer can view status |
| **Phase 2** | Export: generate delivery manifests (CSV/PDF) for popular Libyan companies (Aramex Libya, Libya Post, local couriers) |
| **Phase 3** | API: direct integration with any company that has an API (if available in Libya) |

**Customer tracking:** Simple status page at `/track/:orderId` showing order lifecycle stages.

---

### Estimated Timeline

#### MVP (4-6 weeks)
| Week | Deliverable |
|---|---|
| **1** | Customer entity, Order/OrderItem entities, StockReservation entity, Orders module with CRUD |
| **2** | Storefront API (public catalog with filters, pagination, SEO slugs) |
| **3** | Customer website: catalog pages (SSG), product detail, search/filter UI |
| **4** | Cart + Checkout flow, payment proof upload, order confirmation page |
| **5** | Admin order management panel in OMCS (view orders, confirm, update status) |
| **6** | Polish, testing, stock reservation TTL cron, deployment |

#### MVP Features:
- ✅ Product catalog with images, sizes, colors, filtering
- ✅ Cart (client-side) + Checkout
- ✅ COD + Bank Transfer payment
- ✅ Manual delivery (city selection, admin assigns company)
- ✅ Order tracking for customers
- ✅ Admin order management in OMCS dashboard
- ✅ Stock reservation to prevent overselling

#### Post-MVP (Weeks 7-10)
| Week | Feature |
|---|---|
| **7** | Customer accounts (login, order history, saved addresses) |
| **8** | Delivery manifest export (CSV for courier companies) |
| **9** | WhatsApp order notifications (via wa.me links or API) |
| **10** | Analytics: popular products, conversion funnel, customer LTV |

#### Phase 3 (Future)
- Card payment gateway (when available)
- Delivery API integration
- Multi-language (Arabic/English) storefront
- Mobile app (React Native using same APIs)

---

### Technology Stack for Customer Website

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Next.js 16 (SSR/SSG) | SEO, same stack as OMCS admin |
| Backend | NestJS (existing) | Reuse existing modules, single deployment |
| Database | PostgreSQL (existing) | Same instance, new tables |
| Image CDN | Cloudinary or statically served | Product images |
| Hosting | VPS (same server) or Vercel + Railway | Cost-effective for Libya |

### Key Architecture Decisions:
1. **Same backend, separate frontend** — storefront API lives in existing NestJS app as a new module
2. **Stock reservation pattern** — prevents overselling without blocking POS sales
3. **COD-first** — aligns with Libyan market reality
4. **SSG for catalog** — fast page loads on Libyan internet speeds
5. **No microservices** — single deployment, simpler for Phase 1

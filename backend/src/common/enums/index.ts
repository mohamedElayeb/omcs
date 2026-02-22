export enum UserRole {
    OWNER = 'OWNER',
    MANAGER = 'MANAGER',
    CASHIER = 'CASHIER',
    VIEWER = 'VIEWER',
}

export enum StockMovementAction {
    RESTOCK = 'RESTOCK',
    SALE = 'SALE',
    SALE_VOID = 'SALE_VOID',
    TRANSFER_IN = 'TRANSFER_IN',
    TRANSFER_OUT = 'TRANSFER_OUT',
    ADJUSTMENT = 'ADJUSTMENT',
    RETURN = 'RETURN',
    RETURN_RESTOCK = 'RETURN_RESTOCK',
    ORDER_CONFIRM = 'ORDER_CONFIRM',
    ORDER_CANCEL = 'ORDER_CANCEL',
}

export enum TransferStatus {
    DRAFT = 'DRAFT',             // created but not yet approved
    PENDING = 'PENDING',         // awaiting dispatch
    APPROVED = 'APPROVED',       // approved, ready to ship
    DISPATCHED = 'DISPATCHED',
    RECEIVED = 'RECEIVED',
    CANCELLED = 'CANCELLED',
    COMPLETED = 'COMPLETED',     // immediate transfer (no approval)
}

export enum ReturnType {
    RETURN = 'RETURN',
    EXCHANGE = 'EXCHANGE',
    POS_RETURN = 'POS_RETURN',     // return against POS sale
    ORDER_RETURN = 'ORDER_RETURN', // return against online order
}

export enum ReturnStatus {
    REQUESTED = 'REQUESTED',
    APPROVED = 'APPROVED',
    COMPLETED = 'COMPLETED',
    REJECTED = 'REJECTED',
}

export enum RestockPolicy {
    RESTOCK = 'RESTOCK',     // item goes back to inventory
    DAMAGED = 'DAMAGED',     // item is damaged, do NOT restock
}

export enum RefundMethod {
    CASH = 'CASH',
    CARD = 'CARD',
    TRANSFER = 'TRANSFER',
    STORE_CREDIT = 'STORE_CREDIT',
}

export enum PaymentMethod {
    CASH = 'CASH',
    CARD = 'CARD',
    DELIVERY = 'DELIVERY',
    BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum SaleStatus {
    COMPLETED = 'COMPLETED',
    PARTIAL_RETURN = 'PARTIAL_RETURN',
    REFUNDED = 'REFUNDED',
    VOIDED = 'VOIDED',             // POS void — stock reverted
}

export enum DeliveryPaidStatus {
    PAID = 'PAID',
    UNPAID = 'UNPAID',
    PENDING = 'PENDING',
}

export enum TransferPaymentStatus {
    PENDING = 'PENDING',
    CONFIRMED = 'CONFIRMED',
    REJECTED = 'REJECTED',
}

export enum DeliveryCompany {
    SELF_PICKUP = 'SELF_PICKUP',
    SPRINT = 'SPRINT',
    YALLA_DELIVERY = 'YALLA_DELIVERY',
    WASIL = 'WASIL',
    OTHER = 'OTHER',
}

export enum DeliveryOrderStatus {
    PENDING = 'PENDING',
    PICKED_UP = 'PICKED_UP',
    IN_TRANSIT = 'IN_TRANSIT',
    DELIVERED = 'DELIVERED',
    RETURNED = 'RETURNED',
    CANCELLED = 'CANCELLED',
}

// ─── Storefront / E-Commerce (Phase 2) ───

export enum OrderStatus {
    PENDING = 'PENDING',             // Just placed, awaiting payment confirmation
    CONFIRMED = 'CONFIRMED',         // Payment confirmed (COD auto-confirms)
    PROCESSING = 'PROCESSING',       // Being packed
    SHIPPED = 'SHIPPED',             // Handed to delivery company
    DELIVERED = 'DELIVERED',          // Customer received
    CANCELLED = 'CANCELLED',         // Cancelled (stock released)
    REFUNDED = 'REFUNDED',           // Refunded after delivery
}

export enum OrderPaymentMethod {
    COD = 'COD',                     // Cash on delivery — Libya default
    BANK_TRANSFER = 'BANK_TRANSFER', // Upload proof screenshot
    CARD = 'CARD',                   // Card payment (Sadad / local cards)
}

export enum OrderPaymentStatus {
    PENDING = 'PENDING',
    CONFIRMED = 'CONFIRMED',
    REJECTED = 'REJECTED',
}

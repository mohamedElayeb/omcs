import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('sale_items')
export class SaleItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'sale_id' })
    saleId: string;

    @ManyToOne(() => Sale, (s) => s.items)
    @JoinColumn({ name: 'sale_id' })
    sale: Sale;

    @Column({ name: 'variant_id' })
    variantId: string;

    @ManyToOne(() => ProductVariant)
    @JoinColumn({ name: 'variant_id' })
    variant: ProductVariant;

    @Column({ type: 'int' })
    quantity: number;

    @Column({ name: 'qty_returned', type: 'int', default: 0 })
    qtyReturned: number;

    // ─── Price Snapshot at Sale Time ───
    @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 3 })
    unitPrice: number;

    @Column({ name: 'unit_cost', type: 'decimal', precision: 12, scale: 3 })
    unitCost: number;

    @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
    discount: number;

    @Column({ name: 'line_total', type: 'decimal', precision: 12, scale: 3 })
    lineTotal: number;

    @Column({ name: 'line_profit', type: 'decimal', precision: 12, scale: 3 })
    lineProfit: number;

    // ─── Historical Purchase Cost Snapshot (immutable audit trail) ───
    @Column({ name: 'cost_usd_at_purchase', type: 'decimal', precision: 12, scale: 3, nullable: true })
    costUsdAtPurchase: number;

    @Column({ name: 'purchase_usd_rate_at_purchase', type: 'decimal', precision: 10, scale: 4, nullable: true })
    purchaseUsdRateAtPurchase: number;

    @Column({ name: 'cost_lyd_at_purchase', type: 'decimal', precision: 12, scale: 3, nullable: true })
    costLydAtPurchase: number;

    @Column({ name: 'purchase_date_at_purchase', type: 'date', nullable: true })
    purchaseDateAtPurchase: string;

    // ─── Sale Time Snapshot ───
    @Column({ name: 'usd_rate_at_sale', type: 'decimal', precision: 10, scale: 4, nullable: true })
    usdRateAtSale: number;

    @Column({ name: 'sale_date', type: 'date', nullable: true })
    saleDate: string;
}

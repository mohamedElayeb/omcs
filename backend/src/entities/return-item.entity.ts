import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { RestockPolicy } from '../common/enums';
import { Return } from './return.entity';
import { ProductVariant } from './product-variant.entity';
import { SaleItem } from './sale-item.entity';

@Entity('return_items')
export class ReturnItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'return_id' })
    returnId: string;

    @ManyToOne(() => Return, (r) => r.items)
    @JoinColumn({ name: 'return_id' })
    return: Return;

    // ─── Link to original SaleItem (for POS returns) ───
    @Column({ name: 'sale_item_id', nullable: true })
    saleItemId: string;

    @ManyToOne(() => SaleItem, { nullable: true })
    @JoinColumn({ name: 'sale_item_id' })
    saleItem: SaleItem;

    @Column({ name: 'variant_id' })
    variantId: string;

    @ManyToOne(() => ProductVariant)
    @JoinColumn({ name: 'variant_id' })
    variant: ProductVariant;

    @Column({ type: 'int' })
    quantity: number;

    @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 3 })
    unitPrice: number;

    // ─── Line-level totals ───
    @Column({ name: 'line_refund_total', type: 'decimal', precision: 12, scale: 3, default: 0 })
    lineRefundTotal: number;

    // ─── Per-item restock policy (RESTOCK or DAMAGED) ───
    @Column({ name: 'restock_policy', type: 'enum', enum: RestockPolicy, default: RestockPolicy.RESTOCK })
    restockPolicy: RestockPolicy;

    @Column({ type: 'text', nullable: true })
    note: string;

    // ─── Legacy exchange field (kept for backward compat) ───
    @Column({ name: 'exchange_variant_id', nullable: true })
    exchangeVariantId: string;

    @ManyToOne(() => ProductVariant, { nullable: true })
    @JoinColumn({ name: 'exchange_variant_id' })
    exchangeVariant: ProductVariant;
}

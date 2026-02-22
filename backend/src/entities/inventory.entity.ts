import {
    Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { ProductVariant } from './product-variant.entity';
import { Branch } from './branch.entity';

/**
 * Inventory row = one batch of stock at one branch.
 * 
 * Each restock at a different cost creates a NEW row (batch),
 * preserving historical purchase cost. This enables FIFO costing
 * and accurate inventory valuation.
 * 
 * Legacy rows without cost fields are treated as "unknown cost" batches.
 */
@Entity('inventory')
export class Inventory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'variant_id' })
    variantId: string;

    @ManyToOne(() => ProductVariant)
    @JoinColumn({ name: 'variant_id' })
    variant: ProductVariant;

    @Column({ name: 'branch_id' })
    branchId: string;

    @ManyToOne(() => Branch)
    @JoinColumn({ name: 'branch_id' })
    branch: Branch;

    @Column({ type: 'int', default: 0 })
    quantity: number;

    @Column({ name: 'low_stock_threshold', type: 'int', default: 5 })
    lowStockThreshold: number;

    @Column({ name: 'last_restocked', nullable: true })
    lastRestocked: Date;

    // ─── Batch Purchase Cost (immutable after creation) ───
    @Column({ name: 'cost_usd', type: 'decimal', precision: 12, scale: 3, nullable: true })
    costUsd: number;

    @Column({ name: 'purchase_usd_rate', type: 'decimal', precision: 10, scale: 4, nullable: true })
    purchaseUsdRate: number;

    @Column({ name: 'cost_lyd_at_purchase', type: 'decimal', precision: 12, scale: 3, nullable: true })
    costLydAtPurchase: number;

    @Column({ name: 'purchase_date', type: 'date', nullable: true })
    purchaseDate: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

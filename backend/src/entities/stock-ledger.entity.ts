import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { ProductVariant } from './product-variant.entity';
import { Branch } from './branch.entity';
import { User } from './user.entity';

/**
 * StockLedger — immutable audit trail for every stock mutation.
 * 
 * Every stock change (sale, void, order confirm, transfer, return, adjustment)
 * creates a ledger entry. qtyDelta is +/- representing the direction.
 * Use this for reconciliation, audit, and debugging inventory discrepancies.
 */
@Entity('stock_ledger')
export class StockLedger {
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

    @Column({ name: 'movement_type', length: 30 })
    movementType: string;
    // SALE, SALE_VOID, ORDER_CONFIRM, ORDER_CANCEL, TRANSFER_SHIP, TRANSFER_RECEIVE,
    // RETURN_RESTOCK, ADJUSTMENT, RESTOCK

    @Column({ name: 'qty_delta', type: 'int' })
    qtyDelta: number; // positive = stock in, negative = stock out

    @Column({ name: 'qty_after', type: 'int' })
    qtyAfter: number;

    @Column({ name: 'reference_type', length: 30, nullable: true })
    referenceType: string; // 'sale', 'order', 'transfer', 'return', etc.

    @Column({ name: 'reference_id', nullable: true })
    referenceId: string;

    @Column({ name: 'unit_cost', type: 'decimal', precision: 12, scale: 3, nullable: true })
    unitCost: number;

    @Column({ type: 'text', nullable: true })
    note: string;

    @Column({ name: 'created_by', nullable: true })
    createdBy: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'created_by' })
    creator: User;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

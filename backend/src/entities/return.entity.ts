import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { ReturnType, ReturnStatus, RestockPolicy, RefundMethod } from '../common/enums';
import { Sale } from './sale.entity';
import { Order } from './order.entity';
import { Branch } from './branch.entity';
import { User } from './user.entity';
import { ReturnItem } from './return-item.entity';

@Entity('returns')
export class Return {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ─── Return Receipt Number (RET-YYYYMMDD-XXXX) ───
    @Column({ name: 'return_receipt_no', length: 30, unique: true, nullable: true })
    returnReceiptNo: string;

    // POS return: links to sale
    @Column({ name: 'original_sale_id', nullable: true })
    originalSaleId: string;

    @ManyToOne(() => Sale, { nullable: true })
    @JoinColumn({ name: 'original_sale_id' })
    originalSale: Sale;

    // Order return: links to order
    @Column({ name: 'original_order_id', nullable: true })
    originalOrderId: string;

    @ManyToOne(() => Order, { nullable: true })
    @JoinColumn({ name: 'original_order_id' })
    originalOrder: Order;

    @Column({ name: 'branch_id' })
    branchId: string;

    @ManyToOne(() => Branch)
    @JoinColumn({ name: 'branch_id' })
    branch: Branch;

    @Column({ name: 'processed_by' })
    processedBy: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'processed_by' })
    processor: User;

    // ─── Approved By (optional — for approval workflow) ───
    @Column({ name: 'approved_by', nullable: true })
    approvedBy: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'approved_by' })
    approver: User;

    @Column({ type: 'enum', enum: ReturnType, default: ReturnType.RETURN })
    type: ReturnType;

    @Column({ type: 'enum', enum: ReturnStatus, default: ReturnStatus.COMPLETED })
    status: ReturnStatus;

    // ─── Legacy global restock policy (kept for ORDER_RETURN backward compat) ───
    @Column({ name: 'restock_policy', type: 'enum', enum: RestockPolicy, default: RestockPolicy.RESTOCK })
    restockPolicy: RestockPolicy;

    // ─── Refund ───
    @Column({ name: 'refund_method', type: 'enum', enum: RefundMethod, nullable: true })
    refundMethod: RefundMethod;

    @Column({ name: 'refund_amount', type: 'decimal', precision: 12, scale: 3, default: 0 })
    refundAmount: number;

    @Column({ length: 500, nullable: true })
    reason: string;

    @Column({ name: 'admin_notes', type: 'text', nullable: true })
    adminNotes: string;

    @OneToMany(() => ReturnItem, (item) => item.return, { cascade: true })
    items: ReturnItem[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { PaymentMethod, SaleStatus, DeliveryPaidStatus, TransferPaymentStatus, DeliveryCompany, DeliveryOrderStatus } from '../common/enums';
import { Branch } from './branch.entity';
import { User } from './user.entity';
import { SaleItem } from './sale-item.entity';

@Entity('sales')
export class Sale {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'idempotency_key', type: 'uuid', unique: true, nullable: true })
    idempotencyKey: string;

    @Column({ name: 'manager_override_by', nullable: true })
    managerOverrideBy: string;

    @Column({ name: 'invoice_number', unique: true, length: 30 })
    invoiceNumber: string;

    @Column({ name: 'branch_id' })
    branchId: string;

    @ManyToOne(() => Branch)
    @JoinColumn({ name: 'branch_id' })
    branch: Branch;

    @Column({ name: 'cashier_id' })
    cashierId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'cashier_id' })
    cashier: User;

    @Column({ type: 'decimal', precision: 12, scale: 3 })
    subtotal: number;

    @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 3, default: 0 })
    discountAmount: number;

    @Column({ name: 'discount_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
    discountPercent: number;

    @Column({ type: 'decimal', precision: 12, scale: 3 })
    total: number;

    @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
    profit: number;

    // ─── Payment & Status ───
    @Column({ name: 'payment_method', type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
    paymentMethod: PaymentMethod;

    @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.COMPLETED })
    status: SaleStatus;

    @Column({ name: 'paid_amount', type: 'decimal', precision: 12, scale: 3, nullable: true })
    paidAmount: number;

    @Column({ name: 'remaining_amount', type: 'decimal', precision: 12, scale: 3, nullable: true })
    remainingAmount: number;

    @Column({ name: 'delivery_paid_status', type: 'enum', enum: DeliveryPaidStatus, nullable: true })
    deliveryPaidStatus: DeliveryPaidStatus;

    @Column({ type: 'text', nullable: true })
    notes: string;

    // ─── USD Rate Snapshot at Sale Time ───
    @Column({ name: 'usd_rate_at_sale', type: 'decimal', precision: 10, scale: 4, nullable: true })
    usdRateAtSale: number;

    // ─── Bank Transfer Fields (Feature A) ───
    @Column({ name: 'transfer_payment_status', type: 'enum', enum: TransferPaymentStatus, nullable: true })
    transferPaymentStatus: TransferPaymentStatus;

    @Column({ name: 'transfer_reference', length: 100, nullable: true })
    transferReference: string;

    @Column({ name: 'transfer_bank_name', length: 100, nullable: true })
    transferBankName: string;

    @Column({ name: 'transfer_amount', type: 'decimal', precision: 12, scale: 3, nullable: true })
    transferAmount: number;

    @Column({ name: 'transfer_date', type: 'date', nullable: true })
    transferDate: Date;

    // ─── Delivery Phase 1 Fields (Feature E) ───
    @Column({ name: 'customer_name', length: 150, nullable: true })
    customerName: string;

    @Column({ name: 'customer_phone', length: 30, nullable: true })
    customerPhone: string;

    @Column({ name: 'delivery_address', type: 'text', nullable: true })
    deliveryAddress: string;

    @Column({ name: 'delivery_city', length: 60, nullable: true })
    deliveryCity: string;

    @Column({ name: 'delivery_company', type: 'enum', enum: DeliveryCompany, nullable: true })
    deliveryCompany: DeliveryCompany;

    @Column({ name: 'delivery_fee', type: 'decimal', precision: 12, scale: 3, nullable: true })
    deliveryFee: number;

    @Column({ name: 'tracking_number', length: 80, nullable: true })
    trackingNumber: string;

    @Column({ name: 'delivery_order_status', type: 'enum', enum: DeliveryOrderStatus, nullable: true })
    deliveryOrderStatus: DeliveryOrderStatus;

    @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true })
    items: SaleItem[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Customer } from './customer.entity';
import { OrderItem } from './order-item.entity';
import { Branch } from './branch.entity';
import { OrderStatus, OrderPaymentMethod, OrderPaymentStatus } from '../common/enums';

@Entity('orders')
export class Order {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'order_number', unique: true, length: 30 })
    orderNumber: string;

    // ─── Customer ───
    @Column({ name: 'customer_id', nullable: true })
    customerId: string;

    @ManyToOne(() => Customer, { nullable: true })
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Column({ name: 'customer_name', length: 200 })
    customerName: string;

    @Column({ name: 'customer_phone', length: 30 })
    customerPhone: string;

    @Column({ name: 'customer_email', length: 200, nullable: true })
    customerEmail: string;

    // ─── Shipping ───
    @Column({ name: 'shipping_address', length: 500 })
    shippingAddress: string;

    @Column({ name: 'shipping_city', length: 100 })
    shippingCity: string;

    @Column({ name: 'address_notes', length: 500, nullable: true })
    addressNotes: string;

    // ─── Delivery ───
    @Column({ name: 'delivery_company', length: 100, nullable: true })
    deliveryCompany: string;

    @Column({ name: 'tracking_number', length: 100, nullable: true })
    trackingNumber: string;

    @Column({ name: 'delivery_fee', type: 'decimal', precision: 12, scale: 3, default: 0 })
    deliveryFee: number;

    // ─── Pricing ───
    @Column({ type: 'decimal', precision: 14, scale: 3 })
    subtotal: number;

    @Column({ type: 'decimal', precision: 14, scale: 3 })
    total: number;

    // ─── Status ───
    @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
    status: OrderStatus;

    // ─── Payment ───
    @Column({ name: 'payment_method', type: 'enum', enum: OrderPaymentMethod, default: OrderPaymentMethod.COD })
    paymentMethod: OrderPaymentMethod;

    @Column({ name: 'payment_status', type: 'enum', enum: OrderPaymentStatus, default: OrderPaymentStatus.PENDING })
    paymentStatus: OrderPaymentStatus;

    @Column({ name: 'payment_proof_url', length: 500, nullable: true })
    paymentProofUrl: string;

    @Column({ name: 'payment_note', length: 500, nullable: true })
    paymentNote: string;

    // ─── Fulfillment ───
    @Column({ name: 'fulfilled_from_branch_id', nullable: true })
    fulfilledFromBranchId: string;

    @ManyToOne(() => Branch, { nullable: true })
    @JoinColumn({ name: 'fulfilled_from_branch_id' })
    fulfilledFromBranch: Branch;

    @Column({ name: 'admin_notes', type: 'text', nullable: true })
    adminNotes: string;

    // ─── Items ───
    @OneToMany(() => OrderItem, (oi) => oi.order, { cascade: true })
    items: OrderItem[];

    // ─── Reservation ───
    @Column({ name: 'reservation_expires_at', type: 'timestamptz', nullable: true })
    reservationExpiresAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

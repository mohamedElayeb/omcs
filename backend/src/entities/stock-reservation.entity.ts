import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { ProductVariant } from './product-variant.entity';

/**
 * Temporary stock hold for an order.
 * When a customer checks out, we reserve stock for 15 minutes.
 * If the order is confirmed, reservations are converted to actual stock deductions.
 * If not confirmed (expired), a cron job releases the hold.
 */
@Entity('stock_reservations')
export class StockReservation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'order_id' })
    orderId: string;

    @ManyToOne(() => Order)
    @JoinColumn({ name: 'order_id' })
    order: Order;

    @Column({ name: 'variant_id' })
    variantId: string;

    @ManyToOne(() => ProductVariant)
    @JoinColumn({ name: 'variant_id' })
    variant: ProductVariant;

    @Column({ name: 'branch_id' })
    branchId: string;

    @Column()
    quantity: number;

    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt: Date;

    @Column({ name: 'is_released', default: false })
    isReleased: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

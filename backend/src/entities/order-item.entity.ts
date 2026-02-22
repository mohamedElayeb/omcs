import {
    Entity, PrimaryGeneratedColumn, Column,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('order_items')
export class OrderItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'order_id' })
    orderId: string;

    @ManyToOne(() => Order, (o) => o.items)
    @JoinColumn({ name: 'order_id' })
    order: Order;

    @Column({ name: 'variant_id' })
    variantId: string;

    @ManyToOne(() => ProductVariant)
    @JoinColumn({ name: 'variant_id' })
    variant: ProductVariant;

    @Column()
    quantity: number;

    @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 3 })
    unitPrice: number;

    @Column({ name: 'line_total', type: 'decimal', precision: 14, scale: 3 })
    lineTotal: number;

    // Snapshot of product info at order time
    @Column({ name: 'product_name', length: 200 })
    productName: string;

    @Column({ length: 20, nullable: true })
    size: string;

    @Column({ length: 30, nullable: true })
    color: string;

    @Column({ length: 50, nullable: true })
    sku: string;
}

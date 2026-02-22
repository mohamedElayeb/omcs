import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_variants')
export class ProductVariant {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true, length: 50 })
    sku: string;

    @Column({ name: 'product_id' })
    productId: string;

    @ManyToOne(() => Product, (p) => p.variants)
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column({ length: 20, nullable: true })
    size: string;

    @Column({ length: 30, nullable: true })
    color: string;

    @Column({ name: 'cost_usd', type: 'decimal', precision: 12, scale: 3, nullable: true })
    costUsd: number;

    @Column({ name: 'purchase_usd_rate', type: 'decimal', precision: 10, scale: 4, nullable: true })
    purchaseUsdRate: number;

    @Column({ name: 'cost_lyd_at_purchase', type: 'decimal', precision: 12, scale: 3, nullable: true })
    costLydAtPurchase: number;

    @Column({ name: 'sell_usd', type: 'decimal', precision: 12, scale: 3, nullable: true })
    sellUsd: number;

    @Column({ name: 'purchase_date', type: 'date', nullable: true })
    purchaseDate: string;

    @Column({ name: 'cost_price', type: 'decimal', precision: 12, scale: 3 })
    costPrice: number;

    @Column({ name: 'sale_price', type: 'decimal', precision: 12, scale: 3 })
    salePrice: number;

    @Column({
        name: 'margin_percent',
        type: 'decimal',
        precision: 5,
        scale: 2,
        nullable: true,
    })
    marginPercent: number;

    @Column({
        name: 'profit_margin',
        type: 'decimal',
        precision: 5,
        scale: 2,
        nullable: true,
    })
    profitMargin: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

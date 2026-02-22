import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { ProductVariant } from './product-variant.entity';
import { User } from './user.entity';

@Entity('price_history')
export class PriceHistory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'variant_id' })
    variantId: string;

    @ManyToOne(() => ProductVariant)
    @JoinColumn({ name: 'variant_id' })
    variant: ProductVariant;

    @Column({ name: 'old_cost_price', type: 'decimal', precision: 12, scale: 3, nullable: true })
    oldCostPrice: number;

    @Column({ name: 'new_cost_price', type: 'decimal', precision: 12, scale: 3, nullable: true })
    newCostPrice: number;

    @Column({ name: 'old_sale_price', type: 'decimal', precision: 12, scale: 3 })
    oldSalePrice: number;

    @Column({ name: 'new_sale_price', type: 'decimal', precision: 12, scale: 3 })
    newSalePrice: number;

    @Column({ name: 'changed_by' })
    changedBy: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'changed_by' })
    changedByUser: User;

    @Column({ nullable: true })
    reason: string;

    @CreateDateColumn({ name: 'changed_at' })
    changedAt: Date;
}

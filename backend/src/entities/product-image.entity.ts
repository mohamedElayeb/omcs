import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_images')
export class ProductImage {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'product_id' })
    productId: string;

    @ManyToOne(() => Product, (p) => p.images, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column({ name: 'image_url', length: 500 })
    imageUrl: string;

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    @Column({ name: 'is_primary', default: false })
    isPrimary: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

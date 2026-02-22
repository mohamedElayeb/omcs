import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Category } from './category.entity';
import { ProductVariant } from './product-variant.entity';
import { ProductImage } from './product-image.entity';

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 200 })
    name: string;

    @Column({ name: 'name_ar', length: 200, nullable: true })
    nameAr: string;

    @Column({ length: 100, nullable: true })
    brand: string;

    @Column({ name: 'category_id', nullable: true })
    categoryId: string;

    @ManyToOne(() => Category, { nullable: true })
    @JoinColumn({ name: 'category_id' })
    category: Category;

    @Column({ name: 'image_url', length: 500, nullable: true })
    imageUrl: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @OneToMany(() => ProductVariant, (v) => v.product)
    variants: ProductVariant[];

    @OneToMany(() => ProductImage, (img) => img.product, { eager: false })
    images: ProductImage[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

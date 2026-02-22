import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, OneToMany,
} from 'typeorm';

@Entity('customers')
export class Customer {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 200 })
    name: string;

    @Column({ length: 200, nullable: true })
    email: string;

    @Column({ length: 30 })
    phone: string;

    @Column({ length: 500, nullable: true })
    address: string;

    @Column({ length: 100, nullable: true })
    city: string;

    @Column({ name: 'address_notes', length: 500, nullable: true })
    addressNotes: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'total_orders', default: 0 })
    totalOrders: number;

    @Column({ name: 'total_spent', type: 'decimal', precision: 14, scale: 3, default: 0 })
    totalSpent: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

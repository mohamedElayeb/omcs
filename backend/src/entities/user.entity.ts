import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { UserRole } from '../common/enums';
import { Branch } from './branch.entity';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true, length: 100 })
    email: string;

    @Column({ name: 'password_hash', length: 255 })
    passwordHash: string;

    @Column({ name: 'full_name', length: 100 })
    fullName: string;

    @Column({ type: 'enum', enum: UserRole, default: UserRole.CASHIER })
    role: UserRole;

    @Column({ name: 'branch_id', nullable: true })
    branchId: string;

    @ManyToOne(() => Branch, { nullable: true })
    @JoinColumn({ name: 'branch_id' })
    branch: Branch;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'phone', length: 20, nullable: true })
    phone: string;

    @Column({ name: 'max_discount_percent', type: 'decimal', precision: 5, scale: 2, default: 10 })
    maxDiscountPercent: number;

    @Column({ name: 'max_discount_value', type: 'decimal', precision: 12, scale: 3, default: 0 })
    maxDiscountValue: number;

    @Column({ name: 'override_pin', length: 10, nullable: true })
    overridePin: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { StockMovementAction } from '../common/enums';
import { ProductVariant } from './product-variant.entity';
import { Branch } from './branch.entity';
import { User } from './user.entity';

@Entity('stock_movements')
export class StockMovement {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'variant_id' })
    variantId: string;

    @ManyToOne(() => ProductVariant)
    @JoinColumn({ name: 'variant_id' })
    variant: ProductVariant;

    @Column({ name: 'branch_id' })
    branchId: string;

    @ManyToOne(() => Branch)
    @JoinColumn({ name: 'branch_id' })
    branch: Branch;

    @Column({ type: 'enum', enum: StockMovementAction })
    action: StockMovementAction;

    @Column({ name: 'quantity_change', type: 'int' })
    quantityChange: number;

    @Column({ name: 'quantity_after', type: 'int' })
    quantityAfter: number;

    @Column({ length: 255, nullable: true })
    note: string;

    @Column({ name: 'reference_id', nullable: true })
    referenceId: string;

    @Column({ name: 'performed_by', nullable: true })
    performedBy: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'performed_by' })
    performer: User;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

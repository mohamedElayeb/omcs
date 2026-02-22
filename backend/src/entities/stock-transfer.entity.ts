import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { TransferStatus } from '../common/enums';
import { ProductVariant } from './product-variant.entity';
import { Branch } from './branch.entity';
import { User } from './user.entity';

@Entity('stock_transfers')
export class StockTransfer {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'variant_id' })
    variantId: string;

    @ManyToOne(() => ProductVariant)
    @JoinColumn({ name: 'variant_id' })
    variant: ProductVariant;

    @Column({ name: 'from_branch_id' })
    fromBranchId: string;

    @ManyToOne(() => Branch)
    @JoinColumn({ name: 'from_branch_id' })
    fromBranch: Branch;

    @Column({ name: 'to_branch_id' })
    toBranchId: string;

    @ManyToOne(() => Branch)
    @JoinColumn({ name: 'to_branch_id' })
    toBranch: Branch;

    @Column({ type: 'int' })
    quantity: number;

    @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.PENDING })
    status: TransferStatus;

    @Column({ name: 'initiated_by' })
    initiatedBy: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'initiated_by' })
    initiator: User;

    @Column({ name: 'dispatched_by', nullable: true })
    dispatchedBy: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'dispatched_by' })
    dispatcher: User;

    @Column({ name: 'received_by', nullable: true })
    receivedBy: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'received_by' })
    receiver: User;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @Column({ name: 'dispatched_at', nullable: true })
    dispatchedAt: Date;

    @Column({ name: 'received_at', nullable: true })
    receivedAt: Date;

    @Column({ name: 'cancelled_at', nullable: true })
    cancelledAt: Date;
}

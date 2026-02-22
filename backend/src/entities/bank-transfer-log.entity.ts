import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { TransferPaymentStatus } from '../common/enums';
import { Sale } from './sale.entity';
import { User } from './user.entity';

@Entity('bank_transfer_logs')
export class BankTransferLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'sale_id' })
    saleId: string;

    @ManyToOne(() => Sale)
    @JoinColumn({ name: 'sale_id' })
    sale: Sale;

    @Column({ name: 'old_status', type: 'enum', enum: TransferPaymentStatus, nullable: true })
    oldStatus: TransferPaymentStatus;

    @Column({ name: 'new_status', type: 'enum', enum: TransferPaymentStatus })
    newStatus: TransferPaymentStatus;

    @Column({ name: 'changed_by' })
    changedBy: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'changed_by' })
    changedByUser: User;

    @Column({ type: 'text', nullable: true })
    note: string;

    @CreateDateColumn({ name: 'changed_at' })
    changedAt: Date;
}

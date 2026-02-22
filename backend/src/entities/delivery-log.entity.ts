import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { DeliveryPaidStatus } from '../common/enums';
import { Sale } from './sale.entity';
import { User } from './user.entity';

@Entity('delivery_logs')
export class DeliveryLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'sale_id' })
    saleId: string;

    @ManyToOne(() => Sale)
    @JoinColumn({ name: 'sale_id' })
    sale: Sale;

    @Column({ name: 'old_status', type: 'enum', enum: DeliveryPaidStatus, nullable: true })
    oldStatus: DeliveryPaidStatus;

    @Column({ name: 'new_status', type: 'enum', enum: DeliveryPaidStatus })
    newStatus: DeliveryPaidStatus;

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

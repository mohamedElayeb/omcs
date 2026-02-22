import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { Branch } from './branch.entity';
import { User } from './user.entity';

@Entity('daily_closings')
export class DailyClosing {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'branch_id' })
    branchId: string;

    @ManyToOne(() => Branch)
    @JoinColumn({ name: 'branch_id' })
    branch: Branch;

    @Column({ name: 'closed_by' })
    closedBy: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'closed_by' })
    closer: User;

    @Column({ name: 'closing_date', type: 'date' })
    closingDate: string;

    @Column({ name: 'total_sales', type: 'decimal', precision: 12, scale: 3, default: 0 })
    totalSales: number;

    @Column({ name: 'total_returns', type: 'decimal', precision: 12, scale: 3, default: 0 })
    totalReturns: number;

    @Column({ name: 'net_sales', type: 'decimal', precision: 12, scale: 3, default: 0 })
    netSales: number;

    @Column({ name: 'total_profit', type: 'decimal', precision: 12, scale: 3, default: 0 })
    totalProfit: number;

    @Column({ name: 'transaction_count', type: 'int', default: 0 })
    transactionCount: number;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

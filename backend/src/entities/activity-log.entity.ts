import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('activity_logs')
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Action category: SALE, VOID, RESTOCK, TRANSFER, PRODUCT_CREATE, PRODUCT_EDIT, PRODUCT_DELETE, PRICE_UPDATE, RETURN, DELIVERY_STATUS, BANK_STATUS, LOGIN */
  @Column()
  action: string;

  /** Entity type: sale, product, inventory, transfer, return, price, user */
  @Column()
  entityType: string;

  /** ID of the related entity (sale ID, product ID, etc.) */
  @Column({ nullable: true })
  entityId: string;

  /** Human-readable summary of what happened */
  @Column({ type: 'text' })
  description: string;

  /** JSON string with detailed diff / before-after data */
  @Column({ type: 'text', nullable: true })
  details: string;

  /** Who performed the action */
  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Branch context (if applicable) */
  @Column({ nullable: true })
  branchId: string;

  /** IP address of the requester */
  @Column({ nullable: true })
  ipAddress: string;

  @CreateDateColumn()
  createdAt: Date;
}

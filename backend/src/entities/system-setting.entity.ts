import {
    Entity, PrimaryColumn, Column, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('system_settings')
export class SystemSetting {
    @PrimaryColumn({ length: 100 })
    key: string;

    @Column({ type: 'text' })
    value: string;

    @Column({ name: 'updated_by', nullable: true })
    updatedBy: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'updated_by' })
    updatedByUser: User;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

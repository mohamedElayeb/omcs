import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    OneToMany,
} from 'typeorm';

@Entity('branches')
export class Branch {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 100 })
    name: string;

    @Column({ length: 100, name: 'name_en', nullable: true })
    nameEn: string;

    @Column({ length: 255, nullable: true })
    address: string;

    @Column({ length: 20, nullable: true })
    phone: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

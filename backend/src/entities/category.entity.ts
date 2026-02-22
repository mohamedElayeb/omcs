import {
    Entity, PrimaryGeneratedColumn, Column,
} from 'typeorm';

@Entity('categories')
export class Category {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 100 })
    name: string;

    @Column({ name: 'name_ar', length: 100, nullable: true })
    nameAr: string;

    @Column({ length: 255, nullable: true })
    description: string;
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product, ProductVariant, Inventory, Category } from '../../entities';
import { ProductImage } from '../../entities/product-image.entity';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Product, ProductVariant, Inventory, Category, ProductImage]),
    ],
    controllers: [StorefrontController],
    providers: [StorefrontService],
    exports: [StorefrontService],
})
export class StorefrontModule { }

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product, ProductVariant, Category, PriceHistory, Inventory } from '../../entities';
import { ProductImage } from '../../entities/product-image.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
    imports: [TypeOrmModule.forFeature([Product, ProductVariant, Category, PriceHistory, Inventory, ProductImage])],
    controllers: [ProductsController],
    providers: [ProductsService],
    exports: [ProductsService],
})
export class ProductsModule { }

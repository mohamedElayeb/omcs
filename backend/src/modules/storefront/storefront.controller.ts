import { Controller, Get, Param, Query } from '@nestjs/common';
import { StorefrontService } from './storefront.service';

/**
 * PUBLIC API — No authentication required.
 * All endpoints at /api/storefront/...
 * NEVER exposes cost, profit, or internal data.
 */
@Controller('api/storefront')
export class StorefrontController {
    constructor(private readonly service: StorefrontService) { }

    @Get('products')
    getProducts(
        @Query('page') page: string,
        @Query('limit') limit: string,
        @Query('category') category: string,
        @Query('brand') brand: string,
        @Query('search') search: string,
        @Query('size') size: string,
        @Query('color') color: string,
        @Query('sort') sort: string,
    ) {
        return this.service.getProducts({
            page: Number(page) || 1,
            limit: Number(limit) || 24,
            category, brand, search, size, color,
            sort: sort as any,
        });
    }

    @Get('products/:id')
    getProduct(@Param('id') id: string) {
        return this.service.getProduct(id);
    }

    @Get('categories')
    getCategories() {
        return this.service.getCategories();
    }

    @Get('brands')
    getBrands() {
        return this.service.getBrands();
    }

    @Get('sizes')
    getSizes(@Query('category') category: string, @Query('brand') brand: string) {
        return this.service.getSizes(category, brand);
    }

    @Get('colors')
    getColors(@Query('category') category: string, @Query('brand') brand: string) {
        return this.service.getColors(category, brand);
    }
}

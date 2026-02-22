import {
    Controller, Get, Post, Patch, Delete, Param, Body, Query,
    UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { ProductsService } from './products.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('api')
export class ProductsController {
    constructor(private service: ProductsService) { }

    // Categories
    @Get('categories')
    findAllCategories() { return this.service.findAllCategories(); }

    @Post('categories')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    createCategory(@Body() data: any) { return this.service.createCategory(data); }

    // Products
    @Get('products')
    findAll(@Query() query: any) { return this.service.findAll(query); }

    @Get('products/:id')
    findOne(@Param('id') id: string) { return this.service.findOne(id); }

    @Get('products/sku/:sku')
    findBySku(@Param('sku') sku: string) { return this.service.findBySku(sku); }

    @Post('products')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    create(@Body() data: any) { return this.service.create(data); }

    @Patch('products/:id')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    update(@Param('id') id: string, @Body() data: any) { return this.service.update(id, data); }

    // ── Image Upload ──
    @Post('products/upload-image')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    @UseInterceptors(FileInterceptor('image', {
        storage: diskStorage({
            destination: './uploads',
            filename: (_req, file, cb) => {
                const ext = extname(file.originalname).toLowerCase();
                cb(null, `${uuid()}${ext}`);
            },
        }),
        fileFilter: (_req, file, cb) => {
            const ext = extname(file.originalname).toLowerCase();
            if (!ALLOWED_EXT.includes(ext)) {
                return cb(new BadRequestException('Only jpg, png, webp files allowed'), false);
            }
            cb(null, true);
        },
        limits: { fileSize: MAX_SIZE },
    }))
    async uploadImage(
        @UploadedFile() file: any,
        @Body('productId') productId?: string,
        @Body('isPrimary') isPrimary?: string,
    ) {
        if (!file) throw new BadRequestException('No file uploaded');
        const imageUrl = `/uploads/${file.filename}`;
        if (productId) {
            // Add to product_images table
            await this.service.addImage(productId, imageUrl, isPrimary === 'true');
        }
        return { imageUrl, filename: file.filename };
    }

    @Get('products/:productId/images')
    getImages(@Param('productId') productId: string) {
        return this.service.getImages(productId);
    }

    @Post('products/:productId/images')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    @UseInterceptors(FileInterceptor('image', {
        storage: diskStorage({
            destination: './uploads',
            filename: (_req, file, cb) => {
                const ext = extname(file.originalname).toLowerCase();
                cb(null, `${uuid()}${ext}`);
            },
        }),
        fileFilter: (_req, file, cb) => {
            const ext = extname(file.originalname).toLowerCase();
            if (!ALLOWED_EXT.includes(ext)) {
                return cb(new BadRequestException('Only jpg, png, webp files allowed'), false);
            }
            cb(null, true);
        },
        limits: { fileSize: MAX_SIZE },
    }))
    async addProductImage(
        @Param('productId') productId: string,
        @UploadedFile() file: any,
        @Body('isPrimary') isPrimary?: string,
    ) {
        if (!file) throw new BadRequestException('No file uploaded');
        const imageUrl = `/uploads/${file.filename}`;
        return this.service.addImage(productId, imageUrl, isPrimary === 'true');
    }

    @Patch('products/images/:imageId/delete')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    removeImage(@Param('imageId') imageId: string) {
        return this.service.removeImage(imageId);
    }

    // Variants
    @Post('products/:productId/variants')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    addVariant(@Param('productId') productId: string, @Body() data: any) {
        return this.service.addVariant(productId, data);
    }

    @Patch('variants/:variantId')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    updateVariant(@Param('variantId') variantId: string, @Body() data: any, @CurrentUser() user: any) {
        return this.service.updateVariant(variantId, data, user.id, data.reason);
    }

    // Bulk Price Update
    @Post('products/bulk-price-update')
    @Roles(UserRole.OWNER)
    bulkPriceUpdate(@Body() data: any, @CurrentUser() user: any) {
        return this.service.bulkPriceUpdate(
            data.percentChange,
            user.id,
            { categoryId: data.categoryId, brand: data.brand },
            data.reason,
        );
    }

    // Price History
    @Get('price-history')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    getPriceHistory(@Query('variantId') variantId?: string) {
        return this.service.getPriceHistory(variantId);
    }

    @Delete('products/:id')
    @Roles(UserRole.OWNER)
    deleteProduct(@Param('id') id: string) {
        return this.service.deleteProduct(id);
    }

    @Delete('variants/:variantId')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    deleteVariant(@Param('variantId') variantId: string) {
        return this.service.deleteVariant(variantId);
    }
}

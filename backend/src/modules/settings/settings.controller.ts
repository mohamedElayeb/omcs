import {
    Controller, Get, Post, Body, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('api/settings')
export class SettingsController {
    constructor(private service: SettingsService) { }

    @Get()
    getAll() {
        return this.service.getAll();
    }

    /**
     * Update the SELLING USD rate and optionally recalculate sale prices.
     * salePrice = sellUsd × sellingUsdRate (rounded up to nearest 5 LYD).
     * NEVER touches purchase costs.
     */
    @Post('selling-usd-rate')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    updateSellingUsdRate(
        @Body() data: { rate: number; recalculate?: boolean; categoryId?: string; brand?: string },
        @CurrentUser() user: any,
    ) {
        return this.service.updateSellingUsdRate(
            data.rate,
            user.id,
            data.recalculate ?? false,
            { categoryId: data.categoryId, brand: data.brand },
        );
    }

    /**
     * Update the PURCHASE USD rate (default rate for new purchases).
     * Does NOT recalculate anything.
     */
    @Post('purchase-usd-rate')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    updatePurchaseUsdRate(
        @Body() data: { rate: number },
        @CurrentUser() user: any,
    ) {
        return this.service.updatePurchaseUsdRate(data.rate, user.id);
    }

    /**
     * Legacy alias: updates sellingUsdRate and recalculates.
     */
    @Post('usd-rate')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    updateUsdRate(
        @Body() data: { rate: number; recalculate?: boolean; categoryId?: string; brand?: string },
        @CurrentUser() user: any,
    ) {
        return this.service.updateSellingUsdRate(
            data.rate,
            user.id,
            data.recalculate ?? false,
            { categoryId: data.categoryId, brand: data.brand },
        );
    }

    @Post('recalculate-prices')
    @Roles(UserRole.OWNER, UserRole.MANAGER)
    async recalculatePrices(
        @Body() data: { categoryId?: string; brand?: string },
        @CurrentUser() user: any,
    ) {
        const rate = await this.service.getNumber('sellingUsdRate');
        const updated = await this.service.recalculateSalePrices(rate, user.id, data);
        return { rate, updated };
    }

    @Post()
    @Roles(UserRole.OWNER)
    updateSetting(
        @Body() data: { key: string; value: string },
        @CurrentUser() user: any,
    ) {
        return this.service.set(data.key, data.value, user.id);
    }
}

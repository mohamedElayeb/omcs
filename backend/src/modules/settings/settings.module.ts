import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting, ProductVariant, PriceHistory } from '../../entities';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
    imports: [TypeOrmModule.forFeature([SystemSetting, ProductVariant, PriceHistory])],
    controllers: [SettingsController],
    providers: [SettingsService],
    exports: [SettingsService],
})
export class SettingsModule { }

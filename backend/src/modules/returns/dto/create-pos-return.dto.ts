import { IsString, IsArray, IsEnum, IsOptional, IsInt, Min, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { RestockPolicy, RefundMethod } from '../../../common/enums';

export class PosReturnItemDto {
    @IsUUID()
    saleItemId: string;

    @IsInt()
    @Min(1)
    qty: number;

    @IsEnum(RestockPolicy)
    restockPolicy: RestockPolicy;

    @IsOptional()
    @IsString()
    note?: string;
}

export class CreatePosReturnDto {
    @IsString()
    invoiceNo: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PosReturnItemDto)
    items: PosReturnItemDto[];

    @IsEnum(RefundMethod)
    refundMethod: RefundMethod;

    @IsOptional()
    @IsString()
    reason?: string;
}

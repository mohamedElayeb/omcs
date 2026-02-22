import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReturnStatus } from '../../../common/enums';

export class UpdateReturnStatusDto {
    @IsEnum(ReturnStatus)
    status: ReturnStatus;

    @IsOptional()
    @IsString()
    adminNotes?: string;
}

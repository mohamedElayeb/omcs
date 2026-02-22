import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../../entities';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
    imports: [TypeOrmModule.forFeature([Branch])],
    controllers: [BranchesController],
    providers: [BranchesService],
    exports: [BranchesService],
})
export class BranchesModule { }

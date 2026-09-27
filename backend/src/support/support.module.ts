import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { CafeSupportService } from './support.service';
import { PrismaService } from '../prisma.service';

@Module({
    controllers: [SupportController],
    providers: [CafeSupportService, PrismaService],
})
export class SupportModule { }

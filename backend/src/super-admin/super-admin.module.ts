import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { RevenueService } from './revenue.service';
import { PrismaService } from '../prisma.service';
import { RolesGuard } from '../auth/roles.guard';

@Module({
    controllers: [SuperAdminController],
    providers: [SuperAdminService, RevenueService, PrismaService, RolesGuard],
})
export class SuperAdminModule { }

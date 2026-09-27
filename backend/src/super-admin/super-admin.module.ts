import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { RevenueService } from './revenue.service';
import { AffiliatesService } from './affiliates.service';
import { PrismaService } from '../prisma.service';
import { RolesGuard } from '../auth/roles.guard';

@Module({
    controllers: [SuperAdminController],
    providers: [
        SuperAdminService,
        RevenueService,
        AffiliatesService,
        PrismaService,
        RolesGuard,
    ],
})
export class SuperAdminModule { }

import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { RevenueService } from './revenue.service';
import { AffiliatesService } from './affiliates.service';
import { SettingsService } from './settings.service';
import { SupportService } from './support.service';
import { MarketingService } from './marketing.service';
import { PrismaService } from '../prisma.service';
import { RolesGuard } from '../auth/roles.guard';

@Module({
    controllers: [SuperAdminController],
    providers: [
        SuperAdminService,
        RevenueService,
        AffiliatesService,
        SettingsService,
        SupportService,
        MarketingService,
        PrismaService,
        RolesGuard,
    ],
})
export class SuperAdminModule { }

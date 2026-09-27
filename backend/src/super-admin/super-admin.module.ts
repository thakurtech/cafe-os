import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../prisma.service';
import { RolesGuard } from '../auth/roles.guard';

@Module({
    controllers: [SuperAdminController],
    providers: [SuperAdminService, PrismaService, RolesGuard],
})
export class SuperAdminModule { }

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma.service';
import { RolesGuard } from './roles.guard';
import { JWT_SECRET } from './jwt-secret';

@Module({
    imports: [
        PassportModule,
        JwtModule.register({
            secret: JWT_SECRET,
            signOptions: { expiresIn: '7d' },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, PrismaService, RolesGuard],
    exports: [AuthService, RolesGuard],
})
export class AuthModule { }

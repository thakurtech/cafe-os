import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    async validateUser(email: string, password: string): Promise<any> {
        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (user && await bcrypt.compare(password, user.password)) {
            const { password, ...result } = user;
            return result;
        }
        return null;
    }

    async login(email: string, password: string) {
        const user = await this.validateUser(email, password);

        if (!user) {
            // A plain Error would surface as a 500, so every mistyped password
            // looked like a server fault and logged an ERROR-level stack trace.
            throw new UnauthorizedException('Invalid credentials');
        }

        const payload = {
            email: user.email,
            sub: user.id,
            role: user.role,
            shopId: user.shopId
        };

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                shopId: user.shopId,
            },
        };
    }

    async register(email: string, password: string, name: string, role: string = 'CUSTOMER') {
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await this.prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role: role as any,
                phone: email, // temporary - use email as phone
            },
        });

        const { password: _, ...result } = user;
        return result;
    }

    /**
     * Seeds the platform owner account on boot.
     *
     * This used to hardcode bcrypt.hash('password') and print the credentials to
     * the log, on every boot including production — a SUPER_ADMIN account with a
     * publicly known password on every deployment. In production the password must
     * now come from SUPER_ADMIN_PASSWORD; without it no account is created, because
     * seeding a guessable platform owner is worse than having none.
     *
     * Outside production it still falls back to 'password' for convenience, and
     * says so, since a local database is not worth protecting.
     */
    async createSuperAdmin() {
        const isProduction = process.env.NODE_ENV === 'production';
        const email = process.env.SUPER_ADMIN_EMAIL?.trim() || 'admin@cafeos.com';
        const configuredPassword = process.env.SUPER_ADMIN_PASSWORD?.trim();

        const existingAdmin = await this.prisma.user.findUnique({ where: { email } });
        if (existingAdmin) {
            return;
        }

        if (isProduction && !configuredPassword) {
            console.error(
                `[auth] No super admin exists and SUPER_ADMIN_PASSWORD is not set, so none was created.\n` +
                `       Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD and restart to seed ${email}.`,
            );
            return;
        }

        if (isProduction && configuredPassword!.length < 12) {
            console.error(
                '[auth] SUPER_ADMIN_PASSWORD is shorter than 12 characters. No super admin was created.',
            );
            return;
        }

        const password = configuredPassword || 'password';

        await this.prisma.user.create({
            data: {
                email,
                password: await bcrypt.hash(password, 10),
                name: 'Platform Owner',
                role: 'SUPER_ADMIN',
                phone: 'admin',
            },
        });

        // Never print the password in production, even though it came from the env.
        console.log(
            configuredPassword
                ? `[auth] Super admin created: ${email} (password from SUPER_ADMIN_PASSWORD)`
                : `[auth] Super admin created for local development: ${email} / password`,
        );
    }
}

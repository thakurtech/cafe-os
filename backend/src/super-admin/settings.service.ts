import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

/** Fixed primary key: there is only ever one settings row. */
const SETTINGS_ID = 'platform';

@Injectable()
export class SettingsService {
    constructor(private prisma: PrismaService) { }

    /**
     * Reads the settings row, creating it from schema defaults on first access so
     * the page never has to handle a missing record.
     */
    async getSettings() {
        return this.prisma.platformSetting.upsert({
            where: { id: SETTINGS_ID },
            update: {},
            create: { id: SETTINGS_ID },
        });
    }

    async updateSettings(dto: UpdatePlatformSettingsDto) {
        // Strip undefined so a partial PATCH never blanks a field it omitted.
        const patch = Object.fromEntries(
            Object.entries(dto).filter(([, value]) => value !== undefined),
        );

        if (Object.keys(patch).length === 0) {
            throw new BadRequestException('No settings provided to update');
        }

        return this.prisma.platformSetting.upsert({
            where: { id: SETTINGS_ID },
            update: patch,
            create: { id: SETTINGS_ID, ...patch },
        });
    }
}

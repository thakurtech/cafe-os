import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

const DEFAULTS = {
    id: 'platform',
    platformName: 'CaféOS',
    supportEmail: 'support@cafeos.com',
    defaultCommissionRate: 150,
    starterPriceMonthly: 499,
    growthPriceMonthly: 999,
    proPriceMonthly: 1999,
    trialDays: 14,
    gracePeriodDays: 7,
    newSignupsEnabled: true,
    affiliateProgramEnabled: true,
    loyaltyEnabled: true,
    gamesEnabled: true,
    maintenanceMode: false,
};

/** Stateful stub so a PATCH is observable on the next read. */
function buildPrismaStub(initial: Record<string, any> | null = null) {
    let row = initial ? { ...initial } : null;

    return {
        stub: {
            platformSetting: {
                upsert: jest.fn(async ({ create, update }: any) => {
                    if (row === null) {
                        row = { ...DEFAULTS, ...create };
                    } else {
                        row = { ...row, ...update };
                    }
                    return row;
                }),
            },
        } as unknown as PrismaService,
        current: () => row,
    };
}

describe('SettingsService.getSettings', () => {
    it('creates the settings row from defaults on first read', async () => {
        const { stub, current } = buildPrismaStub(null);

        const result = await new SettingsService(stub).getSettings();

        expect(result).toMatchObject({ id: 'platform', platformName: 'CaféOS', trialDays: 14 });
        expect(current()).not.toBeNull();
    });

    it('returns the existing row without altering it', async () => {
        const { stub } = buildPrismaStub({ ...DEFAULTS, platformName: 'Renamed' });

        const result = await new SettingsService(stub).getSettings();

        expect(result.platformName).toBe('Renamed');
    });
});

describe('SettingsService.updateSettings', () => {
    it('applies a partial patch and leaves every other field untouched', async () => {
        const { stub, current } = buildPrismaStub({ ...DEFAULTS });

        await new SettingsService(stub).updateSettings({ trialDays: 30 });

        expect(current()).toMatchObject({
            trialDays: 30,
            // Untouched fields must survive the patch.
            platformName: 'CaféOS',
            starterPriceMonthly: 499,
            maintenanceMode: false,
        });
    });

    it('does not blank fields the caller omitted', async () => {
        const { stub, current } = buildPrismaStub({ ...DEFAULTS });

        // An explicit undefined must be dropped, not written as null.
        await new SettingsService(stub).updateSettings({
            maintenanceMode: true,
            platformName: undefined,
        });

        expect(current()).toMatchObject({ maintenanceMode: true, platformName: 'CaféOS' });
        const [[args]] = (stub.platformSetting.upsert as jest.Mock).mock.calls;
        expect(args.update).not.toHaveProperty('platformName');
    });

    it('can turn a boolean switch off, not just on', async () => {
        const { stub, current } = buildPrismaStub({ ...DEFAULTS });

        await new SettingsService(stub).updateSettings({ affiliateProgramEnabled: false });

        expect(current()).toMatchObject({ affiliateProgramEnabled: false });
    });

    it('rejects an empty patch rather than writing nothing', async () => {
        const { stub } = buildPrismaStub({ ...DEFAULTS });

        await expect(new SettingsService(stub).updateSettings({})).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(stub.platformSetting.upsert).not.toHaveBeenCalled();
    });
});

describe('UpdatePlatformSettingsDto validation', () => {
    const check = async (payload: Record<string, unknown>) =>
        validate(plainToInstance(UpdatePlatformSettingsDto, payload), {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

    it('accepts a valid partial payload', async () => {
        expect(await check({ trialDays: 30, maintenanceMode: true })).toHaveLength(0);
    });

    it('accepts an empty payload at the DTO level', async () => {
        // Emptiness is the service's call, not the validator's.
        expect(await check({})).toHaveLength(0);
    });

    it('rejects a negative price', async () => {
        expect(await check({ starterPriceMonthly: -1 })).not.toHaveLength(0);
    });

    it('rejects a trial longer than a year', async () => {
        expect(await check({ trialDays: 400 })).not.toHaveLength(0);
    });

    it('rejects a non-integer price', async () => {
        expect(await check({ proPriceMonthly: 12.5 })).not.toHaveLength(0);
    });

    it('rejects a malformed support email', async () => {
        expect(await check({ supportEmail: 'not-an-email' })).not.toHaveLength(0);
    });

    it('rejects an empty platform name', async () => {
        expect(await check({ platformName: '' })).not.toHaveLength(0);
    });

    it('rejects a non-boolean switch', async () => {
        expect(await check({ maintenanceMode: 'yes' })).not.toHaveLength(0);
    });

    it('rejects an unknown field', async () => {
        expect(await check({ totallyMadeUp: 1 })).not.toHaveLength(0);
    });
});

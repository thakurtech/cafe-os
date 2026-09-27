import {
    IsBoolean,
    IsEmail,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
    MinLength,
} from 'class-validator';

/**
 * Every field is optional so the settings page can PATCH just what changed.
 * Bounds keep a typo from putting the platform into an unsellable state.
 */
export class UpdatePlatformSettingsDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    platformName?: string;

    @IsOptional()
    @IsEmail()
    supportEmail?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100000)
    defaultCommissionRate?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1000000)
    starterPriceMonthly?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1000000)
    growthPriceMonthly?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1000000)
    proPriceMonthly?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(365)
    trialDays?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(90)
    gracePeriodDays?: number;

    @IsOptional()
    @IsBoolean()
    newSignupsEnabled?: boolean;

    @IsOptional()
    @IsBoolean()
    affiliateProgramEnabled?: boolean;

    @IsOptional()
    @IsBoolean()
    loyaltyEnabled?: boolean;

    @IsOptional()
    @IsBoolean()
    gamesEnabled?: boolean;

    @IsOptional()
    @IsBoolean()
    maintenanceMode?: boolean;
}

import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const ANNOUNCEMENT_AUDIENCES = ['ALL', 'TRIAL', 'ACTIVE', 'PAST_DUE'] as const;
export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export class CreateAnnouncementDto {
    @IsString()
    @MinLength(3)
    @MaxLength(200)
    title: string;

    @IsString()
    @MinLength(1)
    @MaxLength(5000)
    body: string;

    @IsOptional()
    @IsIn(ANNOUNCEMENT_AUDIENCES)
    audience?: AnnouncementAudience;

    @IsOptional()
    @IsIn(ANNOUNCEMENT_STATUSES)
    status?: AnnouncementStatus;
}

export class UpdateAnnouncementDto {
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(200)
    title?: string;

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(5000)
    body?: string;

    @IsOptional()
    @IsIn(ANNOUNCEMENT_AUDIENCES)
    audience?: AnnouncementAudience;

    @IsOptional()
    @IsIn(ANNOUNCEMENT_STATUSES)
    status?: AnnouncementStatus;
}

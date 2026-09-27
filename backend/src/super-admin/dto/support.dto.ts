import { IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const TICKET_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const TICKET_CATEGORIES = ['GENERAL', 'BILLING', 'TECHNICAL', 'FEATURE'] as const;

export type TicketStatusValue = (typeof TICKET_STATUSES)[number];
export type TicketPriorityValue = (typeof TICKET_PRIORITIES)[number];

export class CreateTicketDto {
    @IsString()
    @MinLength(3)
    @MaxLength(200)
    subject: string;

    @IsString()
    @MinLength(1)
    @MaxLength(5000)
    body: string;

    @IsOptional()
    @IsIn(TICKET_CATEGORIES)
    category?: string;

    @IsOptional()
    @IsIn(TICKET_PRIORITIES)
    priority?: TicketPriorityValue;

    @IsOptional()
    @IsString()
    shopId?: string;

    @IsOptional()
    @IsEmail()
    contactEmail?: string;
}

export class ReplyToTicketDto {
    @IsString()
    @MinLength(1)
    @MaxLength(5000)
    body: string;

    @IsOptional()
    @IsBoolean()
    isInternal?: boolean;
}

export class UpdateTicketDto {
    @IsOptional()
    @IsIn(TICKET_STATUSES)
    status?: TicketStatusValue;

    @IsOptional()
    @IsIn(TICKET_PRIORITIES)
    priority?: TicketPriorityValue;
}

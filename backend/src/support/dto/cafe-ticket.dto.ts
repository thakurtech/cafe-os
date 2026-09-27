import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const CAFE_TICKET_CATEGORIES = ['GENERAL', 'BILLING', 'TECHNICAL', 'FEATURE'] as const;
export const CAFE_TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export type CafeTicketPriority = (typeof CAFE_TICKET_PRIORITIES)[number];

/**
 * Deliberately has no shopId. The shop is resolved from the authenticated user,
 * so a cafe cannot file a ticket against someone else's shop.
 */
export class CreateCafeTicketDto {
    @IsString()
    @MinLength(3)
    @MaxLength(200)
    subject: string;

    @IsString()
    @MinLength(1)
    @MaxLength(5000)
    body: string;

    @IsOptional()
    @IsIn(CAFE_TICKET_CATEGORIES)
    category?: string;

    @IsOptional()
    @IsIn(CAFE_TICKET_PRIORITIES)
    priority?: CafeTicketPriority;

    @IsOptional()
    @IsEmail()
    contactEmail?: string;
}

export class CafeReplyDto {
    @IsString()
    @MinLength(1)
    @MaxLength(5000)
    body: string;

    // Accepted and ignored: a cafe can never write an internal note.
    @IsOptional()
    @IsBoolean()
    isInternal?: boolean;
}

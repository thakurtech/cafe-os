import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CafeReplyDto, CafeTicketPriority, CreateCafeTicketDto } from './dto/cafe-ticket.dto';

/** Statuses a cafe reply should pull the ticket back into. */
const NEEDS_PLATFORM_ATTENTION = 'OPEN';

@Injectable()
export class CafeSupportService {
    constructor(private prisma: PrismaService) { }

    async createTicket(dto: CreateCafeTicketDto, userId: string) {
        const shopId = await this.resolveShopId(userId);

        return this.prisma.supportTicket.create({
            data: {
                subject: dto.subject,
                body: dto.body,
                category: dto.category ?? 'GENERAL',
                priority: (dto.priority ?? 'NORMAL') as CafeTicketPriority,
                contactEmail: dto.contactEmail ?? null,
                shopId,
                createdById: userId,
            },
        });
    }

    async listMyTickets(userId: string) {
        const shopId = await this.resolveShopId(userId);

        const tickets = await this.prisma.supportTicket.findMany({
            where: { shopId },
            include: {
                // Internal notes must never reach the cafe.
                replies: { where: { isInternal: false }, orderBy: { createdAt: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return tickets.map((ticket) => ({
            id: ticket.id,
            subject: ticket.subject,
            body: ticket.body,
            category: ticket.category,
            priority: ticket.priority,
            status: ticket.status,
            contactEmail: ticket.contactEmail,
            replyCount: ticket.replies.length,
            createdAt: ticket.createdAt.toISOString(),
            resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
        }));
    }

    async getMyTicket(ticketId: string, userId: string) {
        const shopId = await this.resolveShopId(userId);
        const ticket = await this.prisma.supportTicket.findUnique({
            where: { id: ticketId },
            include: {
                replies: { where: { isInternal: false }, orderBy: { createdAt: 'asc' } },
            },
        });

        if (!ticket) {
            throw new NotFoundException('Ticket not found');
        }

        this.assertOwnedBy(ticket.shopId, shopId);

        return ticket;
    }

    /**
     * A cafe reply moves the ticket back to OPEN so it re-enters the platform
     * team's queue. It never stamps firstRespondedAt, which measures the
     * platform's response, and it can never be an internal note.
     */
    async replyToMyTicket(ticketId: string, dto: CafeReplyDto, userId: string) {
        const shopId = await this.resolveShopId(userId);

        return this.prisma.$transaction(async (tx) => {
            // Read inside the transaction. Reading the status first and writing based
            // on it let a reply that raced a close reopen a CLOSED ticket, which this
            // method explicitly promises not to do.
            const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });

            if (!ticket) {
                throw new NotFoundException('Ticket not found');
            }

            this.assertOwnedBy(ticket.shopId, shopId);

            const reply = await tx.supportTicketReply.create({
                data: {
                    ticketId,
                    body: dto.body,
                    isInternal: false,
                    authorId: userId,
                    authorRole: 'CAFE',
                },
            });

            // A closed ticket stays closed; anything else needs looking at again.
            if (ticket.status !== 'CLOSED') {
                await tx.supportTicket.update({
                    where: { id: ticketId },
                    data: { status: NEEDS_PLATFORM_ATTENTION, resolvedAt: null },
                });
            }

            return reply;
        });
    }

    /** Resolves the caller's shop from their user row rather than trusting input. */
    private async resolveShopId(userId: string): Promise<string> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { shopId: true },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }
        if (!user.shopId) {
            throw new ForbiddenException('Your account is not linked to a cafe');
        }

        return user.shopId;
    }

    private assertOwnedBy(ticketShopId: string | null, callerShopId: string) {
        if (ticketShopId !== callerShopId) {
            // Deliberately "not found": do not confirm that another shop's ticket exists.
            throw new NotFoundException('Ticket not found');
        }
    }
}

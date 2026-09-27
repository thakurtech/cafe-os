import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
    CreateTicketDto,
    ReplyToTicketDto,
    TICKET_PRIORITIES,
    TICKET_STATUSES,
    TicketPriorityValue,
    TicketStatusValue,
    UpdateTicketDto,
} from './dto/support.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses that still need the platform team to do something. */
const UNRESOLVED_STATUSES = ['OPEN', 'PENDING'] as const;

const PRIORITY_WEIGHT: Record<string, number> = {
    URGENT: 0,
    HIGH: 1,
    NORMAL: 2,
    LOW: 3,
};

export interface SupportStats {
    open: number;
    pending: number;
    resolved: number;
    closed: number;
    unresolved: number;
    urgentUnresolved: number;
    /** Unresolved tickets that have never had a reply. */
    awaitingFirstReply: number;
    /** Mean hours from ticket creation to first reply, or null when none answered. */
    avgFirstResponseHours: number | null;
    resolvedLast7Days: number;
}

@Injectable()
export class SupportService {
    constructor(private prisma: PrismaService) { }

    async listTickets(filters: { status?: string; priority?: string } = {}) {
        const where: Record<string, unknown> = {};

        if (filters.status) {
            this.assertOneOf(filters.status, TICKET_STATUSES, 'status');
            where.status = filters.status;
        }
        if (filters.priority) {
            this.assertOneOf(filters.priority, TICKET_PRIORITIES, 'priority');
            where.priority = filters.priority;
        }

        const tickets = await this.prisma.supportTicket.findMany({
            where,
            include: {
                shop: { select: { name: true, slug: true } },
                replies: { select: { id: true, createdAt: true, authorRole: true } },
            },
        });

        return tickets
            .map((ticket) => ({
                id: ticket.id,
                subject: ticket.subject,
                category: ticket.category,
                priority: ticket.priority,
                status: ticket.status,
                shopId: ticket.shopId,
                shopName: ticket.shop?.name ?? 'Unlinked',
                contactEmail: ticket.contactEmail,
                replyCount: ticket.replies.length,
                awaitingFirstReply:
                    ticket.firstRespondedAt === null && this.isUnresolved(ticket.status),
                lastActivityAt: (ticket.replies.length > 0
                    ? ticket.replies.reduce(
                        (latest, reply) => (reply.createdAt > latest ? reply.createdAt : latest),
                        ticket.replies[0].createdAt,
                    )
                    : ticket.updatedAt
                ).toISOString(),
                createdAt: ticket.createdAt.toISOString(),
                resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
            }))
            // Worst first: unresolved before settled, then urgency, then oldest.
            .sort(
                (a, b) =>
                    Number(this.isUnresolved(b.status)) - Number(this.isUnresolved(a.status)) ||
                    (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9) ||
                    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
    }

    async getStats(): Promise<SupportStats> {
        const tickets = await this.prisma.supportTicket.findMany({
            select: {
                status: true,
                priority: true,
                createdAt: true,
                firstRespondedAt: true,
                resolvedAt: true,
            },
        });

        const countStatus = (status: string) =>
            tickets.filter((ticket) => ticket.status === status).length;

        const unresolved = tickets.filter((ticket) => this.isUnresolved(ticket.status));
        const answered = tickets.filter((ticket) => ticket.firstRespondedAt !== null);
        const weekAgo = new Date(Date.now() - 7 * DAY_MS);

        const avgFirstResponseHours =
            answered.length > 0
                ? this.round(
                    answered.reduce(
                        (sum, ticket) =>
                            sum +
                            (ticket.firstRespondedAt!.getTime() - ticket.createdAt.getTime()) /
                            (60 * 60 * 1000),
                        0,
                    ) / answered.length,
                    1,
                )
                : null;

        return {
            open: countStatus('OPEN'),
            pending: countStatus('PENDING'),
            resolved: countStatus('RESOLVED'),
            closed: countStatus('CLOSED'),
            unresolved: unresolved.length,
            urgentUnresolved: unresolved.filter((ticket) => ticket.priority === 'URGENT').length,
            awaitingFirstReply: unresolved.filter((ticket) => ticket.firstRespondedAt === null)
                .length,
            avgFirstResponseHours,
            resolvedLast7Days: tickets.filter(
                (ticket) => ticket.resolvedAt !== null && ticket.resolvedAt >= weekAgo,
            ).length,
        };
    }

    async getTicket(id: string) {
        const ticket = await this.prisma.supportTicket.findUnique({
            where: { id },
            include: {
                shop: { select: { name: true, slug: true } },
                replies: { orderBy: { createdAt: 'asc' } },
            },
        });

        if (!ticket) {
            throw new NotFoundException('Ticket not found');
        }

        return {
            ...ticket,
            shopName: ticket.shop?.name ?? 'Unlinked',
        };
    }

    async createTicket(dto: CreateTicketDto, createdById?: string) {
        return this.prisma.supportTicket.create({
            data: {
                subject: dto.subject,
                body: dto.body,
                category: dto.category ?? 'GENERAL',
                priority: (dto.priority ?? 'NORMAL') as TicketPriorityValue,
                shopId: dto.shopId ?? null,
                contactEmail: dto.contactEmail ?? null,
                createdById: createdById ?? null,
            },
        });
    }

    /**
     * Appends a reply. A public reply from the platform team stamps
     * firstRespondedAt once and moves the ticket to PENDING (waiting on the cafe);
     * an internal note does neither, so response-time reporting stays honest.
     */
    async replyToTicket(
        ticketId: string,
        dto: ReplyToTicketDto,
        author: { userId?: string; role?: string },
    ) {
        const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });

        if (!ticket) {
            throw new NotFoundException('Ticket not found');
        }

        const isInternal = dto.isInternal === true;

        return this.prisma.$transaction(async (tx) => {
            const reply = await tx.supportTicketReply.create({
                data: {
                    ticketId,
                    body: dto.body,
                    isInternal,
                    authorId: author.userId ?? null,
                    authorRole: author.role ?? 'SUPER_ADMIN',
                },
            });

            if (!isInternal) {
                await tx.supportTicket.update({
                    where: { id: ticketId },
                    data: {
                        firstRespondedAt: ticket.firstRespondedAt ?? new Date(),
                        // Closed tickets are not reopened by a reply.
                        status: this.isUnresolved(ticket.status) ? 'PENDING' : ticket.status,
                    },
                });
            }

            return reply;
        });
    }

    async updateTicket(id: string, dto: UpdateTicketDto) {
        const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });

        if (!ticket) {
            throw new NotFoundException('Ticket not found');
        }
        if (dto.status === undefined && dto.priority === undefined) {
            throw new BadRequestException('Nothing to update');
        }

        const data: Record<string, unknown> = {};

        if (dto.priority !== undefined) {
            data.priority = dto.priority;
        }

        if (dto.status !== undefined) {
            data.status = dto.status;
            // Stamp resolvedAt on the way into RESOLVED/CLOSED, clear it on reopen.
            const settling = dto.status === 'RESOLVED' || dto.status === 'CLOSED';
            if (settling) {
                data.resolvedAt = ticket.resolvedAt ?? new Date();
            } else {
                data.resolvedAt = null;
            }
        }

        return this.prisma.supportTicket.update({ where: { id }, data });
    }

    private isUnresolved(status: string): boolean {
        return (UNRESOLVED_STATUSES as readonly string[]).includes(status);
    }

    private assertOneOf(value: string, allowed: readonly string[], field: string) {
        if (!allowed.includes(value)) {
            throw new BadRequestException(
                `Invalid ${field} "${value}". Expected one of: ${allowed.join(', ')}`,
            );
        }
    }

    private round(value: number, decimals = 2): number {
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    }
}

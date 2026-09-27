import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SupportService } from './support.service';
import { PrismaService } from '../prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type Reply = {
    id: string;
    ticketId: string;
    authorId: string | null;
    authorRole: string;
    body: string;
    isInternal: boolean;
    createdAt: Date;
};

type Ticket = {
    id: string;
    shopId: string | null;
    subject: string;
    body: string;
    category: string;
    priority: string;
    status: string;
    createdById: string | null;
    contactEmail: string | null;
    firstRespondedAt: Date | null;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    shop: { name: string; slug: string } | null;
};

let seq = 0;

function ticket(overrides: Partial<Ticket> = {}): Ticket {
    seq++;
    return {
        id: `t-${seq}`,
        shopId: 'shop-1',
        subject: `Ticket ${seq}`,
        body: 'Something is wrong',
        category: 'GENERAL',
        priority: 'NORMAL',
        status: 'OPEN',
        createdById: null,
        contactEmail: null,
        firstRespondedAt: null,
        resolvedAt: null,
        createdAt: new Date(Date.now() - DAY_MS),
        updatedAt: new Date(Date.now() - DAY_MS),
        shop: { name: 'Cafe One', slug: 'cafe-one' },
        ...overrides,
    };
}

function buildPrismaStub(tickets: Ticket[], replies: Reply[] = []) {
    const matches = (item: Ticket, where: any = {}) =>
        (where.status === undefined || item.status === where.status) &&
        (where.priority === undefined || item.priority === where.priority);

    const withReplies = (item: Ticket) => ({
        ...item,
        replies: replies.filter((reply) => reply.ticketId === item.id),
    });

    const api = {
        supportTicket: {
            findMany: jest.fn(async ({ where }: any = {}) =>
                tickets.filter((item) => matches(item, where)).map(withReplies),
            ),
            findUnique: jest.fn(async ({ where }: any) => {
                const found = tickets.find((item) => item.id === where.id);
                return found ? withReplies(found) : null;
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const found = tickets.find((item) => item.id === where.id);
                if (!found) throw new Error('missing ticket');
                Object.assign(found, data);
                return found;
            }),
            create: jest.fn(async ({ data }: any) => {
                const created = ticket({ ...data, shop: null });
                tickets.push(created);
                return created;
            }),
        },
        supportTicketReply: {
            create: jest.fn(async ({ data }: any) => {
                const created: Reply = {
                    id: `r-${replies.length + 1}`,
                    createdAt: new Date(),
                    authorId: null,
                    authorRole: 'SUPER_ADMIN',
                    isInternal: false,
                    ...data,
                };
                replies.push(created);
                return created;
            }),
        },
    };

    return {
        ...api,
        $transaction: jest.fn(async (fn: any) => fn(api)),
    } as unknown as PrismaService;
}

describe('SupportService.listTickets', () => {
    it('puts unresolved tickets first, then urgency, then oldest', async () => {
        const now = Date.now();
        const tickets = [
            ticket({ id: 'resolved-urgent', status: 'RESOLVED', priority: 'URGENT' }),
            ticket({ id: 'open-normal', status: 'OPEN', priority: 'NORMAL' }),
            ticket({ id: 'open-urgent', status: 'OPEN', priority: 'URGENT' }),
            ticket({
                id: 'pending-urgent-older',
                status: 'PENDING',
                priority: 'URGENT',
                createdAt: new Date(now - 30 * DAY_MS),
            }),
        ];

        const result = await new SupportService(buildPrismaStub(tickets)).listTickets();

        expect(result.map((row) => row.id)).toEqual([
            'pending-urgent-older',
            'open-urgent',
            'open-normal',
            'resolved-urgent',
        ]);
    });

    it('flags unresolved tickets that have never been answered', async () => {
        const tickets = [
            ticket({ id: 'unanswered', status: 'OPEN', firstRespondedAt: null }),
            ticket({ id: 'answered', status: 'PENDING', firstRespondedAt: new Date() }),
            // Already settled, so not awaiting anything.
            ticket({ id: 'closed', status: 'CLOSED', firstRespondedAt: null }),
        ];

        const result = await new SupportService(buildPrismaStub(tickets)).listTickets();
        const flag = (id: string) => result.find((row) => row.id === id)!.awaitingFirstReply;

        expect(flag('unanswered')).toBe(true);
        expect(flag('answered')).toBe(false);
        expect(flag('closed')).toBe(false);
    });

    it('filters by status and priority', async () => {
        const tickets = [
            ticket({ id: 'a', status: 'OPEN', priority: 'HIGH' }),
            ticket({ id: 'b', status: 'RESOLVED', priority: 'HIGH' }),
        ];
        const service = new SupportService(buildPrismaStub(tickets));

        expect((await service.listTickets({ status: 'OPEN' })).map((r) => r.id)).toEqual(['a']);
    });

    it('rejects an unknown status or priority filter', async () => {
        const service = new SupportService(buildPrismaStub([]));

        await expect(service.listTickets({ status: 'BOGUS' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(service.listTickets({ priority: 'WHENEVER' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('labels a ticket with no shop rather than showing a blank', async () => {
        const result = await new SupportService(
            buildPrismaStub([ticket({ shopId: null, shop: null })]),
        ).listTickets();

        expect(result[0].shopName).toBe('Unlinked');
    });
});

describe('SupportService.getStats', () => {
    it('counts each state and the unresolved backlog', async () => {
        const tickets = [
            ticket({ status: 'OPEN', priority: 'URGENT' }),
            ticket({ status: 'OPEN', priority: 'LOW' }),
            ticket({ status: 'PENDING', priority: 'URGENT', firstRespondedAt: new Date() }),
            ticket({ status: 'RESOLVED', resolvedAt: new Date() }),
            ticket({ status: 'CLOSED', resolvedAt: new Date(Date.now() - 30 * DAY_MS) }),
        ];

        const stats = await new SupportService(buildPrismaStub(tickets)).getStats();

        expect(stats).toMatchObject({
            open: 2,
            pending: 1,
            resolved: 1,
            closed: 1,
            unresolved: 3,
            urgentUnresolved: 2,
            awaitingFirstReply: 2,
            // Only the RESOLVED one landed inside the window.
            resolvedLast7Days: 1,
        });
    });

    it('averages first response time in hours', async () => {
        const created = new Date(Date.now() - 10 * HOUR_MS);
        const tickets = [
            ticket({
                status: 'PENDING',
                createdAt: created,
                firstRespondedAt: new Date(created.getTime() + 2 * HOUR_MS),
            }),
            ticket({
                status: 'PENDING',
                createdAt: created,
                firstRespondedAt: new Date(created.getTime() + 4 * HOUR_MS),
            }),
            // Never answered, so it must not drag the average down.
            ticket({ status: 'OPEN', firstRespondedAt: null }),
        ];

        const stats = await new SupportService(buildPrismaStub(tickets)).getStats();

        expect(stats.avgFirstResponseHours).toBe(3);
    });

    it('reports null response time when nothing has been answered', async () => {
        const stats = await new SupportService(
            buildPrismaStub([ticket({ firstRespondedAt: null })]),
        ).getStats();

        expect(stats.avgFirstResponseHours).toBeNull();
    });

    it('handles an empty inbox', async () => {
        const stats = await new SupportService(buildPrismaStub([])).getStats();

        expect(stats).toMatchObject({ open: 0, unresolved: 0, avgFirstResponseHours: null });
    });
});

describe('SupportService.replyToTicket', () => {
    it('stamps the first response and moves the ticket to pending', async () => {
        const tickets = [ticket({ id: 't1', status: 'OPEN', firstRespondedAt: null })];
        const service = new SupportService(buildPrismaStub(tickets));

        await service.replyToTicket('t1', { body: 'Looking into it' }, { userId: 'u1' });

        expect(tickets[0].firstRespondedAt).toBeInstanceOf(Date);
        expect(tickets[0].status).toBe('PENDING');
    });

    it('keeps the original first-response timestamp on later replies', async () => {
        const original = new Date(Date.now() - 5 * HOUR_MS);
        const tickets = [ticket({ id: 't1', status: 'PENDING', firstRespondedAt: original })];
        const service = new SupportService(buildPrismaStub(tickets));

        await service.replyToTicket('t1', { body: 'Following up' }, {});

        expect(tickets[0].firstRespondedAt).toEqual(original);
    });

    it('does not let an internal note count as a response', async () => {
        const tickets = [ticket({ id: 't1', status: 'OPEN', firstRespondedAt: null })];
        const service = new SupportService(buildPrismaStub(tickets));

        await service.replyToTicket('t1', { body: 'Suspect billing', isInternal: true }, {});

        // An internal note must not start the response clock or nudge the status.
        expect(tickets[0].firstRespondedAt).toBeNull();
        expect(tickets[0].status).toBe('OPEN');
    });

    it('does not reopen a closed ticket', async () => {
        const tickets = [ticket({ id: 't1', status: 'CLOSED', firstRespondedAt: new Date() })];
        const service = new SupportService(buildPrismaStub(tickets));

        await service.replyToTicket('t1', { body: 'One more thing' }, {});

        expect(tickets[0].status).toBe('CLOSED');
    });

    it('rejects a reply to an unknown ticket', async () => {
        const service = new SupportService(buildPrismaStub([]));

        await expect(service.replyToTicket('nope', { body: 'hi' }, {})).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe('SupportService.updateTicket', () => {
    it('stamps resolvedAt when a ticket is resolved', async () => {
        const tickets = [ticket({ id: 't1', status: 'OPEN', resolvedAt: null })];
        const service = new SupportService(buildPrismaStub(tickets));

        await service.updateTicket('t1', { status: 'RESOLVED' });

        expect(tickets[0].status).toBe('RESOLVED');
        expect(tickets[0].resolvedAt).toBeInstanceOf(Date);
    });

    it('clears resolvedAt when a ticket is reopened', async () => {
        const tickets = [
            ticket({ id: 't1', status: 'RESOLVED', resolvedAt: new Date(Date.now() - DAY_MS) }),
        ];
        const service = new SupportService(buildPrismaStub(tickets));

        await service.updateTicket('t1', { status: 'OPEN' });

        expect(tickets[0].status).toBe('OPEN');
        expect(tickets[0].resolvedAt).toBeNull();
    });

    it('changes priority without touching status or resolvedAt', async () => {
        const tickets = [ticket({ id: 't1', status: 'OPEN', priority: 'LOW', resolvedAt: null })];
        const service = new SupportService(buildPrismaStub(tickets));

        await service.updateTicket('t1', { priority: 'URGENT' });

        expect(tickets[0].priority).toBe('URGENT');
        expect(tickets[0].status).toBe('OPEN');
        expect(tickets[0].resolvedAt).toBeNull();
    });

    it('rejects an empty update', async () => {
        const service = new SupportService(buildPrismaStub([ticket({ id: 't1' })]));

        await expect(service.updateTicket('t1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown ticket', async () => {
        const service = new SupportService(buildPrismaStub([]));

        await expect(
            service.updateTicket('nope', { status: 'CLOSED' }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('SupportService.getTicket', () => {
    it('rejects an unknown ticket', async () => {
        const service = new SupportService(buildPrismaStub([]));

        await expect(service.getTicket('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
});

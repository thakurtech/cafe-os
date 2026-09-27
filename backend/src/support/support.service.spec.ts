import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CafeSupportService } from './support.service';
import { PrismaService } from '../prisma.service';

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
    contactEmail: string | null;
    createdById: string | null;
    firstRespondedAt: Date | null;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

function buildPrismaStub(options: {
    users?: Record<string, { shopId: string | null }>;
    tickets?: Ticket[];
    replies?: Reply[];
}) {
    const { users = {}, tickets = [], replies = [] } = options;

    const api = {
        user: {
            findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null),
        },
        supportTicket: {
            findUnique: jest.fn(async ({ where, include }: any) => {
                const found = tickets.find((item) => item.id === where.id);
                if (!found) return null;
                if (!include?.replies) return found;
                const onlyPublic = include.replies.where?.isInternal === false;
                return {
                    ...found,
                    replies: replies.filter(
                        (reply) =>
                            reply.ticketId === found.id && (!onlyPublic || !reply.isInternal),
                    ),
                };
            }),
            findMany: jest.fn(async ({ where, include }: any) => {
                const onlyPublic = include?.replies?.where?.isInternal === false;
                return tickets
                    .filter((item) => item.shopId === where.shopId)
                    .map((item) => ({
                        ...item,
                        replies: replies.filter(
                            (reply) =>
                                reply.ticketId === item.id && (!onlyPublic || !reply.isInternal),
                        ),
                    }));
            }),
            create: jest.fn(async ({ data }: any) => {
                const created: Ticket = {
                    id: `t-${tickets.length + 1}`,
                    firstRespondedAt: null,
                    resolvedAt: null,
                    status: 'OPEN',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    ...data,
                };
                tickets.push(created);
                return created;
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const found = tickets.find((item) => item.id === where.id);
                if (!found) throw new Error('missing');
                Object.assign(found, data);
                return found;
            }),
        },
        supportTicketReply: {
            create: jest.fn(async ({ data }: any) => {
                const created: Reply = {
                    id: `r-${replies.length + 1}`,
                    createdAt: new Date(),
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

function ticket(overrides: Partial<Ticket> = {}): Ticket {
    return {
        id: 't-1',
        shopId: 'shop-a',
        subject: 'Printer offline',
        body: 'KOT printer stopped',
        category: 'TECHNICAL',
        priority: 'NORMAL',
        status: 'OPEN',
        contactEmail: null,
        createdById: 'user-a',
        firstRespondedAt: null,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

describe('CafeSupportService.createTicket', () => {
    it('files the ticket against the shop resolved from the caller', async () => {
        const tickets: Ticket[] = [];
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'user-a': { shopId: 'shop-a' } }, tickets }),
        );

        const created = await service.createTicket(
            { subject: 'Card machine down', body: 'Cannot take payments' },
            'user-a',
        );

        expect(created.shopId).toBe('shop-a');
        expect(created.createdById).toBe('user-a');
        expect(created.status).toBe('OPEN');
    });

    it('refuses a user not linked to any cafe', async () => {
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'orphan': { shopId: null } } }),
        );

        await expect(
            service.createTicket({ subject: 'Hello there', body: 'hi' }, 'orphan'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an unknown user', async () => {
        const service = new CafeSupportService(buildPrismaStub({ users: {} }));

        await expect(
            service.createTicket({ subject: 'Hello there', body: 'hi' }, 'ghost'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('CafeSupportService.listMyTickets', () => {
    it('returns only the caller shop tickets', async () => {
        const tickets = [
            ticket({ id: 'mine', shopId: 'shop-a' }),
            ticket({ id: 'theirs', shopId: 'shop-b' }),
        ];
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'user-a': { shopId: 'shop-a' } }, tickets }),
        );

        const rows = await service.listMyTickets('user-a');

        expect(rows.map((row) => row.id)).toEqual(['mine']);
    });

    it('never counts internal notes in the reply count', async () => {
        const tickets = [ticket({ id: 't1', shopId: 'shop-a' })];
        const replies = [
            {
                id: 'r1',
                ticketId: 't1',
                authorId: null,
                authorRole: 'SUPER_ADMIN',
                body: 'Public answer',
                isInternal: false,
                createdAt: new Date(),
            },
            {
                id: 'r2',
                ticketId: 't1',
                authorId: null,
                authorRole: 'SUPER_ADMIN',
                body: 'Internal: suspect their router',
                isInternal: true,
                createdAt: new Date(),
            },
        ];
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'user-a': { shopId: 'shop-a' } }, tickets, replies }),
        );

        const rows = await service.listMyTickets('user-a');

        expect(rows[0].replyCount).toBe(1);
    });
});

describe('CafeSupportService.getMyTicket', () => {
    it('hides another shop ticket behind a not-found', async () => {
        const tickets = [ticket({ id: 'theirs', shopId: 'shop-b' })];
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'user-a': { shopId: 'shop-a' } }, tickets }),
        );

        // Must not leak that the ticket exists at all.
        await expect(service.getMyTicket('theirs', 'user-a')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('excludes internal notes from the thread', async () => {
        const tickets = [ticket({ id: 't1', shopId: 'shop-a' })];
        const replies = [
            {
                id: 'r1',
                ticketId: 't1',
                authorId: null,
                authorRole: 'SUPER_ADMIN',
                body: 'Public',
                isInternal: false,
                createdAt: new Date(),
            },
            {
                id: 'r2',
                ticketId: 't1',
                authorId: null,
                authorRole: 'SUPER_ADMIN',
                body: 'Secret',
                isInternal: true,
                createdAt: new Date(),
            },
        ];
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'user-a': { shopId: 'shop-a' } }, tickets, replies }),
        );

        const result = await service.getMyTicket('t1', 'user-a');

        expect(result.replies.map((r) => r.body)).toEqual(['Public']);
    });
});

describe('CafeSupportService.replyToMyTicket', () => {
    it('reopens a resolved ticket and clears the resolved timestamp', async () => {
        const tickets = [
            ticket({ id: 't1', status: 'RESOLVED', resolvedAt: new Date() }),
        ];
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'user-a': { shopId: 'shop-a' } }, tickets }),
        );

        await service.replyToMyTicket('t1', { body: 'Still broken' }, 'user-a');

        expect(tickets[0].status).toBe('OPEN');
        expect(tickets[0].resolvedAt).toBeNull();
    });

    it('does not stamp the platform first-response time', async () => {
        const tickets = [ticket({ id: 't1', status: 'OPEN', firstRespondedAt: null })];
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'user-a': { shopId: 'shop-a' } }, tickets }),
        );

        await service.replyToMyTicket('t1', { body: 'Any update?' }, 'user-a');

        // A cafe replying to itself is not the platform responding.
        expect(tickets[0].firstRespondedAt).toBeNull();
    });

    it('forces the reply to be public even if isInternal is sent', async () => {
        const tickets = [ticket({ id: 't1' })];
        const replies: Reply[] = [];
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'user-a': { shopId: 'shop-a' } }, tickets, replies }),
        );

        await service.replyToMyTicket('t1', { body: 'Sneaky', isInternal: true }, 'user-a');

        expect(replies[0].isInternal) .toBe(false);
        expect(replies[0].authorRole).toBe('CAFE');
    });

    it('leaves a closed ticket closed', async () => {
        const tickets = [ticket({ id: 't1', status: 'CLOSED' })];
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'user-a': { shopId: 'shop-a' } }, tickets }),
        );

        await service.replyToMyTicket('t1', { body: 'One more thing' }, 'user-a');

        expect(tickets[0].status).toBe('CLOSED');
    });

    it('refuses to reply to another shop ticket', async () => {
        const tickets = [ticket({ id: 'theirs', shopId: 'shop-b' })];
        const service = new CafeSupportService(
            buildPrismaStub({ users: { 'user-a': { shopId: 'shop-a' } }, tickets }),
        );

        await expect(
            service.replyToMyTicket('theirs', { body: 'hello' }, 'user-a'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from '../prisma.service';
import { OrdersGateway } from './orders.gateway';

@Injectable()
export class OrdersService {
    constructor(
        private prisma: PrismaService,
        private ordersGateway: OrdersGateway,
    ) { }

    async create(shopId: string, createOrderDto: CreateOrderDto) {
        const { items, customerId, source, paymentMethod, discountCode, notes, tableNumber } = createOrderDto;

        // 1. Calculate Total & Verify Items
        let totalAmount = 0;
        const orderItemsData: { menuItemId: string; quantity: number; price: number }[] = [];

        for (const item of items) {
            const menuItem = await this.prisma.menuItem.findUnique({
                where: { id: item.menuItemId },
            });

            if (!menuItem) continue;

            const itemTotal = menuItem.price * item.quantity;
            totalAmount += itemTotal;

            orderItemsData.push({
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                price: menuItem.price,
            });
        }

        // 2. Apply discount if code provided
        let discountAmount = 0;
        if (discountCode) {
            const discount = await this.prisma.discount.findFirst({
                where: {
                    shopId,
                    code: discountCode,
                    isActive: true,
                },
            });

            if (discount) {
                if (discount.type === 'PERCENTAGE') {
                    discountAmount = (totalAmount * discount.value) / 100;
                    if (discount.maxDiscount) {
                        discountAmount = Math.min(discountAmount, discount.maxDiscount);
                    }
                } else if (discount.type === 'FIXED') {
                    discountAmount = discount.value;
                }

                // Update usage count
                await this.prisma.discount.update({
                    where: { id: discount.id },
                    data: { usageCount: { increment: 1 } },
                });
            }
        }

        const finalAmount = Math.max(0, totalAmount - discountAmount);

        // 3. Create Order
        const order = await this.prisma.order.create({
            data: {
                shopId,
                customerId,
                source: source || 'POS',
                totalAmount: finalAmount,
                shortId: `#${Math.floor(1000 + Math.random() * 9000)}`,
                status: 'PENDING',
                paymentMethod: paymentMethod || 'CASH',
                paymentStatus: 'PAID', // For POS, assume paid immediately
                paidAt: new Date(),
                discountCode,
                discountAmount,
                tableNumber,
                notes,
                items: {
                    create: orderItemsData,
                },
            },
            include: {
                items: {
                    include: { menuItem: true },
                },
            },
        });

        // 4. Emit real-time event to kitchen
        this.ordersGateway.emitNewOrder(shopId, order);
        this.ordersGateway.emitSoundAlert(shopId, 'newOrder');

        return order;
    }

    async getKitchenOrders(shopId: string) {
        return this.prisma.order.findMany({
            where: {
                shopId,
                status: { in: ['PENDING', 'PREPARING', 'READY'] },
            },
            include: {
                items: {
                    include: { menuItem: true }
                }
            },
            orderBy: { createdAt: 'asc' }
        });
    }

    async updateStatus(orderId: string, status: any) {
        const order = await this.prisma.order.update({
            where: { id: orderId },
            data: { status },
            include: {
                items: { include: { menuItem: true } },
            },
        });

        // Emit status change event
        this.ordersGateway.emitOrderStatusChange(order.shopId, orderId, status, order);

        // If completed, emit completion event
        if (status === 'COMPLETED') {
            this.ordersGateway.emitOrderCompleted(order.shopId, orderId);
        }

        return order;
    }

    findAll(shopId: string) {
        return this.prisma.order.findMany({
            where: { shopId },
            include: {
                items: {
                    include: { menuItem: true },
                },
                customer: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const order = await this.prisma.order.findUnique({
            where: { id },
            include: {
                items: {
                    include: { menuItem: true },
                },
            },
        });

        // findUnique returns null for a missing row, which Nest serialises as an
        // empty 200. An unknown order id is a 404.
        if (!order) {
            throw new NotFoundException('Order not found');
        }

        return order;
    }

    update(id: string, updateOrderDto: UpdateOrderDto) {
        return this.prisma.order.update({
            where: { id },
            data: updateOrderDto as any,
        });
    }

    remove(id: string) {
        return this.prisma.order.delete({
            where: { id },
        });
    }

    // Cancel order with reason
    async cancelOrder(orderId: string, reason: string, cancelledBy?: string) {
        const order = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'CANCELLED',
                notes: `Cancelled: ${reason}${cancelledBy ? ` by ${cancelledBy}` : ''}`,
            },
            include: {
                items: { include: { menuItem: true } },
            },
        });

        // Emit cancellation event
        this.ordersGateway.emitOrderStatusChange(order.shopId, orderId, 'CANCELLED', order);
        this.ordersGateway.emitOrderCompleted(order.shopId, orderId);

        return order;
    }

    // Hold/park order for dine-in
    async holdOrder(orderId: string, tableNumber?: string) {
        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'HELD',
                tableNumber,
            },
            include: {
                items: { include: { menuItem: true } },
            },
        });
    }

    // Resume held order
    async resumeOrder(orderId: string) {
        const order = await this.prisma.order.update({
            where: { id: orderId },
            data: { status: 'PENDING' },
            include: {
                items: { include: { menuItem: true } },
            },
        });

        // Emit as new order
        this.ordersGateway.emitNewOrder(order.shopId, order);
        this.ordersGateway.emitSoundAlert(order.shopId, 'newOrder');

        return order;
    }

    // Get held orders for a shop
    async getHeldOrders(shopId: string) {
        return this.prisma.order.findMany({
            where: {
                shopId,
                status: 'HELD',
            },
            include: {
                items: { include: { menuItem: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    // Modify order items (only for PENDING or HELD orders)
    async modifyOrderItems(orderId: string, items: Array<{ menuItemId: string; quantity: number }>) {
        // Get current order
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (!['PENDING', 'HELD'].includes(order.status)) {
            throw new BadRequestException('Order cannot be modified after it starts preparing');
        }

        // Delete existing items
        await this.prisma.orderItem.deleteMany({
            where: { orderId },
        });

        // Calculate new total and create new items
        let totalAmount = 0;
        const orderItemsData: { menuItemId: string; quantity: number; price: number }[] = [];

        for (const item of items) {
            const menuItem = await this.prisma.menuItem.findUnique({
                where: { id: item.menuItemId },
            });

            if (!menuItem) continue;

            const itemTotal = menuItem.price * item.quantity;
            totalAmount += itemTotal;

            orderItemsData.push({
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                price: menuItem.price,
            });
        }

        // Update order with new items and total
        const updatedOrder = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                totalAmount,
                items: {
                    create: orderItemsData,
                },
            },
            include: {
                items: { include: { menuItem: true } },
            },
        });

        // Emit update event
        this.ordersGateway.emitOrderStatusChange(order.shopId, orderId, order.status, updatedOrder);

        return updatedOrder;
    }

    async createRefund(orderId: string, amount: number, reason: string, refundedBy: string, type: string) {
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Order not found');

        const refund = await this.prisma.refund.create({
            data: {
                orderId,
                amount,
                reason,
                refundedBy,
                type: type || 'FULL',
            }
        });

        if (type === 'FULL') {
            await this.prisma.order.update({
                where: { id: orderId },
                data: { status: 'CANCELLED', paymentStatus: 'REFUNDED' }
            });
        }

        return refund;
    }

    async getRefunds(shopId: string) {
        return this.prisma.refund.findMany({
            where: { order: { shopId } },
            include: { order: true },
            orderBy: { createdAt: 'desc' }
        });
    }
}

import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('orders')
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Post()
    create(@Body() createOrderDto: CreateOrderDto) {
        return this.ordersService.create(createOrderDto.shopId, createOrderDto);
    }

    @Get('kitchen')
    getKitchenOrders(@Query('shopId') shopId: string) {
        return this.ordersService.getKitchenOrders(shopId);
    }

    // PATCH is the correct verb for a status change and is what the frontend
    // sends. POST is kept so existing callers do not break.
    @Patch(':id/status')
    @UseGuards(JwtAuthGuard)
    updateStatusPatch(@Param('id') id: string, @Body('status') status: string) {
        return this.ordersService.updateStatus(id, status);
    }

    @Post(':id/status')
    @UseGuards(JwtAuthGuard)
    updateStatus(@Param('id') id: string, @Body('status') status: string) {
        return this.ordersService.updateStatus(id, status);
    }

    // Cancel order with reason
    @Post(':id/cancel')
    @UseGuards(JwtAuthGuard)
    cancelOrder(
        @Param('id') id: string,
        @Body() data: { reason: string; cancelledBy?: string }
    ) {
        return this.ordersService.cancelOrder(id, data.reason, data.cancelledBy);
    }

    // Hold/park order for dine-in
    @Post(':id/hold')
    @UseGuards(JwtAuthGuard)
    holdOrder(@Param('id') id: string, @Body() data: { tableNumber?: string }) {
        return this.ordersService.holdOrder(id, data.tableNumber);
    }

    // Resume held order
    @Post(':id/resume')
    @UseGuards(JwtAuthGuard)
    resumeOrder(@Param('id') id: string) {
        return this.ordersService.resumeOrder(id);
    }

    // Get held orders for a shop
    @Get('held')
    @UseGuards(JwtAuthGuard)
    getHeldOrders(@Query('shopId') shopId: string) {
        return this.ordersService.getHeldOrders(shopId);
    }

    // Modify order items (before preparing)
    @Patch(':id/items')
    @UseGuards(JwtAuthGuard)
    modifyOrderItems(
        @Param('id') id: string,
        @Body() data: { items: Array<{ menuItemId: string; quantity: number }> }
    ) {
        return this.ordersService.modifyOrderItems(id, data.items);
    }

    // Must stay above @Get(':id'), which would otherwise match "refunds"
    // as an order id and route this to findOne.
    @Get('refunds')
    @UseGuards(JwtAuthGuard)
    getRefunds(@Query('shopId') shopId: string) {
        return this.ordersService.getRefunds(shopId);
    }

    @Get()
    findAll(@Query('shopId') shopId: string) {
        return this.ordersService.findAll(shopId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.ordersService.findOne(id);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard)
    update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
        return this.ordersService.update(id, updateOrderDto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    remove(@Param('id') id: string) {
        return this.ordersService.remove(id);
    }

    @Post(':id/refund')
    @UseGuards(JwtAuthGuard)
    createRefund(
        @Param('id') id: string,
        @Body() data: { amount: number; reason: string; type: string; refundedBy?: string }
    ) {
        return this.ordersService.createRefund(id, data.amount, data.reason, data.refundedBy || 'system', data.type);
    }
}


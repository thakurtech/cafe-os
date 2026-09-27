import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Request,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common';
import { CafeSupportService } from './support.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CafeReplyDto, CreateCafeTicketDto } from './dto/cafe-ticket.dto';

// The app registers no global ValidationPipe, so it is applied per route.
const bodyPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
});

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
    constructor(private readonly supportService: CafeSupportService) { }

    @Post()
    createTicket(@Body(bodyPipe) dto: CreateCafeTicketDto, @Request() req) {
        return this.supportService.createTicket(dto, req.user.userId);
    }

    @Get()
    listMyTickets(@Request() req) {
        return this.supportService.listMyTickets(req.user.userId);
    }

    @Get(':id')
    getMyTicket(@Param('id') id: string, @Request() req) {
        return this.supportService.getMyTicket(id, req.user.userId);
    }

    @Post(':id/replies')
    replyToMyTicket(
        @Param('id') id: string,
        @Body(bodyPipe) dto: CafeReplyDto,
        @Request() req,
    ) {
        return this.supportService.replyToMyTicket(id, dto, req.user.userId);
    }
}

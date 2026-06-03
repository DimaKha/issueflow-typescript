import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // Static GET routes before /:ticketId — prevents NestJS shadowing
  @Get('deleted')
  @Roles('ADMIN')
  findDeleted(@Query() query: QueryTicketsDto) {
    return this.ticketsService.findDeleted(query);
  }

  @Get('export')
  export(@Query() query: QueryTicketsDto) {
    // Stub — fully implemented in M8
    return [];
  }

  @Get()
  findAll(@Query() query: QueryTicketsDto) {
    return this.ticketsService.findAll(query);
  }

  @Get(':ticketId')
  findOne(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.findOne(ticketId);
  }

  // Static POST routes before /:ticketId/restore
  @Post('import')
  @HttpCode(HttpStatus.OK)
  import() {
    // Stub — fully implemented in M8
    return { created: 0, failed: 0, errors: [] };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Body() dto: CreateTicketDto) {
    return this.ticketsService.create(dto);
  }

  @Patch(':ticketId')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.ticketsService.update(ticketId, dto);
  }

  @Delete(':ticketId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.remove(ticketId);
  }

  @Post(':ticketId/restore')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  restore(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.restore(ticketId);
  }
}

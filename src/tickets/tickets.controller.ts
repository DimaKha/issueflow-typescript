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
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { ImportTicketsDto } from './dto/import-tickets.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
  async export(@Query() query: QueryTicketsDto, @Res() res: Response) {
    const csv = await this.ticketsService.exportCsv(query.projectId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tickets-${query.projectId}.csv"`,
    );
    res.send(csv);
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
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  import(
    @Body() dto: ImportTicketsDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('No CSV file uploaded');
    return this.ticketsService.importCsv(dto.projectId, file.buffer, user?.id ?? null);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.create(dto, user?.id ?? null);
  }

  @Patch(':ticketId')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.update(ticketId, dto, user?.id ?? null);
  }

  @Delete(':ticketId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('ticketId', ParseIntPipe) ticketId: number, @CurrentUser() user: any) {
    return this.ticketsService.remove(ticketId, user?.id ?? null);
  }

  @Post(':ticketId/restore')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  restore(@Param('ticketId', ParseIntPipe) ticketId: number, @CurrentUser() user: any) {
    return this.ticketsService.restore(ticketId, user?.id ?? null);
  }
}

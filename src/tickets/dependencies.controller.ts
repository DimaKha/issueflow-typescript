import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DependenciesService } from './dependencies.service';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('tickets/:ticketId/dependencies')
export class DependenciesController {
  constructor(private readonly dependenciesService: DependenciesService) {}

  @Get()
  getDependencies(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.dependenciesService.getDependencies(ticketId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  addDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: AddDependencyDto,
    @CurrentUser() user: any,
  ) {
    return this.dependenciesService.addDependency(ticketId, dto.blockedBy, user?.id ?? null);
  }

  @Delete(':blockerId')
  @HttpCode(HttpStatus.OK)
  removeDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('blockerId', ParseIntPipe) blockerId: number,
    @CurrentUser() user: any,
  ) {
    return this.dependenciesService.removeDependency(ticketId, blockerId, user?.id ?? null);
  }
}

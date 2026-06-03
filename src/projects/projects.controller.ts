import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // Static routes first — before /:projectId to avoid shadowing
  @Get('deleted')
  @Roles('ADMIN')
  findDeleted() {
    return this.projectsService.findDeleted();
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':projectId/workload')
  getWorkload(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.getWorkload(projectId);
  }

  @Get(':projectId')
  findOne(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.findOne(projectId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: any) {
    return this.projectsService.create(dto, user?.id ?? null);
  }

  @Patch(':projectId')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.update(projectId, dto, user?.id ?? null);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: any) {
    return this.projectsService.remove(projectId, user?.id ?? null);
  }

  @Post(':projectId/restore')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  restore(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: any) {
    return this.projectsService.restore(projectId, user?.id ?? null);
  }
}

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
    // Stub — fully implemented in M9
    return [];
  }

  @Get(':projectId')
  findOne(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.findOne(projectId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Patch(':projectId')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(projectId, dto);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.remove(projectId);
  }

  @Post(':projectId/restore')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  restore(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.restore(projectId);
  }
}

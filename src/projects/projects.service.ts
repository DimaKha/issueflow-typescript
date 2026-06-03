import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Project } from './project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly repo: Repository<Project>,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateProjectDto): Promise<Project> {
    await this.usersService.findOne(dto.ownerId);
    const project = this.repo.create(dto);
    return this.repo.save(project);
  }

  async findAll(): Promise<Project[]> {
    return this.repo.find();
  }

  async findDeleted(): Promise<Project[]> {
    return this.repo.find({ where: { deletedAt: Not(IsNull()) }, withDeleted: true });
  }

  async findOne(id: number): Promise<Project> {
    const project = await this.repo.findOne({ where: { id } });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async update(id: number, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne(id);
    if (dto.ownerId !== undefined) {
      await this.usersService.findOne(dto.ownerId);
    }
    Object.assign(project, dto);
    return this.repo.save(project);
  }

  async remove(id: number): Promise<void> {
    const project = await this.findOne(id);
    await this.repo.softRemove(project);
  }

  async restore(id: number): Promise<Project> {
    const project = await this.repo.findOne({ where: { id }, withDeleted: true });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    if (!project.deletedAt) throw new BadRequestException(`Project ${id} is not deleted`);
    await this.repo.restore(id);
    return this.repo.findOne({ where: { id } }) as Promise<Project>;
  }

  async findOneWithDeleted(id: number): Promise<Project | null> {
    return this.repo.findOne({ where: { id }, withDeleted: true });
  }
}

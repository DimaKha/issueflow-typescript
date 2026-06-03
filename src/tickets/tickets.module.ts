import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { Ticket } from './ticket.entity';
import { TicketDependency } from './ticket-dependency.entity';
import { DependenciesController } from './dependencies.controller';
import { DependenciesService } from './dependencies.service';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, TicketDependency]),
    ProjectsModule,
    UsersModule,
    AuditLogModule,
  ],
  controllers: [TicketsController, DependenciesController],
  providers: [TicketsService, DependenciesService],
  exports: [TicketsService],
})
export class TicketsModule {}

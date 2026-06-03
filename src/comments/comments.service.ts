import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Comment } from './comment.entity';
import { User } from '../users/user.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponse } from './dto/comment-response.dto';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly repo: Repository<Comment>,
    private readonly dataSource: DataSource,
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async resolveMentions(content: string): Promise<User[]> {
    const usernames = [...content.matchAll(/@(\w+)/g)].map((m) => m[1]);
    if (usernames.length === 0) return [];

    const found = await Promise.all(
      usernames.map((u) => this.usersService.findByUsername(u)),
    );

    const notFound = usernames.filter((_, i) => found[i] === null);
    if (notFound.length > 0) {
      throw new BadRequestException(
        `Unknown mentioned users: @${notFound.join(', @')}`,
      );
    }

    return found as User[];
  }

  private toResponse(comment: Comment): CommentResponse {
    return {
      ...comment,
      mentionedUsers: (comment.mentionedUsers ?? []).map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
      })),
    };
  }

  async create(ticketId: number, dto: CreateCommentDto, performedBy?: number | null): Promise<CommentResponse> {
    await this.ticketsService.findOne(ticketId);
    await this.usersService.findOne(dto.authorId);
    const mentionedUsers = await this.resolveMentions(dto.content);

    const comment = this.repo.create({
      ticketId,
      authorId: dto.authorId,
      content: dto.content,
      mentionedUsers,
    });
    const saved = await this.repo.save(comment);

    const reloaded = await this.repo.findOne({
      where: { id: saved.id },
      relations: ['mentionedUsers'],
    });
    const response = this.toResponse(reloaded!);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'CREATE',
        entityType: 'COMMENT',
        entityId: reloaded!.id,
        payload: { id: reloaded!.id, ticketId, authorId: dto.authorId, content: dto.content },
      });
    } catch { /* audit log failure must not break main operation */ }
    return response;
  }

  async findAll(ticketId: number): Promise<CommentResponse[]> {
    const comments = await this.repo.find({
      where: { ticketId },
      relations: ['mentionedUsers'],
    });
    return comments.map((c) => this.toResponse(c));
  }

  async update(
    ticketId: number,
    commentId: number,
    dto: UpdateCommentDto,
    performedBy?: number | null,
  ): Promise<CommentResponse> {
    let resolvedUsers: User[] = [];
    if (dto.content !== undefined) {
      resolvedUsers = await this.resolveMentions(dto.content);
    }

    let updatedComment: Comment | null = null;

    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(Comment, { where: { id: commentId } });
      if (!existing) throw new NotFoundException(`Comment ${commentId} not found`);
      if (existing.ticketId !== ticketId) {
        throw new NotFoundException(`Comment ${commentId} not found for ticket ${ticketId}`);
      }

      const contentUpdate: Partial<Comment> = {};
      if (dto.content !== undefined) contentUpdate.content = dto.content;

      const result = await manager.update(
        Comment,
        { id: commentId, version: dto.version },
        { ...contentUpdate, version: dto.version + 1 },
      );
      if (result.affected === 0) {
        const still = await manager.findOne(Comment, { where: { id: commentId } });
        if (!still) throw new NotFoundException(`Comment ${commentId} not found`);
        throw new ConflictException(
          'Concurrent modification detected — please refresh and retry',
        );
      }

      if (dto.content !== undefined) {
        const withRelations = await manager.findOne(Comment, {
          where: { id: commentId },
          relations: ['mentionedUsers'],
        });
        withRelations!.mentionedUsers = resolvedUsers;
        updatedComment = await manager.save(Comment, withRelations!);
      } else {
        updatedComment = await manager.findOne(Comment, {
          where: { id: commentId },
          relations: ['mentionedUsers'],
        });
      }
    });

    const response = this.toResponse(updatedComment!);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'UPDATE',
        entityType: 'COMMENT',
        entityId: commentId,
        payload: { id: commentId, ticketId, content: dto.content },
      });
    } catch { /* audit log failure must not break main operation */ }
    return response;
  }

  async remove(ticketId: number, commentId: number, performedBy?: number | null): Promise<void> {
    const comment = await this.repo.findOne({ where: { id: commentId } });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);
    if (comment.ticketId !== ticketId) {
      throw new NotFoundException(`Comment ${commentId} not found for ticket ${ticketId}`);
    }
    await this.repo.softRemove(comment);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'DELETE',
        entityType: 'COMMENT',
        entityId: commentId,
        payload: { id: commentId, ticketId },
      });
    } catch { /* audit log failure must not break main operation */ }
  }
}

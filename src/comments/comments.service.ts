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

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly repo: Repository<Comment>,
    private readonly dataSource: DataSource,
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
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

  async create(ticketId: number, dto: CreateCommentDto): Promise<CommentResponse> {
    // Validate ticket exists and is not soft-deleted
    await this.ticketsService.findOne(ticketId);
    // Validate author
    await this.usersService.findOne(dto.authorId);
    // Resolve @mentions
    const mentionedUsers = await this.resolveMentions(dto.content);

    const comment = this.repo.create({
      ticketId,
      authorId: dto.authorId,
      content: dto.content,
      mentionedUsers,
    });
    const saved = await this.repo.save(comment);

    // Reload with relations to ensure mentionedUsers are populated
    const reloaded = await this.repo.findOne({
      where: { id: saved.id },
      relations: ['mentionedUsers'],
    });
    return this.toResponse(reloaded!);
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
  ): Promise<CommentResponse> {
    // Resolve new mentions before the transaction (throws 400 for unknown usernames)
    let resolvedUsers: User[] = [];
    if (dto.content !== undefined) {
      resolvedUsers = await this.resolveMentions(dto.content);
    }

    let updatedComment: Comment | null = null;

    await this.dataSource.transaction(async (manager) => {
      // Verify comment exists and belongs to this ticket
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

      // Replace ManyToMany relation if content changed
      if (dto.content !== undefined) {
        const withRelations = await manager.findOne(Comment, {
          where: { id: commentId },
          relations: ['mentionedUsers'],
        });
        withRelations!.mentionedUsers = resolvedUsers;
        // save() returns the entity with mentionedUsers already populated (we set them above)
        updatedComment = await manager.save(Comment, withRelations!);
      } else {
        updatedComment = await manager.findOne(Comment, {
          where: { id: commentId },
          relations: ['mentionedUsers'],
        });
      }
    });

    return this.toResponse(updatedComment!);
  }

  async remove(ticketId: number, commentId: number): Promise<void> {
    const comment = await this.repo.findOne({ where: { id: commentId } });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);
    if (comment.ticketId !== ticketId) {
      throw new NotFoundException(`Comment ${commentId} not found for ticket ${ticketId}`);
    }
    await this.repo.softRemove(comment);
  }
}

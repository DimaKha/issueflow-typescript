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
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponse } from './dto/comment-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('tickets/:ticketId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  findAll(@Param('ticketId', ParseIntPipe) ticketId: number): Promise<CommentResponse[]> {
    return this.commentsService.findAll(ticketId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  create(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: any,
  ): Promise<CommentResponse> {
    return this.commentsService.create(ticketId, dto, user?.id ?? null);
  }

  @Patch(':commentId')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: any,
  ): Promise<CommentResponse> {
    return this.commentsService.update(ticketId, commentId, dto, user?.id ?? null);
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: any,
  ) {
    return this.commentsService.remove(ticketId, commentId, user?.id ?? null);
  }
}

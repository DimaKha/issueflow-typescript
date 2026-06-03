import {
  Controller,
  Post,
  Delete,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('tickets/:ticketId/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException(
        'No valid file uploaded. Allowed types: image/png, image/jpeg, application/pdf, text/plain. Max size: 10 MB.',
      );
    }
    return this.attachmentsService.upload(ticketId, file, user?.id ?? null);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @CurrentUser() user: any,
  ) {
    return this.attachmentsService.remove(ticketId, attachmentId, user?.id ?? null);
  }
}

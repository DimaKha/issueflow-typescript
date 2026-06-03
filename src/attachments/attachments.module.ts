import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { Attachment } from './attachment.entity';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { TicketsModule } from '../tickets/tickets.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf', 'text/plain'];

@Module({
  imports: [
    TypeOrmModule.forFeature([Attachment]),
    MulterModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        storage: diskStorage({
          destination: config.get<string>('UPLOAD_DEST', './uploads'),
          filename: (_req, file, cb) =>
            cb(null, `${randomUUID()}${extname(file.originalname)}`),
        }),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_req, file, cb) =>
          cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype)),
      }),
      inject: [ConfigService],
    }),
    TicketsModule,
    AuditLogModule,
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}

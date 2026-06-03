import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { unlink } from 'fs/promises';
import { Attachment } from './attachment.entity';
import { TicketsService } from '../tickets/tickets.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private readonly repo: Repository<Attachment>,
    private readonly ticketsService: TicketsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async upload(
    ticketId: number,
    file: Express.Multer.File,
    performedBy?: number | null,
  ): Promise<Attachment> {
    // Validate ticket exists and is not soft-deleted
    await this.ticketsService.findOne(ticketId);

    const attachment = this.repo.create({
      ticketId,
      filename: file.filename,
      originalName: file.originalname,
      contentType: file.mimetype,
      filePath: file.path,
      size: file.size,
    });

    const saved = await this.repo.save(attachment);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'UPLOAD_ATTACHMENT',
        entityType: 'TICKET',
        entityId: ticketId,
        payload: { attachmentId: saved.id, filename: saved.filename, originalName: saved.originalName, contentType: saved.contentType, size: saved.size },
      });
    } catch { /* audit log failure must not break main operation */ }

    return saved;
  }

  async remove(
    ticketId: number,
    attachmentId: number,
    performedBy?: number | null,
  ): Promise<void> {
    const attachment = await this.repo.findOne({ where: { id: attachmentId } });
    if (!attachment) {
      throw new NotFoundException(`Attachment ${attachmentId} not found`);
    }
    if (attachment.ticketId !== ticketId) {
      throw new NotFoundException(`Attachment ${attachmentId} not found for ticket ${ticketId}`);
    }

    // Remove physical file — ignore ENOENT if file was already deleted
    try {
      await unlink(attachment.filePath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`Failed to delete file ${attachment.filePath}:`, err);
      }
    }

    await this.repo.remove(attachment);
    try {
      await this.auditLog.log({
        performedBy: performedBy ?? null,
        actor: 'USER',
        action: 'DELETE_ATTACHMENT',
        entityType: 'TICKET',
        entityId: ticketId,
        payload: { attachmentId, filename: attachment.filename, ticketId },
      });
    } catch { /* audit log failure must not break main operation */ }
  }
}

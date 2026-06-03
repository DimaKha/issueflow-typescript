import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { Attachment } from './attachment.entity';
import { TicketsService } from '../tickets/tickets.service';
import { AuditLogService } from '../audit-log/audit-log.service';

// Mock fs/promises before any imports that use it
jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { unlink } from 'fs/promises';

const mockFile = (): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname: 'test.png',
    encoding: '7bit',
    mimetype: 'image/png',
    filename: 'abc123.png',
    path: '/uploads/abc123.png',
    size: 1024,
    buffer: Buffer.from(''),
    destination: '/uploads',
    stream: null as any,
  });

const mockAttachment = (overrides: Partial<Attachment> = {}): Attachment =>
  ({
    id: 1,
    ticketId: 10,
    filename: 'abc123.png',
    originalName: 'test.png',
    contentType: 'image/png',
    filePath: '/uploads/abc123.png',
    size: 1024,
    createdAt: new Date(),
    ...overrides,
  }) as Attachment;

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let ticketsService: { findOne: jest.Mock };
  let auditLog: { log: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    ticketsService = { findOne: jest.fn().mockResolvedValue({ id: 10 }) };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };

    // Reset unlink mock between tests
    (unlink as jest.Mock).mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: getRepositoryToken(Attachment), useValue: repo },
        { provide: TicketsService, useValue: ticketsService },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<AttachmentsService>(AttachmentsService);
  });

  // ──────────────────────────────────────────────
  // upload
  // ──────────────────────────────────────────────
  describe('upload', () => {
    it('should save attachment metadata and return the saved record', async () => {
      const file = mockFile();
      const saved = mockAttachment();
      repo.save.mockResolvedValue(saved);

      const result = await service.upload(10, file, 1);

      expect(ticketsService.findOne).toHaveBeenCalledWith(10);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 10,
          filename: 'abc123.png',
          originalName: 'test.png',
          contentType: 'image/png',
          filePath: '/uploads/abc123.png',
          size: 1024,
        }),
      );
      expect(repo.save).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      ticketsService.findOne.mockRejectedValue(new NotFoundException());

      await expect(service.upload(99, mockFile(), 1)).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // remove
  // ──────────────────────────────────────────────
  describe('remove', () => {
    it('should delete the DB record and the physical file', async () => {
      const attachment = mockAttachment();
      repo.findOne.mockResolvedValue(attachment);

      await service.remove(10, 1, 1);

      expect(unlink).toHaveBeenCalledWith('/uploads/abc123.png');
      expect(repo.remove).toHaveBeenCalledWith(attachment);
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(10, 99, 1)).rejects.toThrow(NotFoundException);
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when attachment belongs to a different ticket', async () => {
      repo.findOne.mockResolvedValue(mockAttachment({ ticketId: 999 }));

      await expect(service.remove(10, 1, 1)).rejects.toThrow(NotFoundException);
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('should proceed without throwing when physical file is already gone (ENOENT)', async () => {
      repo.findOne.mockResolvedValue(mockAttachment());
      (unlink as jest.Mock).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      await expect(service.remove(10, 1, 1)).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalled();
    });
  });
});

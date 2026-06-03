import { Test, TestingModule } from '@nestjs/testing';
import { EscalationScheduler } from './escalation.scheduler';
import { TicketsService } from './tickets.service';

describe('EscalationScheduler', () => {
  let scheduler: EscalationScheduler;
  let ticketsService: { escalateOverdueTickets: jest.Mock };

  beforeEach(async () => {
    ticketsService = {
      escalateOverdueTickets: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationScheduler,
        { provide: TicketsService, useValue: ticketsService },
      ],
    }).compile();

    scheduler = module.get<EscalationScheduler>(EscalationScheduler);
  });

  it('should delegate to ticketsService.escalateOverdueTickets when handleEscalation fires', async () => {
    await scheduler.handleEscalation();
    expect(ticketsService.escalateOverdueTickets).toHaveBeenCalledTimes(1);
  });

  it('should not throw if escalateOverdueTickets rejects (error is logged internally)', async () => {
    ticketsService.escalateOverdueTickets.mockRejectedValue(new Error('DB down'));
    await expect(scheduler.handleEscalation()).resolves.toBeUndefined();
  });
});

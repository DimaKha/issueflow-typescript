import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TicketsService } from './tickets.service';

/**
 * Runs every minute in development/demo mode.
 * In production, change CronExpression.EVERY_MINUTE to a longer interval
 * (e.g. '0 * * * *' for hourly) to reduce DB load.
 */
@Injectable()
export class EscalationScheduler {
  private readonly logger = new Logger(EscalationScheduler.name);

  constructor(private readonly ticketsService: TicketsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleEscalation(): Promise<void> {
    try {
      await this.ticketsService.escalateOverdueTickets();
    } catch (err) {
      this.logger.error('Escalation run failed', err);
    }
  }
}

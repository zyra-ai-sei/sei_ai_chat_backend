import cron from 'node-cron';
import { inject, injectable } from 'inversify';
import { TYPES } from '../ioc-container/types';
import { TwapEventService } from '../services/event-listener/TwapEventService';

@injectable()
export class CronService {
  constructor(
    @inject(TYPES.TwapEventService) private twapEventService: TwapEventService
  ) {}

  public startCronJobs(): void {
    // Schedule task to run every minute
    cron.schedule('* * * * *', async () => {
      try {
        console.log('⏰ Running 1-minute safety sync...');
        await this.twapEventService.syncRecentHistory();
      } catch (error) {
        console.error('❌ Cron job failed:', error);
      }
    });

    console.log('✅ Cron jobs started successfully');
  }
}
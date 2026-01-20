import cron from 'node-cron';
import { inject, injectable } from 'inversify';
import { TYPES } from '../ioc-container/types';
import { TwapEventService } from '../services/event-listener/TwapEventService';
import { AddressActivitySummaryService } from '../services/AddressActivitySummaryService';
import { TrackedAddress } from '../database/mongo/models/TrackedAddress';
import dayjs from 'dayjs';

@injectable()
export class CronService {
  constructor(
    @inject(TYPES.TwapEventService) private twapEventService: TwapEventService,
    @inject(TYPES.AddressActivitySummaryService) private summaryService: AddressActivitySummaryService
  ) {}

  public startCronJobs(): void {
    // Schedule task to run every minute
    cron.schedule('*/5 * * * *', async () => {
      try {
        await this.twapEventService.syncRecentHistory();
      } catch (error) {
        console.error('❌ Cron job failed:', error);
      }
    });

    // Schedule daily summary generation at 00:01 AM
    cron.schedule('1 0 * * *', async () => {
      try {
        const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
        const trackedAddresses = await TrackedAddress.find({});
        
        for (const tracked of trackedAddresses) {
          await this.summaryService.generateDailySummary(tracked.address, yesterday);
        }
      } catch (error) {
        console.error('❌ Daily summary cron job failed:', error);
      }
    });

    console.log('✅ Cron jobs started successfully');
  }
}
import { inject, injectable } from 'inversify';
import { TYPES } from '../ioc-container/types';
import { PrivyTransactionService } from './PrivyTransactionService';
import { PriceCheckerService } from './PriceCheckerService';
import { DelegatedTransactionOp } from '../database/mongo/DelegatedTransactionOp';
import { IDelegatedTransaction } from '../database/mongo/models/DelegatedTransaction';
import { TransactionType, OrderStatus } from '../types/transaction.types';
import { MONITORING_CONFIG, getMonitoringInterval } from '../config/monitoring.config';
import RedisService from '../utils/redis/RedisService';

/**
 * OfflineTransactionMonitorService
 *
 * Monitors delegated transactions and executes them when conditions are met
 * Runs every 2 minutes to check:
 * - Price-based orders (limit orders, stop loss)
 * - Time-based orders (scheduled transactions)
 * - Linked orders (dependent on parent order execution)
 */
@injectable()
export class OfflineTransactionMonitorService {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  private readonly LOCK_KEY = 'monitoring:lock';

  constructor(
    @inject(TYPES.PrivyTransactionService)
    private privyTransactionService: PrivyTransactionService,
    @inject(TYPES.PriceCheckerService)
    private priceCheckerService: PriceCheckerService,
    @inject(TYPES.DelegatedTransactionOp)
    private delegatedTransactionOp: DelegatedTransactionOp,
    @inject(TYPES.RedisService)
    private redisService: RedisService
  ) {}

  /**
   * Start the monitoring service
   * Runs checks at configured interval (default: 2 minutes)
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      console.log('[Monitoring] Service already running');
      return;
    }

    const intervalMs = getMonitoringInterval();
    console.log(`[Monitoring] Starting service with ${intervalMs / 1000}s interval...`);

    this.isMonitoring = true;

    // Run immediately on start
    this.checkAndExecuteOrders();

    // Then run at intervals
    this.monitoringInterval = setInterval(() => {
      this.checkAndExecuteOrders();
    }, intervalMs);

    console.log('[Monitoring] ✅ Service started successfully');
  }

  /**
   * Stop the monitoring service
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      console.log('[Monitoring] Service not running');
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    console.log('[Monitoring] ✅ Service stopped');
  }

  /**
   * Main monitoring loop - checks and executes orders
   */
  private async checkAndExecuteOrders(): Promise<void> {
    try {
      console.log('\n[Monitoring] ========== Starting check cycle ==========');

      // Acquire distributed lock to prevent duplicate execution in multi-instance setup
      if (MONITORING_CONFIG.enableDistributedLocking) {
        const acquired = await this.acquireLock();
        if (!acquired) {
          console.log('[Monitoring] Another instance is processing, skipping...');
          return;
        }
      }

      // First, expire old orders
      const expiredCount = await this.delegatedTransactionOp.expireOldOrders();
      if (expiredCount > 0) {
        console.log(`[Monitoring] Expired ${expiredCount} old orders`);
      }

      // Fetch orders ready for execution
      const orders = await this.delegatedTransactionOp.getOrdersReadyForExecution();
      console.log(`[Monitoring] Found ${orders.length} orders to check`);

      if (orders.length === 0) {
        console.log('[Monitoring] No orders to process');
        return;
      }

      // Process each order
      let executedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (const order of orders) {
        try {
          const shouldExecute = await this.shouldExecuteOrder(order);

          if (shouldExecute) {
            console.log(`[Monitoring] Executing order ${order.orderId}...`);
            await this.executeOrder(order);
            executedCount++;
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error(`[Monitoring] Error processing order ${order.orderId}:`, error);
          failedCount++;
          await this.handleExecutionFailure(order.orderId, error as Error);
        }
      }

      console.log('[Monitoring] ========== Check cycle complete ==========');
      console.log(`[Monitoring] Summary: ${executedCount} executed, ${skippedCount} skipped, ${failedCount} failed`);

    } catch (error) {
      console.error('[Monitoring] Error in check cycle:', error);
    } finally {
      // Release lock
      if (MONITORING_CONFIG.enableDistributedLocking) {
        await this.releaseLock();
      }
    }
  }

  /**
   * Check if an order should be executed based on its conditions
   */
  private async shouldExecuteOrder(order: IDelegatedTransaction): Promise<boolean> {
    try {
      // Check if order has a dependency (linked order)
      if (order.executionConditions.dependsOn) {
        console.log(`[Monitoring] Order ${order.orderId} depends on ${order.executionConditions.dependsOn}, skipping...`);
        return false;
      }

      // Check based on transaction type
      switch (order.transactionType) {
        case TransactionType.LIMIT_ORDER:
          return await this.checkLimitOrderCondition(order);

        case TransactionType.STOP_LOSS:
          return await this.checkStopLossCondition(order);

        case TransactionType.SCHEDULED:
          return await this.checkScheduledCondition(order);

        case TransactionType.DCA:
          return await this.checkDCACondition(order);

        default:
          console.log(`[Monitoring] Unknown transaction type: ${order.transactionType}`);
          return false;
      }
    } catch (error) {
      console.error(`[Monitoring] Error checking order conditions for ${order.orderId}:`, error);
      return false;
    }
  }

  /**
   * Check if limit order condition is met
   */
  private async checkLimitOrderCondition(order: IDelegatedTransaction): Promise<boolean> {
    const { targetPrice, priceDirection, targetTokenSymbol } = order.executionConditions;

    if (!targetPrice || !priceDirection || !targetTokenSymbol) {
      console.log(`[Monitoring] Order ${order.orderId} missing limit order parameters`);
      return false;
    }

    return await this.priceCheckerService.checkLimitOrderCondition(
      targetPrice,
      priceDirection,
      targetTokenSymbol
    );
  }

  /**
   * Check if stop loss condition is met
   */
  private async checkStopLossCondition(order: IDelegatedTransaction): Promise<boolean> {
    const { stopPrice, targetTokenSymbol } = order.executionConditions;

    if (!stopPrice || !targetTokenSymbol) {
      console.log(`[Monitoring] Order ${order.orderId} missing stop loss parameters`);
      return false;
    }

    return await this.priceCheckerService.checkStopLossCondition(
      stopPrice,
      targetTokenSymbol
    );
  }

  /**
   * Check if scheduled transaction is due
   */
  private async checkScheduledCondition(order: IDelegatedTransaction): Promise<boolean> {
    const { executeAt } = order.executionConditions;

    if (!executeAt) {
      console.log(`[Monitoring] Order ${order.orderId} missing executeAt parameter`);
      return false;
    }

    const now = new Date();
    const isDue = now >= new Date(executeAt);

    console.log(`[Monitoring] Scheduled order ${order.orderId}: Due at ${executeAt}, now ${now.toISOString()}, isDue: ${isDue}`);

    return isDue;
  }

  /**
   * Check if DCA order should execute
   * TODO: Implement DCA-specific logic (recurring buys)
   */
  private async checkDCACondition(order: IDelegatedTransaction): Promise<boolean> {
    console.log(`[Monitoring] DCA order checking not yet implemented for ${order.orderId}`);
    return false;
  }

  /**
   * Execute an order
   */
  private async executeOrder(order: IDelegatedTransaction): Promise<void> {
    try {
      console.log(`[Monitoring] 🚀 Executing order ${order.orderId} (${order.transactionType})`);

      const result = await this.privyTransactionService.executeDelegatedOrder(order.orderId);

      console.log(`[Monitoring] ✅ Order ${order.orderId} executed successfully`);
      console.log(`[Monitoring] Transaction hash: ${result.transactionHash}`);

    } catch (error) {
      console.error(`[Monitoring] ❌ Failed to execute order ${order.orderId}:`, error);
      throw error;
    }
  }

  /**
   * Handle execution failure with retry logic
   */
  private async handleExecutionFailure(orderId: string, error: Error): Promise<void> {
    try {
      const order = await this.delegatedTransactionOp.getOrderById(orderId);

      if (!order) {
        console.error(`[Monitoring] Order ${orderId} not found`);
        return;
      }

      const attemptCount = order.execution.attemptCount || 0;

      // If max retries exceeded, mark as failed
      if (attemptCount >= MONITORING_CONFIG.maxRetryAttempts) {
        console.log(`[Monitoring] Order ${orderId} exceeded max retries (${attemptCount}), marking as FAILED`);
        await this.delegatedTransactionOp.updateOrderStatus(
          orderId,
          OrderStatus.FAILED,
          {
            errorMessage: `Max retries exceeded: ${error.message}`,
            errorDetails: { error: error.message, attemptCount }
          }
        );
      } else {
        console.log(`[Monitoring] Order ${orderId} failed (attempt ${attemptCount + 1}/${MONITORING_CONFIG.maxRetryAttempts})`);
        // Status will remain AUTHORIZED for retry in next cycle
      }
    } catch (err) {
      console.error('[Monitoring] Error handling execution failure:', err);
    }
  }

  /**
   * Acquire distributed lock (Redis-based)
   */
  private async acquireLock(): Promise<boolean> {
    try {
      const lockValue = `${Date.now()}`;
      const lockKey = this.LOCK_KEY;

      // Try to set lock with NX (only if not exists) and EX (expiration)
      const result = await this.redisService.getValue(lockKey);

      if (result) {
        // Lock already exists
        return false;
      }

      // Set lock
      await this.redisService.setValue(lockKey, lockValue, MONITORING_CONFIG.lockTTL);
      return true;

    } catch (error) {
      console.error('[Monitoring] Error acquiring lock:', error);
      return false;
    }
  }

  /**
   * Release distributed lock
   */
  private async releaseLock(): Promise<void> {
    try {
      await this.redisService.deleteValue(this.LOCK_KEY);
    } catch (error) {
      console.error('[Monitoring] Error releasing lock:', error);
    }
  }

  /**
   * Get monitoring status
   */
  public getStatus(): {
    isMonitoring: boolean;
    intervalMs: number;
    config: typeof MONITORING_CONFIG;
  } {
    return {
      isMonitoring: this.isMonitoring,
      intervalMs: getMonitoringInterval(),
      config: MONITORING_CONFIG
    };
  }
}

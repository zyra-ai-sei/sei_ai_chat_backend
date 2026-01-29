/**
 * Monitoring Service Configuration
 *
 * Configuration for the offline transaction monitoring service
 */

export interface MonitoringConfig {
  /** How often to check orders (in milliseconds) */
  checkIntervalMs: number;

  /** Maximum number of execution attempts per order */
  maxRetryAttempts: number;

  /** Delay between retry attempts (in milliseconds) */
  retryDelayMs: number;

  /** Timeout for single order execution (in milliseconds) */
  executionTimeoutMs: number;

  /** Enable distributed locking via Redis for multi-instance safety */
  enableDistributedLocking: boolean;

  /** Lock TTL for distributed locking (in seconds) */
  lockTTL: number;
}

export const MONITORING_CONFIG: MonitoringConfig = {
  // Check orders every 2 minutes (120 seconds)
  checkIntervalMs: 2 * 60 * 1000,

  // Max 3 execution attempts per order before marking as failed
  maxRetryAttempts: 3,

  // Wait 5 seconds before retrying failed execution
  retryDelayMs: 5 * 1000,

  // Timeout for single execution: 2 minutes
  executionTimeoutMs: 2 * 60 * 1000,

  // Enable Redis locking to prevent duplicate execution in multi-instance deployments
  enableDistributedLocking: true,

  // Lock expires after 5 minutes (should be longer than execution timeout)
  lockTTL: 5 * 60
};

/**
 * Get monitoring interval from environment or use default
 */
export function getMonitoringInterval(): number {
  const envInterval = process.env.MONITORING_CHECK_INTERVAL_MS;
  return envInterval ? parseInt(envInterval, 10) : MONITORING_CONFIG.checkIntervalMs;
}

/**
 * Get max retry attempts from environment or use default
 */
export function getMaxRetryAttempts(): number {
  const envRetries = process.env.MONITORING_MAX_RETRIES;
  return envRetries ? parseInt(envRetries, 10) : MONITORING_CONFIG.maxRetryAttempts;
}

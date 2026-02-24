import { randomUUID } from "crypto";
import ToolQueryResult from "../../database/mongo/models/ToolQueryResult";
import { StreamRegistry } from "../../services/StreamRegistry";

// Global StreamRegistry reference for SSE notifications
let streamRegistry: StreamRegistry | null = null;

/**
 * Initialize the stream registry reference for SSE notifications.
 * Call this during app startup after IoC container is ready.
 */
export function initToolHelperStreamRegistry(registry: StreamRegistry): void {
  streamRegistry = registry;
  console.log("[ToolHelper] StreamRegistry initialized for SSE notifications");
}

/**
 * Get the current stream registry reference
 */
export function getToolHelperStreamRegistry(): StreamRegistry | null {
  return streamRegistry;
}

/**
 * Represents the result structure that separates LLM summary from full UI data.
 * This allows the LLM to receive lightweight summaries while large payloads
 * are persisted to MongoDB for frontend retrieval.
 */
export interface ToolResultWithData<T = any> {
  // Summary text for LLM reasoning (lightweight) - THIS IS WHAT THE LLM SEES
  text: string;

  // Critical scalars the LLM needs for continued reasoning
  summary?: {
    balances?: Record<string, string>;
    orderIds?: string[];
    transactionHashes?: string[];
    status?: string;
    counts?: Record<string, number>;
    metadata?: Record<string, any>;
  };

  // Reference to data stored in MongoDB - NOT the actual data
  // Frontend uses this executionId to fetch the full payload
  _dataRef?: {
    executionId: string;
    dataType: string;
    toolName?: string;
    status?: "pending" | "completed" | "failed";
  };

  // Full data for UI/frontend - ONLY for small payloads (<10KB)
  // Large payloads should use storeAndReference() instead
  data_output?: {
    type: string;
    payload: T;
  };

  // Legacy tool_output for transaction signing (array of unsigned txns)
  tool_output?: any[];

  // Unique execution ID for tracking and lookup
  executionId?: string;

  // Error indicator
  isError?: boolean;
}

/**
 * Store large data in MongoDB and return only a reference for the LLM.
 * The LLM receives a lightweight summary, frontend fetches full data via executionId.
 *
 * @param options Configuration for storing data
 * @returns Tool result with summary text for LLM and reference for frontend
 */
export async function storeAndReturnReference<T>(options: {
  // Human-readable summary for the LLM - KEEP THIS CONCISE
  summaryText: string;

  // Type identifier for the data (e.g., 'CRYPTO_MARKET_DATA', 'PORTFOLIO')
  dataType: string;

  // The full payload to store in MongoDB
  payload: T;

  // Tool name for tracking
  toolName: string;

  // User ID (from config.configurable.thread_id)
  userId?: string;

  // Request ID for grouping related tool calls (from config.configurable.requestId)
  requestId?: string;

  // Key metrics to include in summary for LLM reasoning
  keyMetrics?: Record<string, any>;
}): Promise<{
  text: string;
  _dataRef: {
    executionId: string;
    dataType: string;
    toolName: string;
  };
}> {
  const executionId = randomUUID();

  // Build summary text with key metrics for LLM
  let fullSummaryText = options.summaryText;
  if (options.keyMetrics) {
    const metricsStr = Object.entries(options.keyMetrics)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
    fullSummaryText += ` Key metrics: ${metricsStr}`;
  }

  // Store in MongoDB asynchronously
  try {
    await ToolQueryResult.create({
      executionId,
      userId: options.userId || "anonymous",
      threadId: options.userId || "anonymous",
      requestId: options.requestId,
      toolName: options.toolName,
      summary: {
        text: fullSummaryText,
        metadata: options.keyMetrics || {},
      },
      data: {
        type: options.dataType,
        payload: options.payload,
      },
      execution: {
        status: "completed",
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    console.log(
      `[ToolHelper] Stored data for ${options.toolName}, executionId: ${executionId}`,
    );
  } catch (error) {
    console.error(`[ToolHelper] Failed to store data:`, error);
    // Don't throw - return summary anyway so LLM can continue
  }

  // Return ONLY the summary and reference - NOT the full data
  return {
    text: fullSummaryText,
    _dataRef: {
      executionId,
      dataType: options.dataType,
      toolName: options.toolName,
    },
  };
}

/**
 * ASYNC version: Returns immediately to LLM while fetching data in background.
 * Use this for tools with slow external API calls (CoinGecko, Twitter, etc.)
 *
 * Flow:
 * 1. Immediately returns executionId + summary to LLM (with status: 'pending')
 * 2. Kicks off asyncWork in background (non-blocking)
 * 3. When asyncWork completes, stores result in MongoDB and updates status
 * 4. Frontend polls or receives SSE notification when data is ready
 *
 * @param options Configuration including the async work function
 * @returns Immediate response for LLM with pending reference
 */
export function storeAndReturnReferenceAsync<T>(options: {
  // Human-readable summary for the LLM - shown immediately
  summaryText: string;

  // Type identifier for the data
  dataType: string;

  // Tool name for tracking
  toolName: string;

  // User ID (from config.configurable.thread_id)
  userId?: string;

  // Request ID for grouping related tool calls (from config.configurable.requestId)
  requestId?: string;

  // Key metrics to include in summary for LLM reasoning (if known upfront)
  keyMetrics?: Record<string, any>;

  // The async work to perform in background - returns the payload
  asyncWork: () => Promise<T>;

  // Optional: Callback when async work completes (e.g., to emit SSE event)
  onComplete?: (executionId: string, payload: T) => void;

  // Optional: Callback when async work fails
  onError?: (executionId: string, error: Error) => void;

  // Set to true for tools that produce unsigned transactions.
  // This initialises `transaction.status: 'unsigned'` on the DB record
  // so the frontend can distinguish "data loaded" (execution.status)
  // from "user has signed" (transaction.status).
  isTransaction?: boolean;
}): {
  text: string;
  _dataRef: {
    executionId: string;
    dataType: string;
    toolName: string;
    status: "pending";
    // Flag to indicate frontend should poll/fetch data from dedicated API
    isAsync: true;
  };
} {
  const executionId = randomUUID();

  // Build summary text with key metrics for LLM
  let fullSummaryText = options.summaryText;
  if (options.keyMetrics) {
    const metricsStr = Object.entries(options.keyMetrics)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
    fullSummaryText += ` Key metrics: ${metricsStr}`;
  }

  // Create pending record immediately (non-blocking)
  ToolQueryResult.create({
    executionId,
    userId: options.userId || "anonymous",
    threadId: options.userId || "anonymous",
    requestId: options.requestId,
    toolName: options.toolName,
    summary: {
      text: fullSummaryText,
      metadata: options.keyMetrics || {},
    },
    data: {
      type: options.dataType,
      payload: null, // Will be populated when async work completes
    },
    execution: {
      status: "pending",
      startedAt: new Date(),
    },
  })
    .then(() => {
      console.log(
        `[ToolHelper] Created pending record for ${options.toolName}, executionId: ${executionId}`,
      );
    })
    .catch((error) => {
      console.error(`[ToolHelper] Failed to create pending record:`, error);
    });

  // Fire off async work in background (non-blocking)
  options
    .asyncWork()
    .then(async (payload) => {
      try {
        console.log(
          `[ToolHelper] Async work returned for ${options.toolName}, executionId: ${executionId}, payload type: ${typeof payload}`,
        );

        // Update the record with the actual data
        const updateResult = await ToolQueryResult.findOneAndUpdate(
          { executionId },
          {
            $set: {
              "data.payload": payload,
              "execution.status": "completed",
              "execution.completedAt": new Date(),
            },
          },
          { new: true }, // Return the updated document
        );

        if (!updateResult) {
          console.error(
            `[ToolHelper] Failed to find record to update for executionId: ${executionId}`,
          );
        } else {
          console.log(
            `[ToolHelper] Async work completed for ${options.toolName}, executionId: ${executionId}, payload saved: ${updateResult.data?.payload !== null}`,
          );
        }

        // Emit SSE notification via StreamRegistry if available
        if (streamRegistry && options.userId) {
          streamRegistry.emitToolDataReady({
            executionId,
            toolName: options.toolName,
            dataType: options.dataType,
            userId: options.userId,
            status: "completed",
          });
        }

        // Call onComplete callback if provided
        if (options.onComplete) {
          options.onComplete(executionId, payload);
        }
      } catch (updateError) {
        console.error(
          `[ToolHelper] Failed to update record after async work:`,
          updateError,
        );
      }
    })
    .catch(async (error) => {
      console.error(
        `[ToolHelper] Async work failed for ${options.toolName}:`,
        error,
      );
      try {
        await ToolQueryResult.findOneAndUpdate(
          { executionId },
          {
            $set: {
              "execution.status": "failed",
              "execution.error": error.message || String(error),
              "execution.completedAt": new Date(),
            },
          },
        );

        // Emit SSE notification for failure via StreamRegistry if available
        if (streamRegistry && options.userId) {
          streamRegistry.emitToolDataReady({
            executionId,
            toolName: options.toolName,
            dataType: options.dataType,
            userId: options.userId,
            status: "failed",
            error: error.message || String(error),
          });
        }
      } catch (updateError) {
        console.error(
          `[ToolHelper] Failed to update failed status:`,
          updateError,
        );
      }

      // Call onError callback if provided
      if (options.onError) {
        options.onError(executionId, error);
      }
    });

  // Return immediately - don't wait for async work
  return {
    text: fullSummaryText,
    _dataRef: {
      executionId,
      dataType: options.dataType,
      toolName: options.toolName,
      status: "pending",
      // Flag to indicate frontend should poll/fetch data from dedicated API
      isAsync: true,
    },
  };
}

/**
 * Creates a tool result that separates LLM summary from full data.
 * Use this for tools that return large payloads.
 * @deprecated Use storeAndReturnReference for large payloads
 */
export function createToolResultWithData<T>(options: {
  // Human-readable summary for the LLM
  summaryText: string;

  // Type identifier for the data (e.g., 'portfolio', 'price_data')
  dataType: string;

  // The full payload to store
  payload: T;

  // Optional: Additional summary scalars for LLM reasoning
  summaryScalars?: {
    balances?: Record<string, string>;
    orderIds?: string[];
    transactionHashes?: string[];
    status?: string;
    counts?: Record<string, number>;
    metadata?: Record<string, any>;
  };

  // Optional: Generate an execution ID
  generateExecutionId?: boolean;
}): ToolResultWithData<T> {
  const result: ToolResultWithData<T> = {
    text: options.summaryText,
    data_output: {
      type: options.dataType,
      payload: options.payload,
    },
  };

  if (options.summaryScalars) {
    result.summary = options.summaryScalars;
  }

  if (options.generateExecutionId) {
    result.executionId = randomUUID();
  }

  return result;
}

/**
 * Creates a transaction tool result with proper structure.
 * Use this for tools that prepare unsigned transactions.
 */
export function createTransactionToolResult(options: {
  // Description of what the transaction does
  description: string;

  // Array of unsigned transactions to sign
  transactions: any[];

  // Optional: Execution ID for tracking
  executionId?: string;
}): ToolResultWithData {
  return {
    text: options.description,
    tool_output: options.transactions,
    executionId: options.executionId || randomUUID(),
  };
}

/**
 * Creates an error tool result.
 */
export function createErrorToolResult(
  operation: string,
  error: Error | string,
): ToolResultWithData {
  const message = error instanceof Error ? error.message : error;
  return {
    text: `Error ${operation}: ${message}`,
    isError: true,
  };
}

/**
 * Extracts summary information from a large dataset for LLM context.
 * Useful for portfolio data, transaction lists, etc.
 */
export function extractSummaryFromData(
  data: any,
  type: "portfolio" | "transactions" | "orders" | "tokens",
): {
  text: string;
  scalars: Record<string, any>;
} {
  switch (type) {
    case "portfolio":
      return extractPortfolioSummary(data);
    case "transactions":
      return extractTransactionSummary(data);
    case "orders":
      return extractOrderSummary(data);
    case "tokens":
      return extractTokenSummary(data);
    default:
      return {
        text: "Data retrieved successfully.",
        scalars: {},
      };
  }
}

function extractPortfolioSummary(data: any): {
  text: string;
  scalars: Record<string, any>;
} {
  const tokenCount = Array.isArray(data.tokens) ? data.tokens.length : 0;
  const totalValue = data.totalValue || data.total_value || "unknown";

  return {
    text: `Portfolio contains ${tokenCount} tokens with total value of ${totalValue}.`,
    scalars: {
      counts: { tokens: tokenCount },
      metadata: { totalValue },
    },
  };
}

function extractTransactionSummary(data: any): {
  text: string;
  scalars: Record<string, any>;
} {
  const txCount = Array.isArray(data)
    ? data.length
    : data.transactions?.length || 0;
  const hashes = Array.isArray(data)
    ? data
        .slice(0, 5)
        .map((tx: any) => tx.hash || tx.txHash)
        .filter(Boolean)
    : [];

  return {
    text: `Found ${txCount} transaction(s).`,
    scalars: {
      counts: { transactions: txCount },
      transactionHashes: hashes,
    },
  };
}

function extractOrderSummary(data: any): {
  text: string;
  scalars: Record<string, any>;
} {
  const orders = Array.isArray(data) ? data : data.orders || [];
  const orderIds = orders
    .slice(0, 10)
    .map((o: any) => o.orderId?.toString() || o.id?.toString())
    .filter(Boolean);
  const statusCounts: Record<string, number> = {};

  orders.forEach((o: any) => {
    const status = o.status || "unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  return {
    text: `Found ${orders.length} order(s). Status breakdown: ${Object.entries(
      statusCounts,
    )
      .map(([s, c]) => `${s}: ${c}`)
      .join(", ")}.`,
    scalars: {
      counts: { orders: orders.length, ...statusCounts },
      orderIds,
    },
  };
}

function extractTokenSummary(data: any): {
  text: string;
  scalars: Record<string, any>;
} {
  const tokens = Array.isArray(data) ? data : data.tokens || [data];

  const balances: Record<string, string> = {};
  tokens.slice(0, 5).forEach((t: any) => {
    const symbol = t.symbol || t.name || "unknown";
    const balance = t.balance || t.formatted || t.amount || "0";
    balances[symbol] = balance.toString();
  });

  return {
    text: `Retrieved information for ${tokens.length} token(s).`,
    scalars: {
      counts: { tokens: tokens.length },
      balances,
    },
  };
}

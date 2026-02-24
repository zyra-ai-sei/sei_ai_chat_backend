/**
 * Factory functions for creating standardized tool responses.
 * Replaces ALL legacy helpers (storeAndReturnReference, storeAndReturnReferenceAsync,
 * createToolResultWithData, createTransactionToolResult, createErrorToolResult).
 */

import { randomUUID } from "crypto";
import ToolQueryResult from "../../database/mongo/models/ToolQueryResult";
import { StreamRegistry } from "../../services/StreamRegistry";
import type {
  QueryToolResponse,
  TransactionToolResponse,
  AsyncToolResponse,
  ErrorToolResponse,
} from "./ToolResponse";

// ── StreamRegistry singleton ────────────────────────────────────────────────

let streamRegistry: StreamRegistry | null = null;

export function initToolHelperStreamRegistry(registry: StreamRegistry): void {
  streamRegistry = registry;
  console.log("[ToolHelper] StreamRegistry initialized for SSE notifications");
}

export function getToolHelperStreamRegistry(): StreamRegistry | null {
  return streamRegistry;
}

// ── Config extractor ────────────────────────────────────────────────────────

export interface ToolConfig {
  userId?: string;
  requestId?: string;
}

/** Extracts userId and requestId from the LangGraph config object. */
export function extractConfig(config: any): ToolConfig {
  return {
    userId: config?.configurable?.thread_id,
    requestId: config?.configurable?.requestId,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. QUERY — synchronous, small payload, no DB
// ════════════════════════════════════════════════════════════════════════════

/**
 * For fast reads that return small data directly to the LLM.
 * No MongoDB record created.
 */
export function createQueryResponse<T>(opts: {
  toolName: string;
  text: string;
  data: T;
  requestId?: string;
}): QueryToolResponse<T> {
  return {
    kind: "query",
    executionId: randomUUID(),
    toolName: opts.toolName,
    requestId: opts.requestId,
    text: opts.text,
    isError: false,
    data: opts.data,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 2. TRANSACTION — async build, unsigned txn(s), needs signing
// ════════════════════════════════════════════════════════════════════════════

/**
 * For tools that produce unsigned transactions.
 * Returns immediately; background work builds the txn(s),
 * stores them in MongoDB, and emits SSE when ready.
 */
export async function createTransactionResponse(opts: {
  toolName: string;
  text: string;
  requestId?: string;
  userId?: string;
  /** Key-value metadata for the summary (e.g. amount, recipient) */
  meta?: Record<string, unknown>;
  /** The async work that builds the unsigned transaction(s) */
  buildTx: () => Promise<{ transactions: any[]; [key: string]: any }>;
  onComplete?: (executionId: string) => void;
  onError?: (executionId: string, error: Error) => void;
}): Promise<TransactionToolResponse> {
  const executionId = randomUUID();

  let fullText = opts.text;
  if (opts.meta) {
    const metricsStr = Object.entries(opts.meta)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    fullText += ` [${metricsStr}]`;
  }

  // Create pending DB record (fire-and-forget)
  await ToolQueryResult.create({
    executionId,
    userId: opts.userId || "anonymous",
    threadId: opts.userId || "anonymous",
    requestId: opts.requestId,
    toolName: opts.toolName,
    summary: { text: fullText, metadata: opts.meta || {} },
    data: { type: "TRANSACTION", payload: null },
    execution: { status: "pending", startedAt: new Date() },
  })
    .then(() => {
      console.log("what the hell man");
    })
    .catch((err) =>
      console.error(`[ToolHelper] Failed to create pending tx record:`, err),
    );
  // Background: build txn, update DB, emit SSE
  opts
    .buildTx()
    .then(async (result) => {
      try {
        let transactions = result.transactions;
        if (transactions && Array.isArray(transactions)) {
          transactions = transactions.map((tx) => ({
            ...tx,
            status: "unsigned",
          }));
          result.transactions = transactions;
        }

        const updatedResult = await ToolQueryResult.findOneAndUpdate(
          { executionId },
          {
            $set: {
              "data.payload": result,
              "execution.status": "completed",
              "execution.completedAt": new Date(),
            },
          },
        );
        console.log("we come here to built txn", updatedResult);
        console.log(
          `[ToolHelper] Transaction built for ${opts.toolName}, executionId: ${executionId}`,
        );
        if (streamRegistry && opts.userId) {
          streamRegistry.emitToolDataReady({
            executionId,
            toolName: opts.toolName,
            dataType: "TRANSACTION",
            userId: opts.userId,
            status: "completed",
          });
        }
        opts.onComplete?.(executionId);
      } catch (updateError) {
        console.error(`[ToolHelper] Failed to update tx record:`, updateError);
      }
    })
    .catch(async (error) => {
      console.error(`[ToolHelper] buildTx failed for ${opts.toolName}:`, error);
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
      } catch (_) {}
      if (streamRegistry && opts.userId) {
        streamRegistry.emitToolDataReady({
          executionId,
          toolName: opts.toolName,
          dataType: "TRANSACTION",
          userId: opts.userId,
          status: "failed",
          error: error.message,
        });
      }
      opts.onError?.(executionId, error);
    });

  return {
    kind: "transaction",
    executionId,
    toolName: opts.toolName,
    requestId: opts.requestId,
    text: fullText,
    isError: false,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 3. ASYNC — slow external fetch, data lands in MongoDB
// ════════════════════════════════════════════════════════════════════════════

/**
 * For tools with slow external API calls (CoinGecko, Twitter, etc.).
 * Returns immediately with `pending`; background work fetches data,
 * stores it in MongoDB, emits SSE when ready.
 */
export function createAsyncResponse<T>(opts: {
  toolName: string;
  text: string;
  dataType: string;
  requestId?: string;
  userId?: string;
  meta?: Record<string, unknown>;
  /** The async work that fetches the payload */
  fetch: () => Promise<T>;
  onComplete?: (executionId: string, payload: T) => void;
  onError?: (executionId: string, error: Error) => void;
}): AsyncToolResponse {
  const executionId = randomUUID();

  let fullText = opts.text;
  if (opts.meta) {
    const metricsStr = Object.entries(opts.meta)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    fullText += ` [${metricsStr}]`;
  }

  // Create pending DB record
  ToolQueryResult.create({
    executionId,
    userId: opts.userId || "anonymous",
    threadId: opts.userId || "anonymous",
    requestId: opts.requestId,
    toolName: opts.toolName,
    summary: { text: fullText, metadata: opts.meta || {} },
    data: { type: opts.dataType, payload: null },
    execution: { status: "pending", startedAt: new Date() },
  }).catch((err) =>
    console.error(`[ToolHelper] Failed to create pending async record:`, err),
  );

  // Background fetch
  opts
    .fetch()
    .then(async (payload) => {
      try {
        await ToolQueryResult.findOneAndUpdate(
          { executionId },
          {
            $set: {
              "data.payload": payload,
              "execution.status": "completed",
              "execution.completedAt": new Date(),
            },
          },
        );
        console.log(
          `[ToolHelper] Async data ready for ${opts.toolName}, executionId: ${executionId}`,
        );
        if (streamRegistry && opts.userId) {
          streamRegistry.emitToolDataReady({
            executionId,
            toolName: opts.toolName,
            dataType: opts.dataType,
            userId: opts.userId,
            status: "completed",
          });
        }
        opts.onComplete?.(executionId, payload);
      } catch (updateError) {
        console.error(
          `[ToolHelper] Failed to update async record:`,
          updateError,
        );
      }
    })
    .catch(async (error) => {
      console.error(
        `[ToolHelper] Async fetch failed for ${opts.toolName}:`,
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
      } catch (_) {}
      if (streamRegistry && opts.userId) {
        streamRegistry.emitToolDataReady({
          executionId,
          toolName: opts.toolName,
          dataType: opts.dataType,
          userId: opts.userId,
          status: "failed",
          error: error.message,
        });
      }
      opts.onError?.(executionId, error);
    });

  return {
    kind: "async",
    executionId,
    toolName: opts.toolName,
    requestId: opts.requestId,
    text: fullText,
    isError: false,
    dataType: opts.dataType,
    dataStatus: "pending",
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 4. ERROR — universal error factory
// ════════════════════════════════════════════════════════════════════════════

/**
 * Creates a typed error response. Preserves `kind` so frontend knows
 * what was attempted (e.g. show "Transaction failed" vs "Query failed").
 */
export function createErrorResponse(opts: {
  kind: "query" | "transaction" | "async";
  toolName: string;
  error: Error | string;
  requestId?: string;
  errorCode?: string;
}): ErrorToolResponse {
  const message = opts.error instanceof Error ? opts.error.message : opts.error;
  return {
    kind: opts.kind,
    executionId: randomUUID(),
    toolName: opts.toolName,
    requestId: opts.requestId,
    text: `Error in ${opts.toolName}: ${message}`,
    isError: true,
    errorCode: opts.errorCode,
  };
}

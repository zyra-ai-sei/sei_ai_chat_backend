import type { ToolResponse } from '../../tools/types/ToolResponse';

/**
 * SSE event types for multiplexing over a single connection.
 *
 * - token       : LLM text stream tokens
 * - tool_result : Unified tool result envelope (frontend switches on result.kind)
 * - tx_update   : Blockchain event updates (order fills, confirmations)
 * - error       : Stream-level errors
 */
export type LlmStreamChunk =
    | { type: 'token'; text: string; requestId?: string }
    | {
            type: 'tool_result';
            /** The full ToolResponse envelope — frontend switches on `kind` */
            result: ToolResponse;
            /** LangGraph tool_call ID linking AIMessage → ToolMessage */
            toolCallId?: string;
            /** Groups all messages from a single user request */
            requestId?: string;
        }
    | {
            type: 'tx_update';
            updateType: 'order_created' | 'order_filled' | 'order_completed' | 'order_canceled' | 'tx_confirmed' | 'tx_failed';
            executionId?: string;
            orderId?: string | number;
            txHash?: string;
            address: string;
            chainId: number;
            data: unknown;
        }
    | { type: 'error'; message: string; requestId?: string };

export interface ILlmService {
    initChat(address: string, network: string): Promise<void>;
    getChatHistory(userId: string, address:string, network: string): Promise<any>;
    clearChat(userId: string, address:string): Promise<void>;
    sendMessage(prompt: string, userId: string, address:string, network:string, messageType?: "human" | "system"): Promise<string | object>;
    streamMessage(
        prompt: string, 
        userId: string,
        address: string,
        network: string,
        abortSignal?: AbortSignal,
        messageType?: "human" | "system"
    ): AsyncGenerator<LlmStreamChunk>;
    updateMessageById(
        userId: string,
        address: string,
        network: string,
        executionId: string,
        executionState: "completed" | "pending" | "failed",
        txnHash?: string,
    ): Promise<boolean>;
    
    // Tool Query Result methods for large payload persistence
    getToolQueryResult(executionId: string): Promise<any>;
    getToolQueryResults(executionIds: string[]): Promise<Map<string, any>>;
    getToolQueryResultsByRequestIds(requestIds: string[]): Promise<Record<string, any[]>>;
    updateToolQueryResultStatus(
        executionId: string,
        status: 'pending' | 'completed' | 'failed',
        txHash?: string,
        error?: string
    ): Promise<boolean>;
}

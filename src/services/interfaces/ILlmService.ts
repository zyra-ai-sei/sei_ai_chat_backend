export type LlmStreamChunk =
    | { type: "token"; text: string }
    | {
            type: "tool";
            toolName: string;
            content: string;
            tool_output: unknown;
        };

export interface ILlmService {
    initChat(address: string): Promise<void>;
    getChatHistory(address: string): Promise<any>;
    clearChat(address: string): Promise<void>;
    sendMessage(prompt: string, address: string, messageType?: "human" | "system"): Promise<string | object>;
    streamMessage(
        prompt: string, 
        address: string, 
        abortSignal?: AbortSignal,
        messageType?: "human" | "system"
    ): AsyncGenerator<LlmStreamChunk>;
    updateMessageById(
        address: string,
        executionId: string,
        executionState: "completed" | "pending" | "failed",
        txnHash?: string
    ): Promise<boolean>;
}

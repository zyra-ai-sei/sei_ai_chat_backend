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
    sendMessage(prompt: string, address: string): Promise<string | object>;
    streamMessage(prompt: string, address: string, abortSignal?: AbortSignal): AsyncGenerator<LlmStreamChunk>;
    updateToolStatus(
        address: string,
        toolId: number,
        status: "completed" | "aborted" | "unexecuted",
        hash?: string
    ): Promise<boolean>;
    updateMessageById(
        address: string,
        messageId: string,
        executionState: "completed" | "pending" | "failed",
        additionalData?: Record<string, any>
    ): Promise<boolean>;
    abortLatestTool(address: string): Promise<boolean>;
}

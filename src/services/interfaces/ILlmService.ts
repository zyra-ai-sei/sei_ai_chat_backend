export type LlmStreamChunk =
    | { type: "token"; text: string }
    | {
            type: "tool";
            toolName: string;
            content: string;
            tool_output: unknown;
        } | {
            type:"data";
            content: string;
            data_output: unknown;
        };

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
}


export interface ILlmService {
    initChat(address: string): Promise<void>;
    getChatHistory(address:string): Promise<any>;
    clearChat(address:string): Promise<void>;
    sendMessage(prompt: string, address: string): Promise<string | object>;
    updateToolStatus(address: string, toolId: number, status: 'completed' | 'aborted' | 'unexecuted', hash?: string): Promise<boolean>;
    abortLatestTool(address: string): Promise<boolean>;
}

import { FunctionResponse, GoogleGenAI, Part } from "@google/genai";
import fetch from "node-fetch";
import { inject, injectable } from "inversify";
import { ILlmService } from "./interfaces/ILlmService";
import env from "../envConfig";
import { TYPES } from "../ioc-container/types";
import { MCPService } from "./MCPService";
import { MCPToolWrapper } from "./MCPTool";
import OpenAI from "openai";

import { v4 as uuidv4 } from "uuid";
import { UserService } from "./UserService";
import { Chat } from "../types/history";
import { TOKEN_ADDRESS_MAPPING } from "../data/token";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { StructuredTool } from "@langchain/core/tools";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { ethers } from "ethers";
import { twapABI } from "./twapABI";
import { ChatOllama } from "@langchain/ollama";

// The prompt is static and can be defined once.
const systemPrompt = (
  address: string
) => `You are Zyra, a helpful assistant whose job is to automate, plan and execute trades on behalf of the user. You have access to the conversation history. Use it to answer the user's questions. User's address is ${address}. Note the following points:
- You are doing transactions on Sei chain. The native token on Sei is sei. 
- For transactions involving sei, it needs to be converted into an erc20 wsei token first(wrap), then the transaction can be executed. If sei is the destination, do the transaction in wsei then unwrap it into sei.
- For some transacrtions, you may get a response that allowance is insufficient, in that case, use the approve_erc20 tool to get the allowance.
- You can send multiple unsigned tx to the user, the user will sign them one by one. 
- For trades, suggest values, and strategies for the user.
- For token transfers, or tx involving token transfers, first check if the user has enough funds.
- Keep your responses brief, and to the point.`;
// const prompt = ChatPromptTemplate.fromMessages([
//   ["system", systemPrompt],
// ]);
@injectable()
export class LlmService implements ILlmService {
  private genAI: any;
  private model: string;
  private sessionId: string;
  private client: any;

  constructor(
    @inject(TYPES.MCPService) private mcpService: MCPService,
    @inject(TYPES.UserService) private userService: UserService
  ) {
    console.log("constructor");

    this.client = new MultiServerMCPClient({
      mcpServers: {
        sei_tools: {
          url: "http://localhost:3001/sse",
          transport: "sse",
        },
      },
    });
  }

  async initModel(userId: string, family: string, model: string) {
    try {
      if (family && model) {
        const apiKey = await this.userService.getModelKey(userId, family);
        if (apiKey) {
          switch (family) {
            case "gemini":
              this.genAI = new ChatGoogleGenerativeAI({
                model: model,
                temperature: 0,
                apiKey: apiKey,
              });
              return;

            case "openai":
              this.genAI = new ChatOpenAI({
                model: model,
                temperature: 0,
                apiKey: apiKey,
              });
              return;

            case "anthropic":
              this.genAI = new ChatAnthropic({
                model: model,
                temperature: 0,
                apiKey: apiKey,
              });
              return;
          }
        }
      }
      this.genAI = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        temperature: 0,
        apiKey: env.GEMINI_API_KEY,
      });
    } catch (err) {
      throw new Error(`Error in initializing model: ${err}`);
    }
  }

  async clearChat(address: string) {
    // Connect to your Atlas cluster or local Atlas deployment
    const client = new MongoClient(env.MONGO_URI);
    // Initialize the MongoDB checkpointer
    const checkpointer = new MongoDBSaver({ client });
    await checkpointer.deleteThread(address);
  }
  async getChatHistory(address: string): Promise<any> {
    if (!this.mcpService.isConnected()) {
      await this.mcpService.connectToMCP();
    }
    //only initialize if needed
    const chat = await this.initChat(address);

    if (!chat) throw new Error("Chat session not initialized");
    const initialState = await chat.getState({
      configurable: { thread_id: address },
    });
    const state = initialState?.values?.messages;
    const messages = state
      .filter((message) => {
        const hasValidId =
          message.constructor.name === "HumanMessage" ||
          message.constructor.name === "AIMessage";
        const hasContent =
          message?.content && typeof message?.content === "string";
        return hasValidId && hasContent;
      })
      .map((message) => ({
        type: message.constructor.name,
        content: message.content,
      }));
    return messages;
  }
  // Initialize and store a chat session for a sessionId (generate if not provided)
  async initChat(address: string): Promise<any> {
    const toolsResponse = await this.mcpService.getTools();
    const tools =
      toolsResponse?.result?.tools || toolsResponse?.tools || toolsResponse;
    const langGraphTools: StructuredTool[] = tools.map((tool: any) => {
      return new MCPToolWrapper(this.mcpService, tool);
    });
    // Connect to your Atlas cluster or local Atlas deployment
    const client = new MongoClient(env.MONGO_URI);
    // Initialize the MongoDB checkpointer
    const checkpointer = new MongoDBSaver({ client });
    const agent = createReactAgent({
      llm: this.genAI,
      tools: langGraphTools,
      stateModifier: systemPrompt(address),
      checkpointSaver: checkpointer,
    });

    return agent;
  }

  // Send a prompt to an existing chat session
  async sendMessage(
    prompt: string,
    address: string,
    family: string,
    model: string,
    userId: string
  ): Promise<string | object> {
    try {
      if (!this.mcpService.isConnected()) {
        await this.mcpService.connectToMCP();
      }
      await this.initModel(userId, family, model);
      //only initialize if needed
      const chat = await this.initChat(address);

      if (!chat) throw new Error("Chat session not initialized");

      const initialState = await chat.getState({
        configurable: { thread_id: address },
      });
      console.log("hi");
      console.dir(initialState);

      const agentFinalState = await chat.invoke(
        { messages: [new HumanMessage(prompt)] }, // Use the actual prompt instead of hardcoded message
        { configurable: { thread_id: address } } // Use address as thread_id
      );

      const newMessages = initialState?.values?.messages
        ? agentFinalState.messages.slice(initialState.values.messages.length)
        : agentFinalState.messages;
     

      const res = {
        chat: newMessages[newMessages.length - 1].content,
        tools: newMessages
          .filter((msg: any) => msg.constructor.name === "ToolMessage")
          .map((msg: any) => JSON.parse(msg?.content)?.result)
          .filter((msg: any) => msg != null),
      };
     
      return res;
    } catch (err) {
      throw new Error(`Error in sending message to llm: ${err}`);
    }
  }

  async addtxn(
    prompt: string,
    address: string,
    family: string,
    model: string,
    userId: string,
    orderId?: string
  ): Promise<string | object> {
    if (!this.mcpService.isConnected()) {
      await this.mcpService.connectToMCP();
    }

    await this.initModel(userId, family, model);

    //only initialize if needed
    const chat = await this.initChat(address);

    if (!chat) throw new Error("Chat session not initialized");

    const initialState = await chat.getState({
      configurable: { thread_id: address },
    });
    console.log("hi");
    console.dir(initialState);

    const agentFinalState = await chat.invoke(
      {
        messages: [
          new HumanMessage(
            prompt +
              " - get the details for this hash of just executed transaction by calling get_transaction tool. Give a breif output assuming the reader does not care about the technicalities. Give a link in block explorer as well in the format: https://seitrace.com/tx/<tx hash>. Then, continue with your previous task/process if its ongoing."
          ),
        ],
      }, // Use the actual prompt instead of hardcoded message
      { configurable: { thread_id: address } } // Use address as thread_id
    );

    const newMessages = initialState?.values?.messages
      ? agentFinalState.messages.slice(initialState.values.messages.length)
      : agentFinalState.messages;
    console.log("Agent final state:");
    console.dir(agentFinalState);
    console.log("New messages:");
    console.dir(newMessages);

    const res = {
      chat: newMessages[newMessages.length - 1].content,
      tools: newMessages
        .filter((msg: any) => msg.constructor.name === "ToolMessage")
        .map((msg: any) => JSON.parse(msg?.content)?.result),
    };

    console.dir(
      JSON.parse(
        newMessages
          .filter((msg: any) => msg.constructor.name === "ToolMessage")
          .map((msg: any) => JSON.parse(msg?.content)?.result)[0].content[0]
          .text
      ),
      { depth: null }
    );

    if (
      newMessages.filter((msg: any) => msg.constructor.name === "ToolMessage")
    ) {
      try {
        const txObject = JSON.parse(
          newMessages
            .filter((msg: any) => msg.constructor.name === "ToolMessage")
            .map((msg: any) => JSON.parse(msg?.content)?.result)[0].content[0]
            .text
        );
        await this.userService.addUserTransaction(address, {
          hash: txObject?.hash,
          value: txObject?.value,
          token: txObject?.token,
          gas: txObject?.gas,
          gasPrice: txObject?.gasPrice,
          from: txObject?.from,
          to: txObject?.to,
          type: txObject?.type,
          input: txObject?.input,
          blockNumber: txObject?.blockNumber,
          orderId: orderId ? orderId : undefined,
        });
      } catch (err) {
        console.error("Failed to parse transaction JSON:", err);
      }
    }
    return res;
  }
}

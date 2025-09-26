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
// LangGraph and LangChain imports for custom graph
import { StateGraph, StateGraphArgs, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, BaseMessage, AIMessage } from "@langchain/core/messages";
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

// The prompt is static and can be defined once.
const systemPrompt = (address:string)=> `You are Zyra, a helpful assistant whose job is to automate, plan and execute trades on behalf of the user. You have access to the conversation history. Use it to answer the user's questions. User's address is ${address}. Note the following points:
- You are doing transactions on Sei chain. The native token on Sei is sei. 
- For transactions involving sei, it needs to be converted into an erc20 wsei token first(wrap), then the transaction can be executed. If sei is the destination, do the transaction in wsei then unwrap it into sei.
- For some transacrtions, you may get a response that allowance is insufficient, in that case, use the approve_erc20 tool to get the allowance.
- You can send multiple unsigned tx to the user, the user will sign them one by one. 
- For trades, suggest values, and strategies for the user.
- For token transfers, or tx involving token transfers, first check if the user has enough funds.
- Keep your responses brief, and to the point.`;

/**
 * Define the state for our graph.
 * It will contain a list of messages.
 */
interface AgentState {
  messages: BaseMessage[];
}

/**
 * Define the channels for our graph state.
 * The `messages` channel will be updated by concatenating new messages.
 */
const graphState: StateGraphArgs<AgentState>["channels"] = {
  messages: {
    value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => [],
  },
};


@injectable()
export class LlmService implements ILlmService {
  private genAI: ChatGoogleGenerativeAI;
  private model: string;
  private sessionId: string;
  private client: any;

  constructor(
    @inject(TYPES.MCPService) private mcpService: MCPService,
    @inject(TYPES.UserService) private userService: UserService
  ) {
    console.log("constructor");
    this.genAI = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-flash", // Updated model
      temperature: 0,
      apiKey: env.GEMINI_API_KEY,
    });
    this.client = new MultiServerMCPClient({
      mcpServers: {
        sei_tools: {
          url: "http://localhost:3001/sse",
          transport: "sse",
        },
      },
    });
  }

  async clearChat(address:string){
    // Connect to your Atlas cluster or local Atlas deployment
    const client = new MongoClient(env.MONGO_URI);
    // Initialize the MongoDB checkpointer
    const checkpointer = new MongoDBSaver({ client });
    await checkpointer.deleteThread(address);
    
  }
  async getChatHistory(address:string): Promise<any> {
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
        .filter(message => {
          const hasValidId = message.constructor.name === 'HumanMessage' || message.constructor.name === 'AIMessage';
          const hasContent = message?.content && 
                            typeof message?.content === 'string';
          return hasValidId && hasContent;
        })
        .map(message => ({
          type: message.constructor.name,
          content: message.content
        }));
    return messages

  }

  // Initialize and store a chat session for a sessionId
  async initChat(address: string): Promise<any> {
    const toolsResponse = await this.mcpService.getTools();
    const tools =
      toolsResponse?.result?.tools || toolsResponse?.tools || toolsResponse;
    const langGraphTools: StructuredTool[] = tools.map((tool: any) => {
      return new MCPToolWrapper(this.mcpService, tool);
    });

    // Bind the tools to the model
    const modelWithTools = this.genAI.bindTools(langGraphTools);
    
    // ## Define Graph Nodes and Edges ##

    // 1. The Agent Node: Calls the model to decide the next step.
    const callModel = async (state: AgentState) => {
      const { messages } = state;
      const prompt = ChatPromptTemplate.fromMessages([
          ["system", systemPrompt(address)],
          new MessagesPlaceholder("messages"),
      ]);
      const chain = prompt.pipe(modelWithTools);
      const response = await chain.invoke({ messages });
      // We return a list, because this will be appended to the state
      return { messages: [response] };
    };

    // 2. The Tool Node: Executes the tools chosen by the agent.
    const toolNode = new ToolNode(langGraphTools);

    // 3. Conditional Edge Logic: Determines whether to continue or end.
    const shouldContinue = (state: AgentState) => {
      const { messages } = state;
      const lastMessage = messages[messages.length - 1];
      // If the last message is an AIMessage with tool calls, route to the 'tools' node
      if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        return "tools";
      }
      // Otherwise, end the execution
      return END;
    };

    // ## Construct the Graph ##
    // ## Construct the Graph ##
const workflow = new StateGraph<AgentState>({ channels: graphState });

// Add the nodes
workflow.addNode("agent", callModel);
workflow.addNode("tools", toolNode);

// Set the entrypoint to the 'agent' node
workflow.setEntryPoint("agent");

// Add the conditional edge from the 'agent' node
workflow.addConditionalEdges("agent", shouldContinue, {
  tools: "tools", // If the agent calls a tool, go to the 'tools' node
  [END]: END,     // Otherwise, end the graph
});

// Add a regular edge to loop from the 'tools' node back to the 'agent' node
workflow.addEdge("tools", "agent");

    // ## Compile the Graph with a Checkpointer ##
    const client = new MongoClient(env.MONGO_URI);
    const checkpointer = new MongoDBSaver({ client });

    const app = workflow.compile({ checkpointer });
    
    return app;
  }

  // Send a prompt to an existing chat session
  async sendMessage(prompt: string, address: string): Promise<string | object> {
    if (!this.mcpService.isConnected()) {
      await this.mcpService.connectToMCP();
    }
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
    console.log("Agent final state:");
    console.dir(agentFinalState);
    console.log("New messages:");
    console.dir(newMessages);

    const res = {
      chat: newMessages[newMessages.length - 1].content,
      tools: newMessages
        .filter((msg: any) => msg.constructor.name === "ToolMessage")
        .map((msg: any) => JSON.parse(msg?.content)?.result).filter((msg: any) => msg!=null),
    };
    console.log(
      "Response from agent:",
      res,
      newMessages.filter((msg: any) => msg.constructor.name === "ToolMessage")
    );
    return res;
  }

  
  async addtxn(prompt: string, address: string, orderId?:string): Promise<string | object> {
    if (!this.mcpService.isConnected()) {
      await this.mcpService.connectToMCP();
    }
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

    console.log("this is your final state");
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
          orderId: orderId?orderId:undefined,
        });
      } catch (err) {
        console.error("Failed to parse transaction JSON:", err);
      }
    }
    return res;
  }
}
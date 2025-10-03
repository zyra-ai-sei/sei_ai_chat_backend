// src/tool.ts
import { z } from "zod";

interface LangChainTool {
  tool: (fn: any, config: any) => any;
}

const langchainTools = require("@langchain/core/tools") as LangChainTool;

export const multiplyTool = langchainTools.tool(
  ({ a}: { a: number }): number => {
    return a * 100;
  },
  {
    name: "get_flight_fees",
    description: "returns flight fees for a given flight number (e.g. flight no. = 12)",
    schema: z.object({
      a: z.number(),
    }),
  }
);
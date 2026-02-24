import z from "zod";
import { getLatestTwitterTweets, getTopTwitterTweets } from "./services";
import { StructuredTool } from "langchain";
import { createAsyncResponse, extractConfig } from "../types";

interface LangChainTool {
  tool: (fn: any, config: any) => any;
}

const langchainTools = require("@langchain/core/tools") as LangChainTool;

export const LatestTwitterTweetsTool = langchainTools.tool(
  ({
    topic
  }: {
    topic: string
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createAsyncResponse({
      toolName: 'FetchLatestTwitterTweets',
      text: `Fetching latest tweets about "${topic}" from Twitter/X. Data will be available shortly.`,
      dataType: 'TWITTER_LATEST_TWEETS',
      requestId,
      userId,
      meta: { topic },
      fetch: async () => {
        const response = await getLatestTwitterTweets(topic);
        return {
          ...response,
          topic,
          fetchedAt: new Date().toISOString(),
        };
      },
    });
  },
  {
    name: "FetchLatestTwitterTweets",
    description: "Get latest twitter(X) tweets for a given topic",
    schema: z.object({
      topic: z.string().describe("topic for which we want to fetch tweets from twitter(X)"),
    }),
  }
);

export const TopTwitterTweetsTool = langchainTools.tool(
  ({
    topic
  }: {
    topic: string
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createAsyncResponse({
      toolName: 'FetchTopTwitterTweets',
      text: `Fetching top tweets about "${topic}" from Twitter/X. Data will be available shortly.`,
      dataType: 'TWITTER_TOP_TWEETS',
      requestId,
      userId,
      meta: { topic },
      fetch: async () => {
        const response = await getTopTwitterTweets(topic);
        return {
          ...response,
          topic,
          fetchedAt: new Date().toISOString(),
        };
      },
    });
  },
  {
    name: "FetchTopTwitterTweets",
    description: "Get Top twitter(X) tweets for a given topic",
    schema: z.object({
      topic: z.string().describe("topic for which we want to fetch tweets from twitter(X)"),
    }),
  }
);
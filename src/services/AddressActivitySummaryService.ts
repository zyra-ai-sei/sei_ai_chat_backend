import { inject, injectable } from "inversify";
import { AddressActivitySummary } from "../database/mongo/models/ActivitySummary";
import { TokenTransfer } from "../database/mongo/models/TokenTransfer";
import { TYPES } from "../ioc-container/types";
import { LlmService } from "./LlmService";

@injectable()
export class AddressActivitySummaryService {
  constructor(
    @inject(TYPES.LlmService) private llmService: LlmService
  ) {}

  async generateDailySummary(trackedAddress: string, date: string) {
    // Get all transfers for this address for the given day
    const dayjs = require('dayjs');
    const start = dayjs(date).startOf("day").unix();
    const end = dayjs(date).endOf("day").unix();
    const transfers = await TokenTransfer.find({
      trackedAddress,
      timestamp: { $gte: start, $lte: end },
    });

    if (!transfers.length) return null;

    // Prepare prompt for LLM
    const prompt = `Analyze the following token transfer activity for address ${trackedAddress} on ${date}:
${JSON.stringify(transfers, null, 2)}

Generate a summary of what this address is doing, their likely sentiment, and the next probable action. Be concise and insightful. keep it less than 20 words and don't add any question at the end`;

    const response = await this.llmService.statelessChat(prompt, trackedAddress);
    const summary = response[response.length - 1].content;

    // Upsert summary
    await AddressActivitySummary.findOneAndUpdate(
      { trackedAddress, date },
      { summary, generatedAt: new Date() },
      { upsert: true, new: true }
    );
    return summary;
  }

  async getSummary(trackedAddress: string) {
    return AddressActivitySummary.findOne({ trackedAddress });
  }
}

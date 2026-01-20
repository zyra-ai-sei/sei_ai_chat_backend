import { controller, httpGet, request } from "inversify-express-utils";
import { inject } from "inversify";
import { TYPES } from "../ioc-container/types";
import { AddressActivitySummaryService } from "../services/AddressActivitySummaryService";
import { Request } from "express";

@controller("/address-activity")
export class AddressActivitySummaryController {
  constructor(
    @inject(TYPES.AddressActivitySummaryService)
    private summaryService: AddressActivitySummaryService
  ) {}

  // Public API: GET /address-activity/summary?address=0x...&date=YYYY-MM-DD
  @httpGet("/summary")
  private async getSummary(@request() req: Request) {
    const { address } = req.query;
    if (!address) {
      return { success: false, message: "address required" };
    }
    const summary = await this.summaryService.getSummary(String(address));
    return summary;
  }
}

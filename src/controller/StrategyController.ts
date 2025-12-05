import { controller, httpPost, requestBody } from "inversify-express-utils";
import axios from "axios";

@controller("/strategy")
export class StrategyController {

  @httpPost("/dca")
  async simulateDCA(
    @requestBody() body: {
      coin: string;
      total_investment: number;
      frequency: string;
      duration_days: number;
    }
  ) {
    try {
      const response = await axios.post(
        "http://localhost:3001/v1/strategies/dca/simulate",
        body
      );

      return response.data;  // forward full result to frontend
    } catch (err: any) {
      console.error("Strategy engine error:", err);
      throw new Error("Failed to simulate DCA");
    }
  }
}

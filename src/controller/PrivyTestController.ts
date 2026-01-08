import { controller, httpGet } from "inversify-express-utils";

/**
 * Test controller WITHOUT authentication
 * Used to verify Privy transaction infrastructure is loaded
 */
@controller("/privy-test")
export class PrivyTestController {
  constructor() {
    console.log("🧪 PrivyTestController initialized!");
  }

  @httpGet("/health")
  async health() {
    console.log("✅ Privy test health endpoint hit!");
    return {
      success: true,
      message: "Privy infrastructure is working!",
      timestamp: new Date().toISOString()
    };
  }
}

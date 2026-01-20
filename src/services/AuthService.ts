import { ethers, Signature } from "ethers";
import { inject, injectable } from "inversify";
import { httpGet } from "inversify-express-utils";
import { TYPES } from "../ioc-container/types";
import { UserOp } from "../database/mongo/UserOp";
import env from "../envConfig";
import jwt from "jsonwebtoken";
import RedisService from "../utils/redis/RedisService";
import { createHash } from "crypto";
import { PrivyClient } from "@privy-io/node";

@injectable()
export class AuthService {
  private privy: PrivyClient;
  private verificationKey: String;
  constructor(
    @inject(TYPES.UserOp) private userOp: UserOp,
    @inject(TYPES.RedisService) private redisService: RedisService
  ) {
    this.privy = new PrivyClient({
      appId: env.PRIVY_APP_ID,
      appSecret: env.PRIVY_APP_SECRET,
      jwtVerificationKey: env.PRIVY_VERIFICATION_KEY,
    });
    this.verificationKey = env.PRIVY_VERIFICATION_KEY;
  }

  async login(
    userId,
    embeddedAddress: string,
    injectedAddress: string,
    token: string
  ): Promise<boolean> {
    let verifiedClaims;
    try {
      const key = this.verificationKey.replace(/\\n/g, "\n");
      verifiedClaims = jwt.verify(token, key, {
        issuer: "privy.io",
        audience: env.PRIVY_APP_ID /* your Privy App ID */,
      });
      
    } catch (err) {
      throw new Error(`Unverifieble token !`);
    }

    if (verifiedClaims.sub != userId) {
      throw new Error(`Invalid user token`);
    }

    // Normalize addresses to checksummed format
    const normalizedInjected = injectedAddress ? ethers.getAddress(injectedAddress) : "";
    const normalizedEmbedded = embeddedAddress ? ethers.getAddress(embeddedAddress) : "";

    let userData = await this.userOp.getUserById(userId);

    if (!userData || !userData?._id) {
      await this.userOp.updateUserData(userId, {
        userId: userId,
        injectedAddress: normalizedInjected,
        embeddedAddress: normalizedEmbedded,
      });
      userData = await this.userOp.getUserById(userId);
    }
    // Store data against userId with 1 month TTL (30 days * 24 hours * 60 minutes * 60 seconds)
    const oneMonthInSeconds = 90 * 24 * 60 * 60;
    const redisValue = JSON.stringify({
      embeddedAddress: normalizedEmbedded,
      injectedAddress: normalizedInjected,
    });

    await this.redisService.setValue(userId, redisValue, oneMonthInSeconds);

    return true;
  }

  async verifyUserSession(authHeader?: string): Promise<{
    userId: string;
    embeddedAddress: string;
    injectedAddress: string;
  }> {
    const { userId, embeddedAddress, injectedAddress } =
      await this.verifyAuthToken(authHeader);
    return { userId, embeddedAddress, injectedAddress };
  }

  private async verifyAuthToken(authHeader?: string): Promise<{
    userId: string;
    embeddedAddress: string;
    injectedAddress: string;
  }> {
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Invalid Authorization Header");
    }

    const token = authHeader.split(" ")[1];

    // First verify the token
    let verifiedClaims;
    try {
 const key = this.verificationKey.replace(/\\n/g, "\n");
      verifiedClaims = jwt.verify(token, key, {
        issuer: "privy.io",
        audience: env.PRIVY_APP_ID /* your Privy App ID */,
      });
          } catch (error: any) {
      throw new Error("Token has expired or is invalid");
    }

    // Get userId from the verified token claims
    const userId = verifiedClaims.sub;

    // Retrieve user data from Redis using userId
    const redisData = await this.redisService.getValue(userId);

    if (!redisData) {
      throw new Error("User session not found. Please login again.");
    }

    const { embeddedAddress, injectedAddress } = JSON.parse(redisData);
    
    // Normalize addresses to checksummed format on retrieval as well
    const normalizedEmbedded = embeddedAddress ? ethers.getAddress(embeddedAddress) : "";
    const normalizedInjected = injectedAddress ? ethers.getAddress(injectedAddress) : "";

    return {
      userId,
      embeddedAddress: normalizedEmbedded,
      injectedAddress: normalizedInjected,
    };
  }
}

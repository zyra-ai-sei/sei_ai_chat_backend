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
  constructor(
    @inject(TYPES.UserOp) private userOp: UserOp,
    @inject(TYPES.RedisService) private redisService: RedisService
  ) {
    this.privy = new PrivyClient({
      appId: env.PRIVY_APP_ID,
      appSecret: env.PRIVY_APP_SECRET,
      // appSecret: "",
      jwtVerificationKey: env.PRIVY_VERIFICATION_KEY,
    });
  }

  async login(
    userId,
    embeddedAddress: string,
    injectedAddress: string,
    token: string
  ): Promise<boolean> {
    let verifiedClaims;
    try {
      // console.log("privy", this.privy);

      // verifiedClaims = await this.privy.utils().auth().verifyAuthToken(token);
      const verificationKey = env.PRIVY_VERIFICATION_KEY.replace(
        /\\n/g,
        "\n"
      );
      console.log('verification key', verificationKey);
      verifiedClaims = jwt.verify(token, verificationKey, {
        issuer: 'privy.io',
        audience: env.PRIVY_APP_ID
      });
      // console.log(decoded);
      console.log('verifying token', token);
      // verifiedClaims = await this.privy.utils().auth().verifyAuthToken(token);
    } catch (err) {
      throw new Error(`Unverifieble token !${err}`);
    }

    if (verifiedClaims.sub != userId) {
      throw new Error(`Invalid user token`);
    }

    let userData = await this.userOp.getUserById(userId);

    if (!userData || !userData?._id) {
      await this.userOp.updateUserData(userId, {
        userId: userId,
        injectedAddress,
        embeddedAddress,
      });
      userData = await this.userOp.getUserById(userId);
    }
    
    // Store data against userId with 1 month TTL (30 days * 24 hours * 60 minutes * 60 seconds)
    const oneMonthInSeconds = 30 * 24 * 60 * 60;
    const redisValue = JSON.stringify({
      embeddedAddress: embeddedAddress || '',
      injectedAddress: injectedAddress || ''
    });
    
    await this.redisService.setValue(
      userId,
      redisValue,
      oneMonthInSeconds
    );

    return true;
  }

  async verifyUserSession(authHeader?: string): Promise<{ userId: string, embeddedAddress: string, injectedAddress:string }> {
    const { userId, embeddedAddress, injectedAddress } = await this.verifyAuthToken(authHeader);
    return { userId, embeddedAddress, injectedAddress };
  }

  private async verifyAuthToken(
    authHeader?: string
  ): Promise<{ userId: string; embeddedAddress: string, injectedAddress: string }> {
    if (!authHeader?.startsWith("Bearer ")) {
      console.log(authHeader);
      throw new Error("Invalid Authorization Header");
    }

    const token = authHeader.split(" ")[1];

    // First verify the token
    let verifiedClaims;
    try {
      const verificationKey = env.PRIVY_VERIFICATION_KEY.replace(
        /\\n/g,
        "\n"
      );
      verifiedClaims = jwt.verify(token, verificationKey, {
        issuer: 'privy.io',
        audience: env.PRIVY_APP_ID
      });
      // verifiedClaims = await this.privy.utils().auth().verifyAuthToken(token);
    } catch (error: any) {
      throw new Error("Token has expired or is invalid");
    }

    console.log('verified claims',verifiedClaims)

    // Get userId from the verified token claims
    const userId = verifiedClaims.sub;
    
    // Retrieve user data from Redis using userId
    const redisData = await this.redisService.getValue(userId);
    
    if (!redisData) {
      throw new Error("User session not found. Please login again.");
    }

    const { injectedAddress, embeddedAddress } = JSON.parse(redisData);
    console.log(redisData);
    console.log('retrieved from redis', { injectedAddress, embeddedAddress });

    return { 
      userId,
      embeddedAddress: embeddedAddress || "", 
      injectedAddress: injectedAddress || "" 
    };
  }

  /**
   * Get user's wallets with delegated signers from Privy
   * These are wallets that have authorized your app to execute transactions on behalf of the user
   * 
   * @param userId - The user's DID (e.g., 'did:privy:...')
   * @returns Array of wallet objects with signers
   */
  async getUserWalletsWithSigners(userId: string) {
    try {
      // Get user data from Privy
      const user = await this.privy.users()._get(userId);

      // Console log the entire user object
      console.log('User data from Privy:', JSON.stringify(user, null, 2));

      // Filter for wallets with delegated signers
      const walletsWithSessionSigners = user.linked_accounts.filter(
        (account) => account.type === 'wallet' && 'id' in account && account.delegated
      );

      return walletsWithSessionSigners;
    } catch (error) {
      console.error('Error fetching user wallets from Privy:', error);
      throw new Error('Failed to fetch user wallets');
    }
  }
}

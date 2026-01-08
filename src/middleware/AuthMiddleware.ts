import { inject, injectable } from "inversify";
import { BaseMiddleware } from "inversify-express-utils";
import { TYPES } from "../ioc-container/types";
import { AuthService } from "../services/AuthService";
import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../types/requestTypes";

@injectable()
export default class AuthMiddleware extends BaseMiddleware {
  constructor(@inject(TYPES.AuthService) private authService: AuthService) {
    super();
  }

  public async handler(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    console.log("🟡 [AuthMiddleware] Checking authentication...");
    console.log("🟡 [AuthMiddleware] Authorization header:", req.headers.authorization?.substring(0, 50) + "...");

    try {
      const { userId, embeddedAddress, injectedAddress } = await this.authService.verifyUserSession(
        req.headers.authorization
      );
      console.log("✅ [AuthMiddleware] Auth successful, userId:", userId);

      req.userId = userId;
      req.embeddedAddress = embeddedAddress;
      req.injectedAddress = injectedAddress;
      console.log("User id: ", userId);
      console.log("embedded address: ", embeddedAddress);
      console.log("injected address: ", injectedAddress);
      next();
    } catch (err) {
      console.error("❌ [AuthMiddleware] Auth failed:", err);
      next(err);
    }
  }
}

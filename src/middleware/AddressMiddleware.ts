import { injectable } from "inversify";
import { BaseMiddleware } from "inversify-express-utils";
import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../types/requestTypes";
import { getSafeAddress } from "../utils/address";

@injectable()
export class AddressMiddleware extends BaseMiddleware {
  public async handler(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const queryAddress = req.query.address as string;
      
      if (!queryAddress) {
        return next(); // Or throw error if address is mandatory
      }

      const address = getSafeAddress(queryAddress);
      const embeddedAddress = getSafeAddress(req.embeddedAddress || "");
      const injectedAddress = getSafeAddress(req.injectedAddress || "");

      if (address !== embeddedAddress && address !== injectedAddress) {
        throw new Error(`User request not authorized`);
      }

      // Optionally, update req.query.address to the safe version
      req.query.address = address;
      
      next();
    } catch (err) {
      next(err);
    }
  }
}

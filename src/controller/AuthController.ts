import { controller, httpGet, httpPost, request } from "inversify-express-utils";
import { SIGN_TXT } from "../config/constants";
import { type Request } from "express";
import { ethers } from "ethers";
import { inject } from "inversify";
import { TYPES } from "../ioc-container/types";
import { AuthService } from "../services/AuthService";


@controller('/auth')
export class AuthController {
    constructor(@inject(TYPES.AuthService) private authservice:AuthService){}

    @httpGet('/login')
    private loginNounce(): {message: string} {
        const timestamp= new Date().getTime();
        const message = `${SIGN_TXT}${timestamp}`
        return {message}
    }

    @httpPost('/login')
    private async login( @request() req:Request<
    unknown,
    unknown,
    {
        userId: string
        embeddedAddress: string
        injectedAddress: string
        token:string
    }
    >): Promise<boolean> {
       const {userId, embeddedAddress, injectedAddress, token} = req.body;
       const res = await this.authservice.login(userId,embeddedAddress,injectedAddress, token);
       return res
    }

      @httpPost('/verify')
    private async verify(@request() req: Request): Promise<boolean> {
        const userAddress = await this.authservice.verifyUserSession(
            req.headers.authorization,
        )
        return Boolean(userAddress)
    }
}
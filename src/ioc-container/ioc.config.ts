import { Container } from "inversify";
import Hello from "../controller/Hello";
import { TYPES } from "./types";
import { UserOp } from "../database/mongo/UserOp";
import RedisService from "../utils/redis/RedisService";
import { TYPE } from "inversify-express-utils";
import { AuthController } from "../controller/AuthController";
import { AuthService } from "../services/AuthService";
import AuthMiddleware from "../middleware/AuthMiddleware";
import { LlmController } from "../controller/LlmController";
import { LlmService } from "../services/LlmService";
import { ILlmService } from "../services/interfaces/ILlmService";
import { MCPService } from "../services/MCPService";
import { UserService } from "../services/UserService";
import { UserController } from "../controller/UserController";
import { TransactionService } from "../services/TransactionService";
import { TransactionController } from "../controller/TransactionController";
import { CryptoMarketController } from "../controller/CryptoMarketController";
import { CryptoMarketService } from "../services/CryptoMarketService";
import { ICryptoMarketService } from "../services/interfaces/ICryptoMarketService";
import { PortfolioController } from "../controller/PortfolioController";
import { PortfolioService } from "../services/PortfolioService";

const container = new Container()

container.bind<AuthController>(TYPES.AuthController).to(AuthController)
container.bind<LlmController>(TYPES.LlmController).to(LlmController)
container.bind<UserController>(TYPES.UserController).to(UserController)
container.bind<TransactionController>(TYPES.TransactionController).to(TransactionController);
container.bind<CryptoMarketController>(TYPES.CryptoMarketController).to(CryptoMarketController);
container.bind<PortfolioController>(TYPES.PortfolioController).to(PortfolioController);

container.bind<AuthService>(TYPES.AuthService).to(AuthService)
container.bind<ILlmService>(TYPES.LlmService).to(LlmService).inSingletonScope()
container.bind<RedisService>(TYPES.RedisService).to(RedisService)
container.bind<MCPService>(TYPES.MCPService).to(MCPService).inSingletonScope()
container.bind<UserService>(TYPES.UserService).to(UserService);
container.bind<TransactionService>(TYPES.TransactionService).to(TransactionService);
container.bind<ICryptoMarketService>(TYPES.CryptoMarketService).to(CryptoMarketService);
container.bind<PortfolioService>(TYPES.PortfolioService).to(PortfolioService)

container.bind<Hello>(TYPES.Hello).to(Hello);
container.bind<UserOp>(TYPES.UserOp).to(UserOp)

container.bind<AuthMiddleware>(TYPES.AuthMiddleware).to(AuthMiddleware)

export default container
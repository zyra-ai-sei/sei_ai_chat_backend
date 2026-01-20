import { Container } from "inversify";
import Hello from "../controller/Hello";
import { TYPES } from "./types";
import { UserOp } from "../database/mongo/UserOp";
import RedisService from "../utils/redis/RedisService";
import { TYPE } from "inversify-express-utils";
import { AuthController } from "../controller/AuthController";
import { AuthService } from "../services/AuthService";
import AuthMiddleware from "../middleware/AuthMiddleware";
import NetworkMiddleware from "../middleware/NetworkMiddleware";
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
import { ethers } from "ethers";
import env from "../envConfig";
import { TwapEventService } from "../services/event-listener/TwapEventService";
import { CronService } from "../jobs/cron";
import { OrderOp } from "../database/mongo/OrderOp";
import { OrderService } from "../services/OrderService";
import { OrderController } from "../controller/OrderController";
import { TokenTrackingController } from "../controller/TokenTrackingController";
import { TokenTrackingService } from "../services/TokenTrackingService";
import { SocketService } from "../services/SocketService";
import { AddressActivitySummaryController } from "../controller/AddressActivitySummaryController";
import { AddressActivitySummaryService } from "../services/AddressActivitySummaryService";

const container = new Container();

container.bind<AuthController>(TYPES.AuthController).to(AuthController);
container.bind<LlmController>(TYPES.LlmController).to(LlmController);
container.bind<UserController>(TYPES.UserController).to(UserController);
container
  .bind<TransactionController>(TYPES.TransactionController)
  .to(TransactionController);
container
  .bind<CryptoMarketController>(TYPES.CryptoMarketController)
  .to(CryptoMarketController);
container
  .bind<PortfolioController>(TYPES.PortfolioController)
  .to(PortfolioController);
container.bind<OrderController>(TYPES.OrderController).to(OrderController);
container.bind<TokenTrackingController>(TYPES.TokenTrackingController).to(TokenTrackingController);
container.bind<AddressActivitySummaryController>(TYPES.AddressActivitySummaryController).to(AddressActivitySummaryController);

container.bind<AuthService>(TYPES.AuthService).to(AuthService);
container.bind<ILlmService>(TYPES.LlmService).to(LlmService).inSingletonScope();
container
  .bind<RedisService>(TYPES.RedisService)
  .to(RedisService)
  .inSingletonScope();
container.bind<MCPService>(TYPES.MCPService).to(MCPService).inSingletonScope();
container.bind<UserService>(TYPES.UserService).to(UserService);
container
  .bind<TransactionService>(TYPES.TransactionService)
  .to(TransactionService)
  .inSingletonScope();
container
  .bind<ICryptoMarketService>(TYPES.CryptoMarketService)
  .to(CryptoMarketService);
container.bind<PortfolioService>(TYPES.PortfolioService).to(PortfolioService);
container
  .bind<TwapEventService>(TYPES.TwapEventService)
  .to(TwapEventService)
  .inSingletonScope();
container
  .bind<CronService>(TYPES.CronService)
  .to(CronService)
  .inSingletonScope();
container.bind<OrderService>(TYPES.OrderService).to(OrderService);
container.bind<TokenTrackingService>(TYPES.TokenTrackingService).to(TokenTrackingService).inSingletonScope();
container.bind<SocketService>(TYPES.SocketService).to(SocketService).inSingletonScope();
container.bind<AddressActivitySummaryService>(TYPES.AddressActivitySummaryService).to(AddressActivitySummaryService).inSingletonScope();

container.bind<Hello>(TYPES.Hello).to(Hello);
container.bind<UserOp>(TYPES.UserOp).to(UserOp);
container.bind<OrderOp>(TYPES.OrderOp).to(OrderOp);

container.bind<AuthMiddleware>(TYPES.AuthMiddleware).to(AuthMiddleware);
container.bind<NetworkMiddleware>(TYPES.NetworkMiddleware).to(NetworkMiddleware);

container
  .bind<ethers.JsonRpcProvider>(TYPES.Web3Provider)
  .toConstantValue(new ethers.JsonRpcProvider(env.RPC_URL));
container
  .bind<ethers.WebSocketProvider>(TYPES.WebSocketProvider)
  .toConstantValue(new ethers.WebSocketProvider(env.WSS_URL));

export default container;

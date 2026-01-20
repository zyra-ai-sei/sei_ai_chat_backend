import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import { InversifyExpressServer } from "inversify-express-utils";
import { Container } from "inversify";
import env from "./envConfig";
import container from "./ioc-container/ioc.config";
import mongoose from "mongoose";
import http from "http";
import { responseFormatter } from "./middleware/ResponseFormatter";
import { Server as SocketServer } from "socket.io";

class ArrowServer {
  private readonly port: string | number;
  public app: Application;
  public readonly server: InversifyExpressServer;
  private io: SocketServer;
  private httpServer: http.Server;
  /**
   *
   * @param container - The Inversify container for dependency injection
   */
  constructor(container: Container) {
    // const expressApp = http2Express(express);
    this.server = new InversifyExpressServer(container, null, {
      rootPath: "/v1",
    });
    this.server.setConfig((app) => {
      app.use(express.json());
      app.use(cors());
      app.use(function (req: Request, res: Response, next: NextFunction) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Allow-Credentials", "true");

        next();
      });
      app.use(/\/((?!webhooks).)*/, responseFormatter);
    });
    this.app = this.server.build();
    // this.app.use(errorHandler)
    this.port = env.PORT;

    // Create HTTP server
    this.httpServer = http.createServer(this.app);

    // Initialize Socket.IO
    this.io = new SocketServer(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
      transports: ["polling", "websocket"],
    });

    // Inject IO into SocketService
    const { TYPES } = require("./ioc-container/types");
    const socketService = container.get<any>(TYPES.SocketService);
    socketService.setIO(this.io);

    this.io.on("connection", (socket) => {
      console.log("User connected:", socket.id);
      
      socket.on("join", (userId) => {
        console.log(`User ${userId} joined room`);
        socket.join(userId);
      });

      socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
      });
    });
  }

  public getIO(): SocketServer {
    return this.io;
  }

  private async setup(): Promise<void> {
    try {
      await mongoose.connect(env.MONGO_URI);
      console.log("mongoose connected successfully");
    } catch (err) {
      throw new Error("error in connecting to mongoDB");
    }
  }

  public async start(): Promise<void> {
    await this.setup();

    // Start cron jobs
    this.startCronJobs();

    this.httpServer.listen(this.port, () => {
      console.log(`server is listening on port ${this.port}`);
    });
  }

  private startCronJobs(): void {
    try {
      const { TYPES } = require("./ioc-container/types");

      // Start blockchain event listener
      const twapEventService = container.get<any>(TYPES.TwapEventService);
      twapEventService.startListener();

      // Start transaction monitoring listener
      const transactionService = container.get<any>(TYPES.TransactionService);
      transactionService.startListener();

      // Start token tracking service
      const tokenTrackingService = container.get<any>(TYPES.TokenTrackingService);
      tokenTrackingService.startTracking();

      // Start cron jobs
      const cronService = container.get<any>(TYPES.CronService);
      cronService.startCronJobs();
    } catch (error) {
      console.error("Failed to start cron jobs:", error);
    }
  }
}

const arrowServer = new ArrowServer(container);
arrowServer.start();

arrowServer.app.get("/", (req, res) => {
  res.send("Hello World ");
});

arrowServer.app.emit("new2chat", "hi there");

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {

  try {
    // Import TYPES to get the correct symbol
    const { TYPES } = await import("./ioc-container/types");
    const llmService = container.get<any>(TYPES.LlmService);
    if (llmService && typeof llmService.dispose === "function") {
      await llmService.dispose();
    }
    await mongoose.connection.close();
    console.log("Database connections closed");
    process.exit(0);
  } catch (error) {
    console.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

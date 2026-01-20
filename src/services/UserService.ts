import { inject, injectable } from "inversify";
import { TYPES } from "../ioc-container/types";
import { UserOp } from "../database/mongo/UserOp";
import { Chat } from "../types/history";
import { Transaction } from "../types/user";
import { ethers } from "ethers";
import env from "../envConfig";
import { twapABI } from "./twapABI";

interface OrderBid {
  time: number;
  taker: string;
  exchange: string;
  dstAmount: string;
  dstFee: string;
  data: string;
}

interface OrderAsk {
  exchange: string;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  srcBidAmount: string;
  dstMinAmount: string;
  deadline: number;
  bidDelay: number;
  fillDelay: number;
  data: string;
}

interface Order {
  id: string;
  status: number;
  time: number;
  filledTime: number;
  srcFilledAmount: string;
  maker: string;
  ask: OrderAsk;
  bid: OrderBid;
}
@injectable()
export class UserService {
  constructor(@inject(TYPES.UserOp) private userOp: UserOp) {}

  async getUserInfo(address: string) {
    const user = await this.userOp.getUserHistory(address);
    return user;
  }

  async addUserHistory(address: string, chats: Chat[]) {
    const result = await this.userOp.updateUserHistory(address, chats);
    return result;
  }

  async addUserTransaction(userId: string, transaction: Partial<Transaction>) {
    const result = await this.userOp.updateUserTransaction(
      userId,
      transaction
    );
    return result;
  }

  async getUserTransactions(userId: string) {
    const userTransactions = await this.userOp.getUserTransactions(userId);
    return userTransactions;
  }

  async getPendingTransactions() {
    return await this.userOp.getPendingTransactions();
  }

  async updateTransactionStatus(hash: string, status: string, blockNumber?: string, gasUsed?: string, functionName?: string) {
    return await this.userOp.updateTransactionStatus(hash, status, blockNumber, gasUsed, functionName);
  }
}

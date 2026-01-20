import { injectable } from "inversify";
import { Transaction, User } from "../../types/user";
import { IUser, UserData } from "./models/User";
import { ObjectId } from "mongoose";
import { HistoryData } from "./models/History";
import { Chat } from "../../types/history";
import { TransactionData } from "./models/Transaction";

@injectable()
export class UserOp {
  constructor() {}

  async getUserById(id: string): Promise<User | null> {
    try {
      const result = await UserData.findOne({ userId: id as String }).lean();
      if (!result) {
        return null;
      }
      return this.transformUserData(result);
    } catch (err) {
      throw new Error("Error in getting user Data");
    }
  }

  async userExists(address: string): Promise<boolean> {
    try {
      let exists = await UserData.exists({ injectedAddress: address as String });
      if(exists == null) {
        exists = await UserData.exists({embeddedAddress: address as String});
      }
      return exists != null;
    } catch (err) {
      console.error("Error checking user existence:", err);
      return false;
    }
  }

  async getUserHistory(id: string): Promise<Chat[]> {
    try {
      const result: any = await UserData.findOne({ address: id as String })
        .populate({ path: "history" })
        .lean();

      //  return user?.history || [];

      // If you want to return only the chat arrays from each history document:
      return result?.history?.chat;
    } catch (err) {
      console.log("error in fetching user history", err);
    }
  }

  async getUserTransactions(id: string) : Promise<Transaction[]> {
    try{
      const user = await UserData.findOne({userId: id}).lean();
      if(!user) throw new Error("No user found");
      const result = await TransactionData.find({user: user._id}).sort({timestamp: -1}).lean();
      return result as Transaction[];
    } catch(err){
      throw new Error(`Error in fetch user transactions: ${err}`)
    }
  }

  async getAllUsers(page: number = 1): Promise<User[]> {
    const batchSize = 10;
    const users = await UserData.find()
      .skip((page - 1) * batchSize)
      .lean()
      .limit(batchSize)
      .exec();
    return users.map((user) => {
      return this.transformUserData(user);
    });
  }

  async updateUserData(
    userId: string,
    userData: Partial<User>
  ): Promise<boolean> {
    try {
      await UserData.updateOne({ userId: userId }, userData, {
        upsert: true,
      });
      return true;
    } catch (err) {
      throw new Error("Error in registering the user");
    }
  }

  async updateUserHistory(userId: string, chats: Chat[]) {
    try {
      const user = await UserData.findOne({ userId: userId });
      if (!user) return;

      // Upsert history document
      const historyDoc = await HistoryData.findOneAndUpdate(
        { user: user._id },
        {
          $push: {
            chat: {
              $each: chats,
              $slice: -10,
            },
          },
        },
        { upsert: true, new: true }
      );

      // Add historyDoc._id to user's history array if not present
      if (historyDoc && user.history != historyDoc._id) {
        user.history = historyDoc._id;
        await user.save();
      }
    } catch (err) {
      // handle error
    }
  }

  async updateUserTransaction(userId: string, txData: Partial<Transaction>) {
    try{
      const user = await UserData.findOne({userId: userId});
      if(!user) return;
      console.log('this is txData',txData)
      const transaction = await TransactionData.create({
        ...txData,
        user:user._id,
        status: txData.status || 'PENDING'
      })
      transaction.save();
      return transaction.toObject();
    } catch(err){
      throw new Error("Error in updating user Transaction")
    }
  }

  async getPendingTransactions(): Promise<any[]> {
    try {
      return await TransactionData.find({ status: 'PENDING' }).lean();
    } catch (err) {
      console.error("Error fetching pending transactions:", err);
      return [];
    }
  }

  async updateTransactionStatus(hash: string, status: string, blockNumber?: string, gasUsed?: string, functionName?: string): Promise<boolean> {
    try {
      const update: any = { status };
      if (blockNumber) update.blockNumber = blockNumber;
      if (gasUsed) update.gas = gasUsed;
      if (functionName) update.functionName = functionName;
      
      await TransactionData.updateOne({ hash }, update);
      return true;
    } catch (err) {
      console.error(`Error updating transaction ${hash}:`, err);
      return false;
    }
  }

  transformUserData(userData: any): User {
    return {
      _id: userData?._id,
      injectedAddress: userData.injectedAddress,
      userId: userData.userId,
      embeddedAddress: userData.embeddedAddress,
      history: userData?.history,
    };
  }
}

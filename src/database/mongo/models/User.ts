import mongoose, { model, Schema, SchemaTimestampsConfig } from "mongoose";
import validator from "validator";
import { User } from "../../../types/user";

const userSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    injectedAddress: {
      type: String,
      required: true,
    },
    embeddedAddress: {
      type: String,
      required: true,
    },
    history: {
      type: Schema.Types.ObjectId,
      ref: "History",
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ userId: 1 }, { unique: true });
userSchema.index({ injectedAddress: 1 }, { unique: true });
userSchema.index({ embeddedAddress: 1 }, { unique: true });

export type IUser = User & Document & SchemaTimestampsConfig;

export const UserData = model<IUser>("User", userSchema);

import mongoose, { Schema, Document } from "mongoose";

export interface ITrackedAddress extends Document {
  address: string;
  subscribers: string[]; // Array of userIds
  chains: string[]; // Array of chain IDs or names
}

const TrackedAddressSchema: Schema = new Schema(
  {
    address: { type: String, required: true, unique: true },
    subscribers: [{ type: String }],
    chains: [{ type: String }],
  },
  { timestamps: true }
);

export const TrackedAddress = mongoose.model<ITrackedAddress>(
  "TrackedAddress",
  TrackedAddressSchema
);

import mongoose, { Schema, Document } from "mongoose";

export interface IAddressActivitySummary extends Document {
  trackedAddress: string;
  date: string; // YYYY-MM-DD
  summary: string;
  generatedAt: Date;
}

const AddressActivitySummarySchema: Schema = new Schema(
  {
    trackedAddress: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    summary: { type: String, required: true },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

AddressActivitySummarySchema.index({ trackedAddress: 1, date: 1 }, { unique: true });

export const AddressActivitySummary = mongoose.model<IAddressActivitySummary>(
  "AddressActivitySummary",
  AddressActivitySummarySchema
);

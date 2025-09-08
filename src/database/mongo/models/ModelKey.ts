import { model, Mongoose, Schema } from "mongoose";
import { ModelKey } from "../../../types/modelKey";

const modelKeySchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required:true
  },
  apikey: {
    type: String,
    required:true,
  },
  family: {
    type: String,
    required:true,
  }
});

modelKeySchema.index({user:1, family: 1});

export type IModelKey = ModelKey & Document 

export const ModelKeyData = model<IModelKey>('ModelKey',modelKeySchema)
import { ObjectId } from "mongoose"

export type ModelKey = {
    _id: string,
    user: ObjectId,
    apikey:string,
    family:string
};
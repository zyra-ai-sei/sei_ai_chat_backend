import mongoose, { Schema, Document } from "mongoose";

/**
 * ToolQueryResult stores large tool payloads indexed by executionId.
 * This allows the LLM to receive a lightweight summary while the full
 * data is persisted for frontend retrieval.
 */
export interface IToolQueryResult extends Document {
  // Unique identifier linking this result to a specific tool execution
  executionId: string;

  // User identifier for querying user-specific results
  userId: string;

  // Thread/conversation identifier
  threadId: string;

  // Request ID for grouping related tool calls from a single user request
  requestId?: string;

  // Tool name that generated this result
  toolName: string;

  // Summary sent to LLM for reasoning (lightweight, critical scalars only)
  summary: {
    text: string;
    // Key scalars that the LLM needs for continued reasoning
    balances?: Record<string, string>;
    orderIds?: string[];
    transactionHashes?: string[];
    status?: string;
    counts?: Record<string, number>;
    metadata?: Record<string, any>;
  };

  // Full data payload for frontend/UI display (can be large)
  data: {
    type: string; // e.g., 'portfolio', 'transaction_list', 'order_details', 'price_data'
    payload: any; // The full heavy payload
  };

  // Tool execution metadata (for data fetching)
  execution: {
    status: "pending" | "completed" | "failed";
    startedAt: Date;
    completedAt?: Date;
    error?: string;
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // TTL - auto-delete after 7 days by default
  expiresAt: Date;
}

const ToolQueryResultSchema: Schema = new Schema(
  {
    executionId: {
      $type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      $type: String,
      required: true,
      index: true,
    },
    threadId: {
      $type: String,
      required: true,
      index: true,
    },
    requestId: {
      $type: String,
      required: false,
      index: true,
    },
    toolName: {
      $type: String,
      required: true,
      index: true,
    },
    summary: {
      text: { $type: String, required: true },
      balances: { $type: Schema.Types.Mixed },
      orderIds: [{ $type: String }],
      transactionHashes: [{ $type: String }],
      status: { $type: String },
      counts: { $type: Schema.Types.Mixed },
      metadata: { $type: Schema.Types.Mixed },
    },
    data: {
      type: { $type: String, required: true }, // 'type' field for data category (not a Mongoose type keyword!)
      payload: { $type: Schema.Types.Mixed, required: false, default: null }, // Optional for pending async records
    },
    execution: {
      status: {
        $type: String,
        enum: ["pending", "completed", "failed"],
        default: "pending",
      },
      startedAt: { $type: Date, default: Date.now },
      completedAt: { $type: Date },
      error: { $type: String },
    },
    expiresAt: {
      $type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
    typeKey: "$type", // Use $type instead of type to avoid conflicts with data.type field
  },
);

// Compound indexes for efficient queries
ToolQueryResultSchema.index({ userId: 1, threadId: 1 });
ToolQueryResultSchema.index({ threadId: 1, createdAt: -1 });
ToolQueryResultSchema.index({ executionId: 1, "execution.status": 1 });

const ToolQueryResult = mongoose.model<IToolQueryResult>(
  "ToolQueryResult",
  ToolQueryResultSchema,
);

export default ToolQueryResult;

import { EventEmitter } from "events";
import { injectable } from "inversify";
import { Response } from "express";

/**
 * Represents a Server-Sent Event that can be pushed to connected clients.
 */
export interface SSEEvent {
  type: string;
  data: any;
  timestamp: number;
}

/**
 * Metadata for a registered SSE stream.
 */
interface StreamEntry {
  res: Response;
  userId: string;
  address: string;
  connectedAt: number;
  heartbeatInterval?: NodeJS.Timeout;
}

/**
 * StreamRegistry manages active SSE connections and provides methods
 * for routing real-time events to the correct user streams.
 *
 * - Outer map key: userId
 * - Inner map key: streamId (allows multiple streams per user)
 */
@injectable()
export class StreamRegistry extends EventEmitter {
  // userId -> (streamId -> StreamEntry)
  public activeStreams: Map<string, Map<string, StreamEntry>> = new Map();

  // address -> Set<userId> (reverse index for address-based lookups)
  private addressIndex: Map<string, Set<string>> = new Map();

  constructor() {
    super();
    // Increase max listeners to avoid warnings with many concurrent users
    this.setMaxListeners(1000);
  }

  // ----------------------------------------------------------------
  // Stream lifecycle
  // ----------------------------------------------------------------

  /**
   * Register a new SSE stream for a user.
   */
  registerStream(
    userId: string,
    streamId: string,
    address: string,
    res: Response,
  ): void {
    // Ensure user map exists
    if (!this.activeStreams.has(userId)) {
      this.activeStreams.set(userId, new Map());
    }

    const userStreams = this.activeStreams.get(userId)!;

    const heartbeatInterval = setInterval(() => {
      try {
        res.write(":\n\n");
      } catch (err) {
        console.error("[StreamRegistry] Heartbeat write failed:", err);
      }
    }, 2000);

    res.on("close", () => {
      this.unregisterStream(userId, streamId);
    });

    userStreams.set(streamId, {
      res,
      userId,
      address,
      connectedAt: Date.now(),
      heartbeatInterval,
    });

    // Update address index
    const normalizedAddress = address.toLowerCase();
    if (!this.addressIndex.has(normalizedAddress)) {
      this.addressIndex.set(normalizedAddress, new Set());
    }
    this.addressIndex.get(normalizedAddress)!.add(userId);

    console.log(
      `[StreamRegistry] Registered stream ${streamId} for user ${userId} (address: ${address}). Active: ${this.getTotalStreamCount()}`,
    );
  }

  /**
   * Unregister a stream by userId and streamId.
   */
  unregisterStream(userId: string, streamId: string): void {
    const userStreams = this.activeStreams.get(userId);
    if (!userStreams) return;

    const entry = userStreams.get(streamId);
    if (entry) {
      if (entry.heartbeatInterval) {
        clearInterval(entry.heartbeatInterval);
      }
      // Clean up address index
      const normalizedAddress = entry.address.toLowerCase();
      const addressUsers = this.addressIndex.get(normalizedAddress);
      if (addressUsers) {
        // Only remove from address index if user has no more streams for this address
        userStreams.delete(streamId);
        const stillHasAddress = Array.from(userStreams.values()).some(
          (s) => s.address.toLowerCase() === normalizedAddress,
        );
        if (!stillHasAddress) {
          addressUsers.delete(userId);
          if (addressUsers.size === 0) {
            this.addressIndex.delete(normalizedAddress);
          }
        }
      } else {
        userStreams.delete(streamId);
      }
    } else {
      userStreams.delete(streamId);
    }

    if (userStreams.size === 0) {
      this.activeStreams.delete(userId);
    }

    console.log(
      `[StreamRegistry] Unregistered stream ${streamId} for user ${userId}. Active: ${this.getTotalStreamCount()}`,
    );
  }

  // ----------------------------------------------------------------
  // Query helpers
  // ----------------------------------------------------------------

  /**
   * Check whether a given user has at least one active stream.
   */
  hasActiveStream(userId: string): boolean {
    const userStreams = this.activeStreams.get(userId);
    return !!userStreams && userStreams.size > 0;
  }

  // ----------------------------------------------------------------
  // Writing events
  // ----------------------------------------------------------------

  /**
   * Write a raw SSE event to a single Response stream.
   */
  writeSSEEvent(res: Response, data: { type: string; data: any }): void {
    try {
      res.write(`event: ${data.type}\n`);
      res.write(`data: ${JSON.stringify(data.data)}\n\n`);
    } catch (err) {
      console.error("[StreamRegistry] Failed to write SSE event:", err);
    }
  }

   /**
   * Send an SSE event to all active streams for a specific user.
   */
  sendToUser(userId: string, event: { type: string; data: any }): void {
    const userStreams = this.activeStreams.get(userId);
    if (!userStreams) return;

    for (const [, entry] of userStreams) {
      this.writeSSEEvent(entry.res, event);
    }
  }

  /**
   * Send an SSE event to every stream associated with a given wallet address.
   * Returns the number of streams the event was sent to.
   */
  sendToAddress(address: string, event: SSEEvent): number {
    const normalizedAddress = address.toLowerCase();
    const userIds = this.addressIndex.get(normalizedAddress);
    if (!userIds || userIds.size === 0) return 0;

    let sentCount = 0;

    for (const userId of userIds) {
      const userStreams = this.activeStreams.get(userId);
      if (!userStreams) continue;

      for (const [, entry] of userStreams) {
        if (entry.address.toLowerCase() === normalizedAddress) {
          try {
            this.writeSSEEvent(entry.res, {
              type: event.type,
              data: { ...event.data, timestamp: event.timestamp },
            });
            sentCount++;
          } catch (err) {
            console.error(
              `[StreamRegistry] Error sending to stream for user ${userId}:`,
              err,
            );
          }
        }
      }
    }

    return sentCount;
  }

  // ----------------------------------------------------------------
  // Tool-data notifications
  // ----------------------------------------------------------------

  /**
   * Emit a tool_data_ready event so that both internal listeners and the
   * user's active main stream are notified when async tool data resolves.
   */
  emitToolDataReady(event: {
    executionId: string;
    toolName: string;
    dataType: string;
    userId: string;
    status: "completed" | "failed";
    error?: string;
  }): void {
    console.log(
      `[StreamRegistry] Emitting tool_data_ready for ${event.toolName}, executionId: ${event.executionId}`,
    );

    // Emit internal event for SSE listeners
    this.emit("tool_data_ready", event);

    // Also send to user's active main stream if connected
    if (this.hasActiveStream(event.userId)) {
      const userStreams = this.activeStreams.get(event.userId);
      if (userStreams) {
        for (const [, stream] of userStreams) {
          this.writeSSEEvent(stream.res, {
            type: "tool_data",
            data: {
              executionId: event.executionId,
              toolName: event.toolName,
              dataType: event.dataType,
              status: event.status,
              ...(event.error ? { error: event.error } : {}),
            },
          });
        }
      }
    }
  }

  // ----------------------------------------------------------------
  // Stats / debugging
  // ----------------------------------------------------------------

  /**
   * Return high-level statistics about the registry.
   */
  getStats(): {
    totalStreams: number;
    totalUsers: number;
    trackedAddresses: number;
  } {
    return {
      totalStreams: this.getTotalStreamCount(),
      totalUsers: this.activeStreams.size,
      trackedAddresses: this.addressIndex.size,
    };
  }

  private getTotalStreamCount(): number {
    let total = 0;
    for (const [, userStreams] of this.activeStreams) {
      total += userStreams.size;
    }
    return total;
  }
}

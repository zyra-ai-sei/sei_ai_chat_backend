import { injectable } from "inversify";
import { Server } from "socket.io";

@injectable()
export class SocketService {
  private io: Server | null = null;

  public setIO(io: Server) {
    this.io = io;
  }

  public emitToUser(userId: string, event: string, data: any) {
    if (this.io) {
      // Assuming users join a room named after their userId
      this.io.to(userId).emit(event, data);
    }
  }

  public broadcast(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
}

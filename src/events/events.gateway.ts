import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket, DefaultEventsMap } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

type AuthenticatedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  { userId: string }
>;

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>();
  private projectRooms = new Map<string, Set<string>>();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token: unknown = client.handshake.auth.token;
      if (typeof token !== 'string' || !token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token);
      const userId = payload.sub;

      client.data.userId = userId;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      console.log(`User ${userId} connected (socket ${client.id})`);
    } catch (error) {
      console.error('WebSocket auth error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.data.userId;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    }

    for (const [projectId, sockets] of this.projectRooms.entries()) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.projectRooms.delete(projectId);
      }
    }

    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-project')
  handleJoinProject(
    @MessageBody() projectId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `project:${projectId}`;
    client.join(room);

    if (!this.projectRooms.has(projectId)) {
      this.projectRooms.set(projectId, new Set());
    }
    this.projectRooms.get(projectId)!.add(client.id);

    console.log(`Client ${client.id} joined project ${projectId}`);
    return { success: true };
  }

  @SubscribeMessage('leave-project')
  handleLeaveProject(
    @MessageBody() projectId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `project:${projectId}`;
    client.leave(room);

    const sockets = this.projectRooms.get(projectId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.projectRooms.delete(projectId);
      }
    }

    console.log(`Client ${client.id} left project ${projectId}`);
    return { success: true };
  }

  emitToProject(projectId: string, event: string, data: any) {
    this.server.to(`project:${projectId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit(event, data);
      }
    }
  }
}

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
import { PrismaService } from '../prisma/prisma.service';

type AuthenticatedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  { userId: string; userName: string }
>;

function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 70%, 60%)`;
}

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

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token: unknown = client.handshake.auth.token;
      if (typeof token !== 'string' || !token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync<{ sub: string; email: string }>(token);
      const userId = payload.sub;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      client.data.userId = userId;
      client.data.userName = user?.name ?? payload.email?.split('@')[0] ?? userId;

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
        if (sockets.size === 0) this.userSockets.delete(userId);
      }
    }

    for (const [projectId, sockets] of this.projectRooms.entries()) {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.projectRooms.delete(projectId);
        if (userId) {
          this.server
            .to(`project:${projectId}`)
            .emit('cursor:leave', { userId });
        }
      }
    }

    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-project')
  async handleJoinProject(
    @MessageBody() projectId: string,
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) return { success: false, error: 'Unauthenticated' };

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!project || project.userId !== userId) {
      return { success: false, error: 'Access denied' };
    }

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
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const room = `project:${projectId}`;
    client.leave(room);

    const sockets = this.projectRooms.get(projectId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) this.projectRooms.delete(projectId);
    }

    const userId = client.data.userId;
    if (userId) {
      this.server.to(room).emit('cursor:leave', { userId });
    }

    console.log(`Client ${client.id} left project ${projectId}`);
    return { success: true };
  }

  @SubscribeMessage('cursor:update')
  handleCursorUpdate(
    @MessageBody()
    payload: {
      projectId: string;
      currentTime: number;
      selectedClipId: string | null;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    client.to(`project:${payload.projectId}`).emit('cursor:update', {
      userId,
      name: client.data.userName,
      color: userColor(userId),
      currentTime: payload.currentTime,
      selectedClipId: payload.selectedClipId,
    });
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

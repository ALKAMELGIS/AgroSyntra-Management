import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../services/auth.service';

let io: Server | null = null;
const authService = new AuthService();

/**
 * Initialize the WebSocket server attached to the HTTP server.
 */
export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
        if (!origin || origin.endsWith('.up.railway.app')) return cb(null, true);
        const allowed = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(o => o.trim());
        if (allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    path: '/ws',
  });

  // JWT-based authentication middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = authService.verifyAccessToken(token);
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    console.log(`[WS] User connected: ${user.email} (${socket.id})`);

    // Join user-specific room
    socket.join(`user:${user.userId}`);

    // Join role-based room
    socket.join(`role:${user.role}`);

    // Allow clients to subscribe to entity rooms
    socket.on('subscribe', (room: string) => {
      // Only allow known room patterns
      const allowed = /^(dashboard|field:\w+|alerts|tasks)$/;
      if (allowed.test(room)) {
        socket.join(room);
      }
    });

    socket.on('unsubscribe', (room: string) => {
      socket.leave(room);
    });

    socket.on('disconnect', () => {
      console.log(`[WS] User disconnected: ${user.email}`);
    });
  });

  console.log('[WS] WebSocket server initialized');
  return io;
}

/**
 * Emit an event to a specific room or broadcast.
 */
export function emitEvent(event: string, data: any, room?: string): void {
  if (!io) return;
  if (room) {
    io.to(room).emit(event, data);
  } else {
    io.emit(event, data);
  }
}

/**
 * Emit a data change event (used after CRUD operations).
 */
export function emitDataChange(entity: string, action: 'create' | 'update' | 'delete', data: any): void {
  emitEvent('data:change', { entity, action, data, timestamp: new Date().toISOString() }, 'dashboard');
}

/**
 * Emit an alert to specific users or roles.
 */
export function emitAlert(alert: any, userId?: string): void {
  if (userId) {
    emitEvent('alert:new', alert, `user:${userId}`);
  } else {
    emitEvent('alert:new', alert);
  }
}

/**
 * Emit a task update.
 */
export function emitTaskUpdate(task: any): void {
  emitEvent('task:update', task, 'tasks');
}

export function getIO(): Server | null {
  return io;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocket = initWebSocket;
exports.emitEvent = emitEvent;
exports.emitDataChange = emitDataChange;
exports.emitAlert = emitAlert;
exports.emitTaskUpdate = emitTaskUpdate;
exports.getIO = getIO;
const socket_io_1 = require("socket.io");
const auth_service_1 = require("../services/auth.service");
let io = null;
const authService = new auth_service_1.AuthService();
/**
 * Initialize the WebSocket server attached to the HTTP server.
 */
function initWebSocket(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: (origin, cb) => {
                if (!origin || origin.endsWith('.up.railway.app'))
                    return cb(null, true);
                const allowed = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(o => o.trim());
                if (allowed.includes('*') || allowed.includes(origin))
                    return cb(null, true);
                cb(new Error('Not allowed by CORS'));
            },
            credentials: true,
        },
        path: '/ws',
    });
    // JWT-based authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }
        try {
            const payload = authService.verifyAccessToken(token);
            socket.user = payload;
            next();
        }
        catch {
            next(new Error('Invalid token'));
        }
    });
    io.on('connection', (socket) => {
        const user = socket.user;
        console.log(`[WS] User connected: ${user.email} (${socket.id})`);
        // Join user-specific room
        socket.join(`user:${user.userId}`);
        // Join role-based room
        socket.join(`role:${user.role}`);
        // Allow clients to subscribe to entity rooms
        socket.on('subscribe', (room) => {
            // Only allow known room patterns
            const allowed = /^(dashboard|field:\w+|alerts|tasks)$/;
            if (allowed.test(room)) {
                socket.join(room);
            }
        });
        socket.on('unsubscribe', (room) => {
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
function emitEvent(event, data, room) {
    if (!io)
        return;
    if (room) {
        io.to(room).emit(event, data);
    }
    else {
        io.emit(event, data);
    }
}
/**
 * Emit a data change event (used after CRUD operations).
 */
function emitDataChange(entity, action, data) {
    emitEvent('data:change', { entity, action, data, timestamp: new Date().toISOString() }, 'dashboard');
}
/**
 * Emit an alert to specific users or roles.
 */
function emitAlert(alert, userId) {
    if (userId) {
        emitEvent('alert:new', alert, `user:${userId}`);
    }
    else {
        emitEvent('alert:new', alert);
    }
}
/**
 * Emit a task update.
 */
function emitTaskUpdate(task) {
    emitEvent('task:update', task, 'tasks');
}
function getIO() {
    return io;
}

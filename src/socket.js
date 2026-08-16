const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// Tracks which user IDs currently have at least one live socket connection
// (a user can have multiple sockets open — multiple tabs/devices).
// Exposed so REST controllers (e.g. messageController) can report online status.
const onlineUsers = new Map(); // userId -> Set<socketId>

const isUserOnline = (userId) => {
  const sockets = onlineUsers.get(String(userId));
  return !!sockets && sockets.size > 0;
};

const getOnlineUserIds = () => Array.from(onlineUsers.keys());

/**
 * Initialises Socket.io on the given HTTP server and returns the `io` instance.
 * The `io` instance is also attached to `app.locals.io` so any Express
 * controller can reach it via `req.app.locals.io`.
 *
 * @param {import('http').Server} httpServer
 * @param {import('express').Application} app
 * @returns {import('socket.io').Server}
 */
const initSocket = (httpServer, app) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
    },
  });

  // ── JWT Authentication Middleware ─────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication error: no token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Attach decoded payload (id, role) so event handlers can use it
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication error: invalid token'));
    }
  });

  // ── Connection Handler ────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = String(socket.user.id);
    console.log(`[Socket.io] User connected: ${userId} (socket: ${socket.id})`);

    // Every authenticated socket auto-joins a room keyed to its own user id,
    // so any part of the server can push a direct-message event to this user
    // via `io.to('user:<id>').emit(...)` without tracking socket ids itself.
    socket.join(`user:${userId}`);

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    // Auto-join a personal room so controllers can push events to this exact
    // user (e.g. a tutor getting a new membership request) without needing
    // them to have joined any particular community room first.
    socket.join(`user:${socket.user.id}`);

    /**
     * Event: join_community
     * Payload: { communityId: string | number }
     *
     * Joins the socket to a named room so that broadcasts scoped to a
     * community are received only by its approved members.
     */
    socket.on('join_community', ({ communityId }) => {
      if (!communityId) {
        return socket.emit('error', { message: 'communityId is required' });
      }

      const room = `community:${communityId}`;
      socket.join(room);
      console.log(`[Socket.io] User ${socket.user.id} joined room: ${room}`);

      socket.emit('joined_community', { communityId, room });
    });

    /**
     * Event: leave_community
     * Payload: { communityId: string | number }
     *
     * Convenience event to leave a room without disconnecting.
     */
    socket.on('leave_community', ({ communityId }) => {
      const room = `community:${communityId}`;
      socket.leave(room);
      console.log(`[Socket.io] User ${socket.user.id} left room: ${room}`);
    });

    /**
     * Direct-message typing indicator relay.
     * Event: typing / stop_typing
     * Payload: { to: string | number } — the recipient user id
     *
     * Message persistence/broadcast itself happens over REST
     * (POST /api/messages/:userId) so it goes through the same auth +
     * validation path as the rest of the API; these two events only relay a
     * lightweight, non-persisted "is typing" signal to the other user.
     */
    socket.on('typing', ({ to }) => {
      if (!to) return;
      io.to(`user:${to}`).emit('typing', { from: userId });
    });

    socket.on('stop_typing', ({ to }) => {
      if (!to) return;
      io.to(`user:${to}`).emit('stop_typing', { from: userId });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] User disconnected: ${userId}`);
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) onlineUsers.delete(userId);
      }
    });
  });

  // Make `io` available to all Express controllers via req.app.locals.io
  app.locals.io = io;

  return io;
};

module.exports = initSocket;
module.exports.isUserOnline = isUserOnline;
module.exports.getOnlineUserIds = getOnlineUserIds;

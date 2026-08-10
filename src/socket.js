const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

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
    console.log(`[Socket.io] User connected: ${socket.user.id} (socket: ${socket.id})`);

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

    socket.on('disconnect', () => {
      console.log(`[Socket.io] User disconnected: ${socket.user.id}`);
    });
  });

  // Make `io` available to all Express controllers via req.app.locals.io
  app.locals.io = io;

  return io;
};

module.exports = initSocket;

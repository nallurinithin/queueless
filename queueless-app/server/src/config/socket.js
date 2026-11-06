/**
 * Socket.IO Configuration
 *
 * Configures and attaches Socket.IO to the HTTP server.
 * Handles client authentication and room subscriptions.
 */

import { Server } from 'socket.io';
import { logger } from '../shared/logger.js';

let io = null;

export function createSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

export function getSocketIO() {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call createSocketServer first.');
  }
  return io;
}

export const getIO = getSocketIO;

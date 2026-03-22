import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { logger } from "./logger";
import { config } from "./config";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from "./socket.events";

export type TypedIO = SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: TypedIO | null = null;

export function initSocketServer(httpServer: HttpServer): TypedIO {
  io = new SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: { origin: config.CORS_ORIGIN, methods: ["GET", "POST"] },
      transports: ["websocket", "polling"],
    },
  );

  io.on("connection", (socket) => {
    logger.info("Socket connected", { socketId: socket.id });

    // clients join a project room to receive scoped events
    socket.on("room:join", (projectId: string) => {
      socket.join(`project:${projectId}`);
      logger.info("Socket joined room", { socketId: socket.id, projectId });
    });

    socket.on("room:leave", (projectId: string) => {
      socket.leave(`project:${projectId}`);
      logger.info("Socket left room", { socketId: socket.id, projectId });
    });

    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected", { socketId: socket.id, reason });
    });
  });

  logger.info("Socket.io server initialised");
  return io;
}

export function getIO(): TypedIO {
  if (!io) throw new Error("Socket.io not initialised — call initSocketServer first");
  return io;
}

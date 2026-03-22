import { io, Socket } from "socket.io-client";

// Mirror the server event maps on the client (server→client / client→server are swapped)
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "./socket.events";

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: ClientSocket | null = null;

export function getSocket(): ClientSocket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      autoConnect: false, // connect explicitly so we control timing
    });
  }
  return socket;
}

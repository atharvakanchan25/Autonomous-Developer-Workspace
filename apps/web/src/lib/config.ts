const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL;

if (!API_URL) {
  throw new Error("NEXT_PUBLIC_API_URL is not configured");
}

export const webConfig = {
  apiUrl: API_URL,
  socketUrl: SOCKET_URL,
} as const;

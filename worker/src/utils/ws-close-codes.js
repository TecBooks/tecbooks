// Application close codes for game-room WebSockets (4000-4999 is the range
// reserved for applications by RFC 6455). Mirrored in the client hook
// `src/sims/project-feasibility/hooks/useGameSocket.js` - keep both in sync.
//
// A browser can't read the HTTP status of a failed WebSocket upgrade (it only
// sees close code 1006), so a plain 401/404 makes the client retry forever.
// Instead we accept the upgrade and close it right away with one of these
// codes, which tells the client to stop reconnecting.
export const WS_CLOSE = {
  UNAUTHORIZED: 4401,
  ROOM_NOT_FOUND: 4404,
};

export function rejectWebSocket(code, reason) {
  // eslint-disable-next-line no-undef
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

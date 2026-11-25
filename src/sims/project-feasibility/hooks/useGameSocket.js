import workerApi from "@/utils/worker.util";
import { useEffect, useRef, useState, useCallback } from "react";

const WS_BASE = workerApi.defaults.baseURL.replace(/^http/, "ws");

// Mirrors worker/src/utils/ws-close-codes.js - keep both in sync.
export const WS_CLOSE = {
  UNAUTHORIZED: 4401,
  ROOM_NOT_FOUND: 4404,
};

// Heartbeat: raw "ping" answered by the Durable Object's auto-response
// ("pong") without waking it. If no pong arrives for HEARTBEAT_TIMEOUT_MS the
// socket is treated as dead and closed, which triggers a reconnect.
const HEARTBEAT_PING = "ping";
const HEARTBEAT_PONG = "pong";
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 75_000;

// Reconnect: exponential backoff with jitter, capped, and a hard limit of
// consecutive failures. Every attempt is a billable Worker request plus D1
// reads, so a dead tab must not retry forever.
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_FAILED_ATTEMPTS = 8;

function backoffDelay(attempt) {
  const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
  return exp / 2 + Math.random() * (exp / 2);
}

/**
 * closeReason (null while connected or retrying):
 * - "unauthorized"   token invalid/expired → must join again
 * - "room_not_found" room closed or code wrong
 * - "unreachable"    gave up after MAX_FAILED_ATTEMPTS; call reconnect()
 */
export function useGameSocket(code, token) {
  const [connected, setConnected] = useState(false);
  const [me, setMe] = useState(null);
  const [projectSelection, setProjectSelection] = useState(null);
  const [online, setOnline] = useState([]);
  const [gameStatus, setGameStatus] = useState("lobby");
  const [round, setRound] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [closeReason, setCloseReason] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!round) return undefined;

    const updateTimeLeft = () => {
      setTimeLeft(Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000)));
    };

    updateTimeLeft();
    const timer = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [round]);

  useEffect(() => {
    if (!token) return undefined;
    let stopped = false;
    let retryTimer;
    let heartbeatTimer;
    let failedAttempts = 0;
    let lastPongAt = 0;

    setCloseReason(null);

    function handleMessage(e) {
      if (e.data === HEARTBEAT_PONG) {
        lastPongAt = Date.now();
        return;
      }

      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "welcome":
          setMe(msg.you);
          setProjectSelection(msg.projectSelection);
          setGameStatus(msg.status);
          break;
        case "presence":
          setOnline(msg.online);
          break;
        case "round_started":
          setGameStatus("running");
          setRound({
            currentRound: msg.currentRound,
            totalRounds: msg.totalRounds,
            endsAt: msg.endsAt - (msg.serverNow - Date.now()),
          });
          break;
        case "game_over":
          setGameStatus("game_over");
          setTimeLeft(0);
          break;
        case "error":
          setLastError({ code: msg.code, message: msg.message, at: Date.now() });
          break;
      }
    }

    function scheduleReconnect() {
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        setCloseReason("unreachable");
        return;
      }
      retryTimer = setTimeout(connect, backoffDelay(failedAttempts));
      failedAttempts += 1;
    }

    function connect() {
      const ws = new WebSocket(
        `${WS_BASE}/ws/rooms/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        lastPongAt = Date.now();
        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastPongAt > HEARTBEAT_TIMEOUT_MS) {
            ws.close(); // dead connection → onclose → reconnect
            return;
          }
          ws.send(HEARTBEAT_PING);
        }, HEARTBEAT_INTERVAL_MS);
      };

      ws.onmessage = (e) => {
        // A real message from the server means the connection is healthy.
        failedAttempts = 0;
        handleMessage(e);
      };

      ws.onclose = (event) => {
        setConnected(false);
        clearInterval(heartbeatTimer);
        if (stopped) return;

        if (event.code === WS_CLOSE.UNAUTHORIZED) {
          setCloseReason("unauthorized");
          return;
        }
        if (event.code === WS_CLOSE.ROOM_NOT_FOUND) {
          setCloseReason("room_not_found");
          return;
        }
        scheduleReconnect();
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(heartbeatTimer);
      wsRef.current?.close();
    };
  }, [code, token, reconnectNonce]);

  const send = useCallback((obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);

  const reconnect = useCallback(() => setReconnectNonce((n) => n + 1), []);

  return {
    connected,
    me,
    projectSelection,
    online,
    gameStatus,
    round,
    timeLeft,
    closeReason,
    lastError,
    send,
    reconnect,
  };
}

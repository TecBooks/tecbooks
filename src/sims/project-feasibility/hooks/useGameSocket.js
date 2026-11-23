import workerApi from "@/utils/worker.util";
import { useEffect, useRef, useState, useCallback } from "react";

const WS_BASE = workerApi.defaults.baseURL.replace(/^http/, "ws");

export function useGameSocket(code, token) {
  const [connected, setConnected] = useState(false);
  const [me, setMe] = useState(null);
  const [online, setOnline] = useState([]);
  const [gameStatus, setGameStatus] = useState("lobby");
  const [round, setRound] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
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
    if (!token) return;
    let stopped = false;
    let retryTimer;

    function connect() {
      const ws = new WebSocket(
        `${WS_BASE}/ws/rooms/${code}?token=${encodeURIComponent(token)}`,
      );
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case "welcome":
            setMe(msg.you);
            setGameStatus(msg.status);
            break;
          case "presence":
            setOnline(msg.online);
            break;
          case "game_started":
            setGameStatus("running");
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
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retryTimer = setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [code, token]);

  const send = useCallback((obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);

  return { connected, me, online, gameStatus, round, timeLeft, send };
}

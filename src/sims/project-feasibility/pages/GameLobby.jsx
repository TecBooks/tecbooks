import { Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { useGameSocket } from "../hooks/useGameSocket";
import { TeacherLobby } from "@/components/sims/program/game/TeacherLobby";
import { StudentLobby } from "@/components/sims/program/game/StudentLobby";

export default function GameLobby() {
  const { code } = useParams();

  const token = sessionStorage.getItem(`session:${code}`); // ?? getAuthToken();

  const { connected, me, online, gameStatus, round, timeLeft, send } =
    useGameSocket(code, token);
  const roomCodeMessage = (
    <Typography variant="h6" component="p">
      Room code: <strong>{code}</strong>
    </Typography>
  );

  if (!token)
    return (
      <>
        {roomCodeMessage}
        <p>You need to join this game first.</p>
      </>
    );
  if (!me)
    return (
      <>
        {roomCodeMessage}
        <p>{connected ? "Loading…" : "Connecting…"}</p>
      </>
    );
  if (gameStatus === "running")
    return (
      <>
        {roomCodeMessage}
        <p>
          Round {round?.currentRound ?? "…"} of {round?.totalRounds ?? "…"}
        </p>
        <p>Time left: {timeLeft ?? "…"} seconds</p>
      </>
    );
  if (gameStatus === "game_over")
    return (
      <>
        {roomCodeMessage}
        <p>Game over!</p>
      </>
    );

  const students = online.filter((u) => u.role === "student");

  return me.role === "teacher" ? (
    <>
      {roomCodeMessage}
      <TeacherLobby
        code={code}
        students={students}
        onStart={() => send({ type: "start_game" })}
      />
    </>
  ) : (
    <>
      {roomCodeMessage}
      <StudentLobby name={me.name} students={students} />
    </>
  );
}

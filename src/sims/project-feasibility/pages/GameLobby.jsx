import { Alert, Box, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { useGameSocket } from "../hooks/useGameSocket";
import { TeacherLobby } from "@/components/sims/program/game/TeacherLobby";
import { StudentLobby } from "@/components/sims/program/game/StudentLobby";
import ProjectDashboard from "./ProjectDashboard";

export default function GameLobby() {
  const { code } = useParams();

  const token = sessionStorage.getItem(`session:${code}`); // ?? getAuthToken();

  const {
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
  } = useGameSocket(code, token);
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
  // The room gets closed in D1 when the game ends, so a reconnect after
  // game over is rejected as room_not_found - keep showing the result.
  if (closeReason && gameStatus !== "game_over")
    return (
      <>
        {roomCodeMessage}
        <ConnectionClosedAlert reason={closeReason} onRetry={reconnect} />
      </>
    );
  if (!me)
    return (
      <>
        {roomCodeMessage}
        <p>{connected ? "Loading…" : "Connecting…"}</p>
      </>
    );
  if (gameStatus === "running" && !projectSelection)
    return (
      <>
        {roomCodeMessage}
        <Alert severity="error">
          The selected project for this game could not be loaded.
        </Alert>
      </>
    );
  if (gameStatus === "running")
    return (
      <>
        <Box sx={{ px: 4, pt: 2 }}>
          {roomCodeMessage}
          <Typography>
            Round {round?.currentRound ?? "…"} of {round?.totalRounds ?? "…"}
            {" · "}
            Time left: {timeLeft ?? "…"} seconds
          </Typography>
        </Box>
        <ProjectDashboard gameSelection={projectSelection} />
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

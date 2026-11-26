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
    teams,
    teamMembers,
    teamAssignments,
    allowTeamChanges,
    socketError,
    gameStatus,
    round,
    timeLeft,
    send,
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
  const handleAssignStudent = (studentId, teamId) =>
    send({ type: "assign_student", payload: { studentId, teamId } });
  const handleToggleTeamChanges = (enabled) =>
    send({ type: "set_team_changes", payload: { enabled } });
  const handleChooseTeam = (teamId) =>
    send({ type: "choose_team", payload: { teamId } });

  return me.role === "teacher" ? (
    <>
      <TeacherLobby
        code={code}
        students={students}
        teams={teams}
        allowTeamChanges={allowTeamChanges}
        socketError={socketError}
        onAssignStudent={handleAssignStudent}
        onToggleTeamChanges={handleToggleTeamChanges}
        onStart={() => send({ type: "start_game" })}
      />
    </>
  ) : (
    <>
      <StudentLobby
        code={code}
        name={me.name}
        userId={me.userId}
        students={students}
        teams={teams}
        teamMembers={teamMembers}
        teamId={teamAssignments[me.userId] || me.teamId}
        allowTeamChanges={allowTeamChanges}
        socketError={socketError}
        onChooseTeam={handleChooseTeam}
      />
    </>
  );
}

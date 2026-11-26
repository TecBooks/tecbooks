import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Collapse,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { ExpandLess, ExpandMore, Groups } from "@mui/icons-material";

export function StudentLobby({
  code,
  name,
  userId,
  students,
  teams,
  teamMembers,
  teamId,
  allowTeamChanges,
  socketError,
  onChooseTeam,
}) {
  const [expandedTeamIds, setExpandedTeamIds] = useState(
    () => new Set(teamId == null ? [] : [teamId]),
  );
  const connectedUserIds = new Set(students.map((student) => student.userId));

  useEffect(() => {
    if (teamId == null) return;

    setExpandedTeamIds((current) => {
      if (current.has(teamId)) return current;
      return new Set([...current, teamId]);
    });
  }, [teamId]);

  const handleJoinTeam = (event, selectedTeamId) => {
    event.stopPropagation();
    onChooseTeam(selectedTeamId);
  };

  const toggleTeam = (selectedTeamId) => {
    setExpandedTeamIds((current) => {
      const next = new Set(current);
      if (next.has(selectedTeamId)) {
        next.delete(selectedTeamId);
      } else {
        next.add(selectedTeamId);
      }
      return next;
    });
  };

  return (
    <Box
      sx={{
        minHeight: "calc(100vh - 120px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#f1f5f9",
        p: { xs: 2, md: 4 },
      }}
    >
      <Paper
        elevation={3}
        sx={{ width: "100%", maxWidth: 920, p: { xs: 2, md: 4 }, borderRadius: 3 }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 3 }}
        >
          <Box>
            <Typography variant="h4" fontWeight={700}>
              Choose your team
            </Typography>
            <Typography color="text.secondary">
              Welcome, {name} · Room code: <strong>{code}</strong>
            </Typography>
          </Box>
          <Chip
            icon={<Groups />}
            label={`${students.length} connected`}
            color="primary"
            variant="outlined"
          />
        </Stack>

        {socketError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {socketError}
          </Alert>
        )}
        {!allowTeamChanges && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Team changes have been disabled by your teacher.
          </Alert>
        )}
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Select a team to see its members. You can join another team while
          changes are enabled.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 2,
          }}
        >
          {teams.map((team) => {
            const members = teamMembers.filter(
              (member) => member.teamId === team.id,
            );
            const isCurrentTeam = teamId === team.id;
            const isExpanded = expandedTeamIds.has(team.id);

            return (
              <Box key={team.id}>
                <Card
                  variant="outlined"
                  sx={{
                    bgcolor: "white",
                    borderColor: isCurrentTeam ? "primary.main" : "divider",
                    borderWidth: 2,
                  }}
                >
                  <CardActionArea
                    onClick={() => toggleTeam(team.id)}
                    aria-expanded={isExpanded}
                  >
                    <CardContent>
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Typography variant="h6" fontWeight={700}>
                          {team.name}
                        </Typography>
                        {isExpanded ? <ExpandLess /> : <ExpandMore />}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {members.length} member{members.length !== 1 ? "s" : ""}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                  <CardContent sx={{ pt: 0 }}>
                    {isCurrentTeam ? (
                      <Chip
                        label="Your team"
                        color="primary"
                        size="small"
                        sx={{ width: "100%", height: 36 }}
                      />
                    ) : (
                      <Button
                        fullWidth
                        variant="outlined"
                        disabled={!allowTeamChanges}
                        onClick={(event) => handleJoinTeam(event, team.id)}
                        sx={{ height: 36 }}
                      >
                        Join team
                      </Button>
                    )}
                  </CardContent>
                </Card>
                <Collapse in={isExpanded} unmountOnExit>
                  <Paper
                    variant="outlined"
                    sx={{ mt: 1, p: 2, bgcolor: "white" }}
                  >
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Team members
                    </Typography>
                    {members.length > 0 ? (
                      <Stack spacing={0.75}>
                        {members.map((member) => (
                          <Typography
                            key={member.userId}
                            variant="body2"
                            color="text.secondary"
                          >
                            {member.name}
                            {member.userId === userId && " (you)"}
                            {!connectedUserIds.has(member.userId) && " · offline"}
                          </Typography>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No students have joined this team yet.
                      </Typography>
                    )}
                  </Paper>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      </Paper>
    </Box>
  );
}

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { DragIndicator, Groups, PersonOutline } from "@mui/icons-material";

function startDraggingStudent(event, studentId) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", studentId);
}

function dropStudentOnTeam(event, teamId, onAssignStudent) {
  event.preventDefault();
  const studentId = event.dataTransfer.getData("text/plain");
  if (studentId) onAssignStudent(studentId, teamId);
}

function StudentTile({ student, teams, onAssignStudent }) {
  return (
    <Paper
      variant="outlined"
      draggable
      onDragStart={(event) => startDraggingStudent(event, student.userId)}
      sx={{
        p: 1.25,
        cursor: "grab",
        "&:active": { cursor: "grabbing" },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <PersonOutline color="action" fontSize="small" />
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
          {student.name}
        </Typography>
        <DragIndicator color="action" fontSize="small" />
      </Stack>
      {teams.length > 0 && (
        <FormControl fullWidth size="small" sx={{ mt: 1 }}>
          <InputLabel id={`assign-${student.userId}`}>Assign to</InputLabel>
          <Select
            labelId={`assign-${student.userId}`}
            value=""
            label="Assign to"
            onChange={(event) =>
              onAssignStudent(student.userId, event.target.value)
            }
          >
            {teams.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </Paper>
  );
}

export function TeacherLobby({
  code,
  students,
  teams,
  allowTeamChanges,
  socketError,
  onAssignStudent,
  onToggleTeamChanges,
  onStart,
}) {
  const unassignedStudents = students.filter(
    (student) => !teams.some((team) => team.id === student.teamId),
  );

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
        sx={{ width: "100%", maxWidth: 1120, p: { xs: 2, md: 4 }, borderRadius: 3 }}
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
              Game lobby
            </Typography>
            <Typography color="text.secondary">
              Room code: <strong>{code}</strong>
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

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "280px minmax(0, 1fr)" },
            gap: 3,
          }}
        >
          <Paper
            variant="outlined"
            sx={{ p: 2, bgcolor: "#f8fafc", alignSelf: "start" }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <Typography variant="h6" fontWeight={600}>
                Unassigned
              </Typography>
              <Chip size="small" label={unassignedStudents.length} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Drag a student to a team, or use the assignment menu. You can
              also move students between teams.
            </Typography>
            <Stack spacing={1}>
              {unassignedStudents.map((student) => (
                <StudentTile
                  key={student.userId}
                  student={student}
                  teams={teams}
                  onAssignStudent={onAssignStudent}
                />
              ))}
              {unassignedStudents.length === 0 && (
                <Typography color="text.secondary" variant="body2">
                  All connected students are assigned.
                </Typography>
              )}
            </Stack>
          </Paper>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 2,
            }}
          >
            {teams.map((team) => {
              const members = students.filter(
                (student) => student.teamId === team.id,
              );

              return (
                <Card
                  key={team.id}
                  variant="outlined"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) =>
                    dropStudentOnTeam(event, team.id, onAssignStudent)
                  }
                  sx={{
                    minHeight: 210,
                    bgcolor: "white",
                    borderStyle: "dashed",
                    borderColor: "primary.light",
                    "&:hover": { borderColor: "primary.main" },
                  }}
                >
                  <CardContent>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ mb: 1.5 }}
                    >
                      <Typography variant="h6" fontWeight={700}>
                        {team.name}
                      </Typography>
                      <Chip size="small" label={members.length} />
                    </Stack>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mb: 1 }}
                    >
                        Drop students here
                    </Typography>
                    <Stack spacing={1}>
                      {members.map((student) => (
                        <Paper
                          key={student.userId}
                          variant="outlined"
                          draggable
                          onDragStart={(event) =>
                            startDraggingStudent(event, student.userId)
                          }
                          sx={{ p: 1, cursor: "grab" }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <PersonOutline
                              color="action"
                              fontSize="small"
                            />
                            <Typography variant="body2" sx={{ flex: 1 }}>
                              {student.name}
                            </Typography>
                            <DragIndicator
                              color="action"
                              fontSize="small"
                            />
                          </Stack>
                        </Paper>
                      ))}
                      {members.length === 0 && (
                        <Typography color="text.secondary" variant="body2">
                          No students in this team yet.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        </Box>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={2}
          sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: "divider" }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={allowTeamChanges}
                onChange={(event) => onToggleTeamChanges(event.target.checked)}
              />
            }
            label="Allow students to change teams"
          />
          <Button
            onClick={onStart}
            disabled={students.length === 0}
            variant="contained"
            size="large"
          >
            Start game
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

import { Button } from "@mui/material";

export function TeacherLobby({ code, students, onStart }) {
  return (
    <div>
      <h1>Game lobby</h1>
      <p>
        Room code: <strong>{code}</strong>
      </p>

      <h2>Connected students ({students.length})</h2>
      <ul>
        {students.map((s) => (
          <li key={s.userId}>{s.name}</li>
        ))}
      </ul>
      <Button
        onClick={onStart}
        disabled={students.length === 0}
        variant="contained"
        sx={{
          bgcolor: "#1e90ff",
          fontWeight: 600,
          fontSize: 18,
          borderRadius: 2,
          whiteSpace: "nowrap",
        }}
      >
        Start game
      </Button>
    </div>
  );
}

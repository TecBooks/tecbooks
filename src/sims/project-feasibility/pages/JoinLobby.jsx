import React, { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Divider,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { joinGameRoom } from "../api/game.api";

const INVALID_LINK_ERROR = "Please enter a valid lobby link.";
const ROOM_NOT_FOUND_ERROR =
  "Sorry, the game room you are looking for does not exists or has been cloesd";

export default function JoinLobby() {
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");

    if (!link || link === "") {
      setSubmitError(INVALID_LINK_ERROR);
      return;
    }

    try {
      setSubmitting(true);
      const previousToken = sessionStorage.getItem(`session:${link}`);
      const room = await joinGameRoom(link, previousToken);
      if (!room.sessionToken) {
        throw new Error("Could not create a lobby session. Please try again.");
      }
      sessionStorage.setItem(`session:${link}`, room.sessionToken);
      navigate(
        `/sims/project-feasibility/game/${encodeURIComponent(room.code)}`,
      );
    } catch (error) {
      setSubmitError(
        (error?.response?.status === 404 && ROOM_NOT_FOUND_ERROR) ||
          error?.response?.data?.error ||
          error?.message ||
          "Could not verify the game room. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#f4f6f8",
        p: 2,
      }}
    >
      <Paper
        elevation={4}
        sx={{ p: 4, width: "100%", maxWidth: 450, borderRadius: 4 }}
      >
        <Typography
          variant="h5"
          component="h1"
          fontWeight="bold"
          align="center"
          gutterBottom
        >
          Join Game
        </Typography>

        <Divider sx={{ my: 2 }} />

        <form onSubmit={handleSubmit} noValidate>
          <Stack spacing={2.5}>
            <TextField
              fullWidth
              autoFocus
              label="Lobby link"
              variant="outlined"
              size="small"
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />

            {submitError && <Alert severity="error">{submitError}</Alert>}

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={submitting}
              sx={{
                mt: 1,
                bgcolor: "#1e90ff",
                fontWeight: 600,
                fontSize: 16,
                borderRadius: 2,
                py: 1.2,
                "&:hover": { bgcolor: "#1c86ee" },
              }}
            >
              {submitting ? "Checking..." : "Continue"}
            </Button>

            <Divider />

            <Typography align="center">
              <Link
                component={RouterLink}
                to="/sims/project-feasibility/programs/new-game"
                underline="hover"
              >
                If you are a professor: Create Game
              </Link>
            </Typography>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}

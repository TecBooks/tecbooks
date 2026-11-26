import {
  assignStudentToTeam,
  chooseStudentTeam,
  setStudentTeamChanges,
  startGame,
  studentAction,
} from "../controllers/ws.game.controller";
import { requireAuth, requireTeacher } from "../middleware/ws.middlewares";
import { createWsRouter } from "../utils/ws-router";

export const router = createWsRouter();

router.on("start_game", requireTeacher, startGame);
router.on("assign_student", requireTeacher, assignStudentToTeam);
router.on("set_team_changes", requireTeacher, setStudentTeamChanges);
router.on("choose_team", requireAuth, chooseStudentTeam);
router.on("action", requireTeacher, studentAction);

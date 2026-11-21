import { startGame, studentAction } from "../controllers/ws.game.controller";
import { requireTeacher } from "../middleware/ws.middlewares";
import { createWsRouter } from "../utils/ws-router";

export const router = createWsRouter();

router.on("start_game", requireTeacher, startGame);
router.on("action", requireTeacher, studentAction);

import { Hono } from 'hono';
import { loggerMiddleware } from '../middleware/logger.middleware.js';
import { sessionMiddleware } from '../middleware/session.middleware.js';
import {
  createProgramController,
  deleteProjectController,
  listProgramsController,
} from '../controllers/programs.controller.js';

export const programsRoute = new Hono();

programsRoute.use('*', loggerMiddleware);
programsRoute.use('*', sessionMiddleware);
programsRoute.get('/', listProgramsController);
programsRoute.post('/', createProgramController);
programsRoute.delete('/:programId/projects/:projectId', deleteProjectController);

import {
  createProgramUseCase,
  deleteProjectUseCase,
  listProgramsUseCase,
} from '../usecases/programs.usecase.js';
import { createProgramRequestSchema } from '../requests/program.request.js';

function asFileList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((file) => file && typeof file.arrayBuffer === 'function');
}

export async function createProgramController(context) {
  const body = await context.req.parseBody({ all: true });
  let projects;
  try {
    projects = JSON.parse(String(body.projects ?? '[]'));
  } catch {
    return context.json({ error: 'invalid_body' }, 400);
  }

  const validationResult = createProgramRequestSchema.safeParse({
    name: body.name,
    projects,
  });
  if (!validationResult.success) {
    return context.json({ error: 'invalid_body', details: validationResult.error.flatten() }, 400);
  }

  const files = asFileList(body.files ?? body.file);
  if (files.length !== validationResult.data.projects.length) {
    return context.json({ error: 'file_count_mismatch' }, 400);
  }

  const program = await createProgramUseCase(context.env, {
    ...validationResult.data,
    files,
    createdBy: context.get('userId'),
  });

  return context.json(program, 201);
}

function asPositiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export async function deleteProjectController(context) {
  const programId = asPositiveInt(context.req.param('programId'));
  const projectId = asPositiveInt(context.req.param('projectId'));
  if (!programId || !projectId) {
    return context.json({ error: 'invalid_params' }, 400);
  }

  const result = await deleteProjectUseCase(context.env, {
    programId,
    projectId,
    createdBy: context.get('userId'),
  });
  return context.json(result, 200);
}

export async function listProgramsController(context) {
  const programs = await listProgramsUseCase(context.env, {
    createdBy: context.get('userId'),
  });

  return context.json(programs, 200);
}

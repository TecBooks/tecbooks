export async function insertFeasibilityProgram(database, { name, createdBy }) {
  return database
    .prepare(
      `INSERT INTO feasibility_programs (name, created_by, created_at)
       VALUES (?, ?, datetime('now'))
       RETURNING id, name, created_by, created_at`
    )
    .bind(name, createdBy)
    .first();
}

export async function listFeasibilityProgramsByCreatedBy(database, createdBy) {
  const { results } = await database
    .prepare(
      `SELECT id, name, created_by, created_at
       FROM feasibility_programs
       WHERE created_by = ?
       ORDER BY id DESC`
    )
    .bind(createdBy)
    .all();
  return results;
}

export async function insertFeasibilityProject(database, programId, { name, gameId, r2Key }) {
  return database
    .prepare(
      `INSERT INTO feasibility_projects (program_id, name, game_id, r2_key)
       VALUES (?, ?, ?, ?)
       RETURNING id, program_id, name, game_id, r2_key`
    )
    .bind(programId, name, gameId, r2Key)
    .first();
}

export async function listFeasibilityProjectsByProgramId(database, programId) {
  const { results } = await database
    .prepare(
      `SELECT id, program_id, name, game_id, r2_key
       FROM feasibility_projects
       WHERE program_id = ?
       ORDER BY id`
    )
    .bind(programId)
    .all();
  return results;
}

/** The project only if it belongs to `programId` and that program to `createdBy`. */
export async function findOwnedFeasibilityProject(database, { programId, projectId, createdBy }) {
  return database
    .prepare(
      `SELECT project.id, project.program_id, project.name, project.game_id, project.r2_key
       FROM feasibility_projects AS project
       JOIN feasibility_programs AS program ON program.id = project.program_id
       WHERE project.id = ? AND project.program_id = ? AND program.created_by = ?`
    )
    .bind(projectId, programId, createdBy)
    .first();
}

export async function deleteFeasibilityProjectById(database, projectId) {
  await database.prepare('DELETE FROM feasibility_projects WHERE id = ?').bind(projectId).run();
}

export async function countFeasibilityProjectsByProgramId(database, programId) {
  const row = await database
    .prepare('SELECT COUNT(*) AS n FROM feasibility_projects WHERE program_id = ?')
    .bind(programId)
    .first();
  return Number(row?.n ?? 0);
}

export async function deleteFeasibilityProgram(database, programId) {
  await database.prepare('DELETE FROM feasibility_projects WHERE program_id = ?').bind(programId).run();
  await database.prepare('DELETE FROM feasibility_programs WHERE id = ?').bind(programId).run();
}

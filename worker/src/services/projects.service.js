export async function listProjects(db, { createdBy }) {
  const { results } = await db
    .prepare(
      `SELECT project.id, project.program_id AS programId, project.name,
              program.name AS programName, project.game_id AS gameId
       FROM feasibility_projects AS project
       JOIN feasibility_programs AS program ON program.id = project.program_id
       WHERE program.created_by = ?
       ORDER BY program.name, project.name`,
    )
    .bind(createdBy)
    .all();
  return results;
}

export async function listProjects(db, { createdBy }) {
  const { results } = await db
    .prepare(
      "SELECT id, name FROM feasibility_programs WHERE created_by = ? ORDER BY name",
    )
    .bind(createdBy)
    .all();
  return results;
}

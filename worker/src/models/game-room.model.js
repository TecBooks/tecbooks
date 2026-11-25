export function findActiveGameRoomForTeacher(db, gameId, teacherId) {
  return db
    .prepare(
      `SELECT game_id, time_round, num_rounds
       FROM game_rooms
       WHERE game_id = ? AND created_by = ? AND closed_at IS NULL`,
    )
    .bind(gameId, teacherId)
    .first();
}

export function closeGameRoomById(db, gameId, closedAt) {
  return db
    .prepare(
      `UPDATE game_rooms SET closed_at = ?
       WHERE game_id = ? AND closed_at IS NULL`,
    )
    .bind(closedAt, gameId)
    .run();
}

// created_at / closed_at are ISO-8601 strings, so string comparison orders them.
export function closeGameRoomsCreatedBefore(db, cutoffIso, closedAt) {
  return db
    .prepare(
      `UPDATE game_rooms SET closed_at = ?
       WHERE closed_at IS NULL AND created_at < ?`,
    )
    .bind(closedAt, cutoffIso)
    .run();
}

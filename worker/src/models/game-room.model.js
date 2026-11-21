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

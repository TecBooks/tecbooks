ALTER TABLE game_rooms
ADD COLUMN num_rounds INTEGER NOT NULL DEFAULT 4;

DROP TABLE "game_project";
DROP TABLE "projects_temp";

CREATE TABLE "game_project" (
  "game_id" INTEGER NOT NULL,
  "project_id" INTEGER NOT NULL,
  PRIMARY KEY ("game_id", "project_id"),
  FOREIGN KEY("game_id") REFERENCES "game_rooms"("game_id"),
  FOREIGN KEY("project_id") REFERENCES "feasibility_programs"("id")
);
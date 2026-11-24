CREATE TABLE "game_project_new" (
  "game_id" INTEGER NOT NULL,
  "project_id" INTEGER NOT NULL,
  PRIMARY KEY ("game_id", "project_id"),
  FOREIGN KEY("game_id") REFERENCES "game_rooms"("game_id"),
  FOREIGN KEY("project_id") REFERENCES "feasibility_projects"("id")
);

INSERT INTO "game_project_new" ("game_id", "project_id")
SELECT selected."game_id", MIN(project."id")
FROM "game_project" AS selected
JOIN "feasibility_projects" AS project
  ON project."program_id" = selected."project_id"
GROUP BY selected."game_id";

DROP TABLE "game_project";
ALTER TABLE "game_project_new" RENAME TO "game_project";

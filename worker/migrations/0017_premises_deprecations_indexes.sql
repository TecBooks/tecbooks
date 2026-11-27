-- 0011_generic_depreciation_categories.sql rebuilt these tables without any
-- index on the columns they're actually filtered/joined by (game_id,
-- deprecation_id) - every read of a single project's depreciation data was
-- scanning the entire table, burning D1's daily row-read quota.
CREATE INDEX "idx_premises_deprecations_game_id" ON "premises_deprecations" ("game_id");
CREATE INDEX "idx_premises_deprecations_yearly_deprecation_id" ON "premises_deprecations_yearly" ("deprecation_id");

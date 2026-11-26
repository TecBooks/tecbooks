import assert from "node:assert/strict";
import test from "node:test";
import {
  assignStudent,
  assertStudentCanChooseTeam,
  autoAssignStudent,
  createTeamState,
  getTeamMembers,
  getRoomState,
  getTeamState,
} from "./team-assignment.service.js";

test("balances new students across teams and keeps assignments on reconnect", () => {
  let state = createTeamState(2);
  state = autoAssignStudent(state, "student-1");
  state = autoAssignStudent(state, "student-2");
  state = autoAssignStudent(state, "student-3");

  assert.deepEqual(state.assignments, {
    "student-1": "team-1",
    "student-2": "team-2",
    "student-3": "team-1",
  });
  assert.equal(autoAssignStudent(state, "student-2"), state);
});

test("loads and initializes room state through the storage service", async () => {
  const values = new Map([["gameState", { status: "running" }]]);
  const storage = {
    get: async (key) => values.get(key),
    transaction: async (callback) =>
      callback({
        get: async (key) => values.get(key),
        put: async (key, value) => values.set(key, value),
      }),
  };

  const roomState = await getRoomState(storage, {
    teamCount: 2,
    user: { role: "student", userId: "student-1" },
  });

  assert.equal(roomState.teamState.assignments["student-1"], "team-1");
  assert.deepEqual(getTeamMembers(roomState.teamState), [
    { userId: "student-1", name: "Student", teamId: "team-1" },
  ]);
  assert.equal(roomState.teamState.allowStudentChanges, false);
  assert.equal(await getTeamState(storage), roomState.teamState);
});

test("allows explicit reassignment and rejects unknown teams", () => {
  const state = createTeamState(2);
  const assigned = assignStudent(state, "student-1", "team-2");

  assert.equal(assigned.assignments["student-1"], "team-2");
  assert.throws(
    () => assignStudent(state, "student-1", "team-3"),
    { message: "Team not found" },
  );
});

test("blocks student changes when disabled or after the game starts", () => {
  const lockedState = {
    ...createTeamState(2),
    allowStudentChanges: false,
  };

  assert.throws(
    () => assertStudentCanChooseTeam(lockedState, "lobby"),
    { message: "The teacher has disabled team changes" },
  );
  assert.throws(
    () => assertStudentCanChooseTeam(createTeamState(2), "running"),
    { message: "Teams cannot be changed after the game starts" },
  );
});

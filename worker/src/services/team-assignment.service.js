export function createTeamState(teamCount) {
  if (!Number.isInteger(teamCount) || teamCount < 2) {
    throw new Error("Game room has invalid team settings");
  }

  return {
    teams: Array.from({ length: teamCount }, (_, index) => ({
      id: `team-${index + 1}`,
      name: `Team ${index + 1}`,
    })),
    assignments: {},
    studentNames: {},
    allowStudentChanges: true,
  };
}

export async function getRoomState(storage, { teamCount, user }) {
  return storage.transaction(async (transaction) => {
    let teamState = await transaction.get("teamState");
    if (!teamState) teamState = createTeamState(teamCount);
    if (!teamState.studentNames) teamState.studentNames = {};
    if (user.role === "student") {
      teamState = autoAssignStudent(teamState, user.userId);
      teamState = {
        ...teamState,
        studentNames: {
          ...teamState.studentNames,
          [user.userId]:
            user.name && user.name !== "Player"
              ? user.name
              : teamState.studentNames[user.userId] || user.name || "Student",
        },
      };
    }

    const gameState = await transaction.get("gameState");
    if (
      gameState?.status &&
      gameState.status !== "lobby" &&
      teamState.allowStudentChanges
    ) {
      teamState = { ...teamState, allowStudentChanges: false };
    }
    await transaction.put("teamState", teamState);
    return { teamState, gameState };
  });
}

export async function getTeamState(storage) {
  return storage.get("teamState");
}

export function getTeamMembers(teamState) {
  return Object.entries(teamState.assignments).map(([userId, teamId]) => ({
    userId,
    name: teamState.studentNames?.[userId] || "Student",
    teamId,
  }));
}

export function autoAssignStudent(teamState, studentId) {
  if (teamState.assignments[studentId]) return teamState;

  const memberCounts = new Map(teamState.teams.map((team) => [team.id, 0]));
  for (const teamId of Object.values(teamState.assignments)) {
    if (memberCounts.has(teamId)) {
      memberCounts.set(teamId, memberCounts.get(teamId) + 1);
    }
  }

  const team = teamState.teams.reduce((leastPopulated, candidate) =>
    memberCounts.get(candidate.id) < memberCounts.get(leastPopulated.id)
      ? candidate
      : leastPopulated,
  );

  return assignStudent(teamState, studentId, team.id);
}

export function assignStudent(teamState, studentId, teamId) {
  if (!teamState.teams.some((team) => team.id === teamId)) {
    throw new Error("Team not found");
  }

  return {
    ...teamState,
    assignments: {
      ...teamState.assignments,
      [studentId]: teamId,
    },
  };
}

export function assertStudentCanChooseTeam(teamState, gameStatus) {
  if (gameStatus !== "lobby") {
    throw new Error("Teams cannot be changed after the game starts");
  }
  if (!teamState.allowStudentChanges) {
    throw new Error("The teacher has disabled team changes");
  }
}

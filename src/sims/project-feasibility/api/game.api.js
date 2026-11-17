import workerApi from "@/utils/worker.util";

export async function getProjects() {
  const { data } = await workerApi.get("/api/games/projects");
  return data;
}

export async function createGame(form) {
  const { data } = await workerApi.post("/api/games/create", form);
  return data;
}

export async function getGameRoom(code) {
  const { data } = await workerApi.get(
    `/api/games/rooms/${encodeURIComponent(code)}`,
  );
  return data;
}

export async function joinGameRoom(code, sessionToken) {
  const { data } = await workerApi.post(
    `/api/games/rooms/${encodeURIComponent(code)}/join`,
    { sessionToken },
  );
  return data;
}

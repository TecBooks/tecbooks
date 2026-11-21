/* createWsRouter - Express-type message handler to decouple durable object 
  functionality, and websockets with business logic.

  How to use: 
    - Create router in Game-room: const 
    - Add routes
    - On GameRoom, dispatch the event
    
    const router = createWsRouter()
    router.on("message", ...middlewares?, function)
    router.dispatch(this, ws, message)

    Function structure:
    fn({ws, user, type, payload, room, reply, error}, next?)
  */
export function createWsRouter() {
  const routes = new Map();

  // Binds routes and controllers
  function on(type, ...handlers) {
    routes.set(type, handlers);
  }

  // Dispatch events and handle errors
  async function dispatch(room, ws, rawMessage) {
    let parsed;

    try {
      const text =
        typeof rawMessage == "string"
          ? rawMessage
          : new TextDecoder().decode(rawMessage);
      parsed = JSON.parse(text);
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    }

    const type = parsed?.type;
    if (!type || !routes.has(type)) {
      ws.send(
        JSON.stringify({ type: "error", message: `Unknown event: ${type}` }),
      );
      return;
    }

    const user = ws.deserializeAttachment() ?? null;

    const ctx = {
      ws,
      user,
      type,
      payload: parsed.payload ?? parsed,
      room,
      reply: (data) => ws.send(JSON.stringify(data)),
      error: (message, code = "BAD_REQUEST") =>
        ws.send(JSON.stringify({ type: "error", code, message })),
    };
    const stack = routes.get(type);

    let index = -1;
    const run = async (i) => {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      const fn = stack[i];
      if (!fn) return;
      await fn(ctx, () => run(i + 1));
    };

    try {
      await run(0);
    } catch (err) {
      console.error(`[WS Error on ${type}]:`, error);
      ctx.error(err?.message || "Internal server error", "SERVER_ERROR");
    }
  }

  return { on, dispatch };
}

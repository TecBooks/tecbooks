export const requireAuth = async ({ user, error }, next) => {
  if (!user) return error("Unauthorized: join the game first", "UNAUTHORIZED");
  await next();
};

export const requireTeacher = async ({ user, error }, next) => {
  if (user?.role !== "teacher") {
    return error("Only teacher can perform this action", "FORBIDEN");
  }
  await next();
};

export const requireFields =
  (...fields) =>
  async ({ payload, error }, next) => {
    const missing = fields.filter((f) => payload?.[f] === undefined);
    if (missing.length > 0) {
      return error(`Missing required fields: ${missing.join(", ")}`);
    }
    await next();
  };

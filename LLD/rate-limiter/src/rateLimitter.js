import { fixedWindowRateLimitter } from "./fixed-size-window/index.js";

export const rateLimitterMiddleware = async (req, res, next) => {
  const { userId } = req.body;
  const key = `user:${userId}`;

  if (!(await fixedWindowRateLimitter.allow(key))) {
    console.log("too many request");

    return res.status(429).json({
      message: "Too many request",
    });
  }

  next();
};

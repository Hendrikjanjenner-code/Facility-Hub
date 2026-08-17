import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { resolveAllowedOrigin } from "./lib/corsOrigin";

const app: Express = express();

// The app runs behind Replit's reverse proxy; trust the first hop so
// req.ip reflects the real client IP (used by the login rate limiter).
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Restrict CORS to an explicitly configured origin. resolveAllowedOrigin
// rejects wildcards and invalid values at startup; when ALLOWED_ORIGIN is
// unset, CORS is disabled entirely (same-origin via the Replit proxy).
app.use(
  cors({
    origin: resolveAllowedOrigin(process.env.ALLOWED_ORIGIN),
    credentials: true,
  }),
);
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET is not set; refusing to start with forgeable session cookies");
}
app.use(cookieParser(sessionSecret));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;

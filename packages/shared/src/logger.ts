import pino from "pino";

export const logger = pino({
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});

export function createLogger(name: string) {
  return logger.child({ module: name });
}

export const logger = {
  info: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== "test") {
      console.info("[nevii-hub]", ...args);
    }
  },
  warn: (...args: unknown[]) => {
    console.warn("[nevii-hub]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[nevii-hub]", ...args);
  },
};

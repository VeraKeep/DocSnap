/**
 * Lightweight in-app error logger.
 *
 * Captures errors with context (message, stack, route, timestamp, user agent)
 * into an in-memory buffer (last 10), logs them to `console.error` in a
 * structured format, and exposes `window.__docSnapErrors` for debugging in dev.
 *
 * No external service — this gives basic visibility without API keys. Sentry
 * (or similar) can be swapped in later without changing call sites: everything
 * funnels through `logError`.
 */

export interface LoggedError {
  /** Error message, optionally prefixed with a context label. */
  message: string;
  /** Stack trace (or a captured stack when the throw value wasn't an Error). */
  stack?: string;
  /** Route (pathname + search) where the error occurred. */
  route: string;
  /** ISO timestamp of when the error was captured. */
  timestamp: string;
  /** Navigator user agent. */
  userAgent: string;
}

declare global {
  interface Window {
    /** Recent errors, newest last. Dev-only debugging hook. */
    __docSnapErrors?: LoggedError[];
  }
}

const MAX_BUFFER_SIZE = 10;

const errorBuffer: LoggedError[] = [];

let listenersInstalled = false;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  return undefined;
}

/** Capture a stack even when the thrown value isn't an Error (e.g. a string). */
function captureStack(): string | undefined {
  try {
    return new Error("captureStack").stack?.split("\n").slice(2).join("\n");
  } catch {
    return undefined;
  }
}

/** Capture a single error into the buffer and log it to the console. */
export function logError(error: unknown, context?: string): LoggedError {
  const entry: LoggedError = {
    message: context ? `${context}: ${getErrorMessage(error)}` : getErrorMessage(error),
    stack: getErrorStack(error) ?? captureStack(),
    route:
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "",
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
  };

  errorBuffer.push(entry);
  if (errorBuffer.length > MAX_BUFFER_SIZE) errorBuffer.shift();

  console.error("[DocSnapError]", JSON.stringify(entry, null, 2));

  // Dev-only debugging hook — don't expose an inspection handle in production.
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    window.__docSnapErrors = [...errorBuffer];
  }

  return entry;
}

/**
 * Install global listeners for unhandled errors and unhandled promise
 * rejections. Safe to call multiple times; returns an uninstall function.
 */
export function installGlobalErrorHandlers(): () => void {
  if (typeof window === "undefined" || listenersInstalled) return () => {};

  const onError = (event: ErrorEvent) => {
    logError(event.error ?? new Error(event.message), "unhandled-error");
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    logError(event.reason, "unhandled-rejection");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  listenersInstalled = true;

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    listenersInstalled = false;
  };
}

/** Read the buffered errors (newest last). Useful for tests and debugging. */
export function getLoggedErrors(): readonly LoggedError[] {
  return errorBuffer;
}

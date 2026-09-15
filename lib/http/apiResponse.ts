/**
 * Shared client-side response handling for JSON API routes.
 *
 * Distinguishes a genuine network failure (fetch() itself rejected) from an
 * HTTP error response, and never assumes a response body is valid JSON —
 * the default Next.js error page for an unhandled server exception is HTML,
 * not JSON, and calling res.json() on it throws a SyntaxError that looks
 * identical to a network failure unless handled explicitly.
 */

export interface ApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

export interface ApiFailure {
  ok: false;
  /** Stable machine-readable code. Server-provided when available. */
  code: string;
  /** Human-readable message, safe to show directly to the user. */
  message: string;
  /** Absent only for a genuine network failure (no response was received). */
  status?: number;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export interface ParseJsonResponseOptions {
  /** Code to report when a 5xx response has no usable JSON body. */
  serverErrorCode?: string;
  /** Fallback message to report when a 5xx response has no usable JSON body. */
  serverErrorMessage?: string;
}

/**
 * Parses a fetch() Response that is expected to carry a JSON body, without
 * assuming it actually does. Safe for empty bodies, HTML error pages, and
 * plain-text responses.
 */
export async function parseJsonResponse<T = unknown>(
  res: Response,
  options: ParseJsonResponseOptions = {},
): Promise<ApiResult<T>> {
  const serverErrorCode = options.serverErrorCode ?? "SERVER_ERROR";
  const serverErrorMessage =
    options.serverErrorMessage ?? "The server hit an unexpected error. Please try again.";

  const contentType = res.headers.get("content-type") ?? "";
  const looksJson = contentType.toLowerCase().includes("application/json");

  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    bodyText = "";
  }

  let parsed: unknown = undefined;
  let parseFailed = false;
  if (looksJson && bodyText.trim().length > 0) {
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parseFailed = true;
    }
  }

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

  if (res.ok) {
    if (looksJson && !parseFailed && parsed !== undefined) {
      return { ok: true, status: res.status, data: parsed as T };
    }
    return {
      ok: false,
      code: "INVALID_SERVER_RESPONSE",
      message: "Server returned an unexpected response.",
      status: res.status,
    };
  }

  if (looksJson && !parseFailed && isRecord(parsed)) {
    const message =
      typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.message === "string"
          ? parsed.message
          : res.status >= 500
            ? serverErrorMessage
            : "The request was rejected.";
    const code =
      typeof parsed.code === "string"
        ? parsed.code
        : res.status >= 500
          ? serverErrorCode
          : "REQUEST_ERROR";
    return { ok: false, code, message, status: res.status };
  }

  if (res.status >= 500) {
    return { ok: false, code: serverErrorCode, message: serverErrorMessage, status: res.status };
  }

  return {
    ok: false,
    code: "INVALID_SERVER_RESPONSE",
    message: "Server returned an unexpected (non-JSON) response.",
    status: res.status,
  };
}

/**
 * Renders an ApiFailure as a single line safe to show the user: the network
 * message alone for NETWORK_ERROR (so it stays exactly recognizable as the
 * "no connection" case), otherwise the backend's message plus its code and
 * HTTP status for context.
 */
export function formatApiError(failure: ApiFailure): string {
  if (failure.code === "NETWORK_ERROR") return failure.message;
  const statusSuffix = failure.status !== undefined ? `, HTTP ${failure.status}` : "";
  return `${failure.message} [${failure.code}${statusSuffix}]`;
}

/**
 * fetch() + parseJsonResponse(), collapsing an actual network failure (DNS,
 * connection refused, offline, aborted, CORS) into a NETWORK_ERROR result
 * instead of letting it escape as a thrown exception.
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: ParseJsonResponseOptions,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "Could not reach the server." };
  }
  return parseJsonResponse<T>(res, options);
}

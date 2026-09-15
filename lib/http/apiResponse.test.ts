import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, formatApiError, parseJsonResponse } from "./apiResponse";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function htmlResponse(status = 500) {
  return new Response("<html><body>Internal Server Error</body></html>", {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

describe("parseJsonResponse", () => {
  it("parses a valid 2xx JSON body", async () => {
    const result = await parseJsonResponse(jsonResponse({ pages: [1, 2, 3] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ pages: [1, 2, 3] });
  });

  it("surfaces the backend error/code for a 4xx JSON body", async () => {
    const result = await parseJsonResponse(
      jsonResponse({ error: "Invalid facing pair.", code: "INVALID_CUSTOM_SPREADS" }, 400),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CUSTOM_SPREADS");
      expect(result.message).toBe("Invalid facing pair.");
      expect(result.status).toBe(400);
    }
  });

  it("falls back to PROMPTS_SERVER_ERROR for a 5xx HTML error page (the original bug)", async () => {
    const result = await parseJsonResponse(htmlResponse(500), {
      serverErrorCode: "PROMPTS_SERVER_ERROR",
      serverErrorMessage: "The server hit an unexpected error.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PROMPTS_SERVER_ERROR");
      expect(result.status).toBe(500);
      // Must not be the generic network message — this was a real response.
      expect(result.message).not.toBe("Could not reach the server.");
    }
  });

  it("reports INVALID_SERVER_RESPONSE for a 2xx non-JSON body", async () => {
    const result = await parseJsonResponse(
      new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_SERVER_RESPONSE");
  });

  it("reports INVALID_SERVER_RESPONSE for an empty 200 body", async () => {
    const result = await parseJsonResponse(new Response("", { status: 200 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_SERVER_RESPONSE");
  });

  it("reports INVALID_SERVER_RESPONSE for a non-JSON 4xx body", async () => {
    const result = await parseJsonResponse(
      new Response("Bad Request", { status: 400, headers: { "content-type": "text/plain" } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_SERVER_RESPONSE");
  });
});

describe("fetchJson", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reports NETWORK_ERROR only for a genuine fetch rejection", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await fetchJson("/api/prompts", { method: "POST" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NETWORK_ERROR");
      expect(result.message).toBe("Could not reach the server.");
      expect(result.status).toBeUndefined();
    }
  });

  it("does not report NETWORK_ERROR for a successfully-received 5xx response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(htmlResponse(500));
    const result = await fetchJson("/api/prompts", { method: "POST" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).not.toBe("NETWORK_ERROR");
      expect(result.status).toBe(500);
    }
  });

  it("returns the parsed body on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const result = await fetchJson("/api/prompts", { method: "POST" });
    expect(result).toEqual({ ok: true, status: 200, data: { ok: true } });
  });
});

describe("formatApiError", () => {
  it("shows the network message verbatim, with no extra suffix", () => {
    expect(
      formatApiError({ ok: false, code: "NETWORK_ERROR", message: "Could not reach the server." }),
    ).toBe("Could not reach the server.");
  });

  it("includes the backend code and HTTP status for a non-network failure", () => {
    expect(
      formatApiError({
        ok: false,
        code: "INVALID_CUSTOM_SPREADS",
        message: "Invalid facing pair.",
        status: 400,
      }),
    ).toBe("Invalid facing pair. [INVALID_CUSTOM_SPREADS, HTTP 400]");
  });
});

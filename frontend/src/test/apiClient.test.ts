import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function clearCsrfCookie() {
  document.cookie = "lss_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

function expectCapturedRequest(request: Request | null): Request {
  if (!request) {
    throw new Error("Request was not captured");
  }
  return request;
}

async function loadApiClientModule(baseUrl?: string) {
  vi.resetModules();
  if (baseUrl) {
    vi.stubEnv("VITE_API_BASE_URL", baseUrl);
  } else {
    vi.unstubAllEnvs();
  }
  return import("../api/client");
}

describe("api/client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearCsrfCookie();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    clearCsrfCookie();
  });

  it("attaches CSRF header to state-changing requests", async () => {
    document.cookie = "lss_csrf=test-csrf-token; path=/";
    let capturedRequest: Request | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = input instanceof Request ? input : new Request(input, init);
      return new Response(JSON.stringify({
        id: "project-1",
        name: "Project 1",
        description: "",
        meta: {},
        created_at: "2026-01-01T00:00:00Z",
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }));

    const { client } = await loadApiClientModule("https://example.test/api");
    await client.POST("/projects", {
      body: { name: "Project 1", description: "", meta: {} },
    });

    const request = expectCapturedRequest(capturedRequest);
    expect(request.headers.get("X-CSRF-Token")).toBe("test-csrf-token");
  });

  it("keeps auth session creation exempt from CSRF even when the base URL is absolute", async () => {
    document.cookie = "lss_csrf=test-csrf-token; path=/";
    let capturedRequest: Request | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = input instanceof Request ? input : new Request(input, init);
      return new Response(JSON.stringify({
        id: "user-1",
        username: "demo",
        meta: {},
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    const { client } = await loadApiClientModule("https://example.test/api");
    await client.POST("/auth/session", {
      body: { username: "demo", password: "secret" },
    });

    const request = expectCapturedRequest(capturedRequest);
    expect(request.url).toBe("https://example.test/api/auth/session");
    expect(request.headers.get("X-CSRF-Token")).toBeNull();
  });

  it("formats JSON detail payloads into ApiError messages", async () => {
    const { ApiError, unwrapData } = await loadApiClientModule();

    await expect(
      unwrapData(Promise.resolve({
        response: new Response(null, { status: 400, statusText: "Bad Request" }),
        error: {
          detail: [{ loc: ["body", "name"], msg: "Field required" }],
        },
      })),
    ).rejects.toEqual(new ApiError("body.name: Field required", 400));
  });

  it("falls back to plain-text response bodies for unwrapVoid", async () => {
    const { ApiError, unwrapVoid } = await loadApiClientModule();

    await expect(
      unwrapVoid(Promise.resolve({
        response: new Response("boom", {
          status: 500,
          statusText: "Server Error",
          headers: { "content-type": "text/plain" },
        }),
      })),
    ).rejects.toEqual(new ApiError("boom", 500));
  });
});

import createClient from "openapi-fetch";
import type { paths } from "../generated/openapi";

const DEFAULT_API_BASE_URL = "/api";
const CSRF_COOKIE_NAME = "lss_csrf";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const METHODS_REQUIRING_CSRF = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_ROUTES = new Set(["POST /auth/session", "POST /auth/token"]);

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function readCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }
  const prefix = `${name}=`;
  for (const cookie of document.cookie.split(";")) {
    const normalized = cookie.trim();
    if (normalized.startsWith(prefix)) {
      return decodeURIComponent(normalized.slice(prefix.length));
    }
  }
  return null;
}

function formatErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const message = "msg" in item && typeof item.msg === "string" ? item.msg : null;
        if (!message) {
          return null;
        }
        const location =
          "loc" in item && Array.isArray(item.loc)
            ? item.loc
                .filter((part: unknown): part is string | number => typeof part === "string" || typeof part === "number")
                .join(".")
            : "";
        return location ? `${location}: ${message}` : message;
      })
      .filter((message): message is string => Boolean(message));
    return messages.length > 0 ? messages.join("\n") : null;
  }
  if (detail && typeof detail === "object") {
    if ("msg" in detail && typeof detail.msg === "string" && detail.msg.trim()) {
      return detail.msg;
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return null;
    }
  }
  return null;
}

async function toApiError(response: Response): Promise<ApiError> {
  if (response.ok) {
    throw new Error("toApiError called with ok response");
  }
  const contentType = response.headers.get("content-type") ?? "";
  const text = (await response.text()).trim();
  if (contentType.includes("application/json") && text) {
    try {
      const json = JSON.parse(text) as { detail?: unknown };
      return new ApiError(formatErrorDetail(json.detail) ?? text, response.status);
    } catch {
      // Fall back to the raw body/status text when the server claims JSON but returns malformed content.
    }
  }
  return new ApiError(text || response.statusText || "Request failed", response.status);
}

function toRequestPath(url: URL, baseUrl: string) {
  const basePath = new URL(baseUrl, window.location.origin).pathname.replace(/\/$/, "");
  if (!url.pathname.startsWith(basePath)) {
    return url.pathname;
  }
  const path = url.pathname.slice(basePath.length);
  return path.startsWith("/") ? path : `/${path}`;
}

function shouldAttachCsrf(request: Request, baseUrl: string) {
  if (!METHODS_REQUIRING_CSRF.has(request.method.toUpperCase())) {
    return false;
  }
  const path = toRequestPath(new URL(request.url, window.location.origin), baseUrl);
  return !CSRF_EXEMPT_ROUTES.has(`${request.method.toUpperCase()} ${path}`);
}

async function toApiErrorFromResult(response: Response, error: unknown): Promise<ApiError> {
  if (typeof error !== "undefined") {
    const detail =
      error && typeof error === "object" && "detail" in error
        ? (error as { detail?: unknown }).detail
        : error;
    return new ApiError(
      formatErrorDetail(detail) ?? (response.statusText || "Request failed"),
      response.status,
    );
  }
  return toApiError(response);
}

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");

export const client = createClient<paths>({
  baseUrl: apiBaseUrl,
  credentials: "include",
});

client.use({
  onRequest({ request }) {
    if (typeof document !== "undefined" && shouldAttachCsrf(request, apiBaseUrl)) {
      const csrfToken = readCookie(CSRF_COOKIE_NAME);
      if (csrfToken) {
        request.headers.set(CSRF_HEADER_NAME, csrfToken);
      }
    }
    return request;
  },
});

export async function unwrapData<T>(result: Promise<{ data?: T; error?: unknown; response: Response }>) {
  const { data, error, response } = await result;
  if (!response.ok) {
    throw await toApiErrorFromResult(response, error);
  }
  if (typeof data === "undefined") {
    throw new ApiError("Response data is missing", 500);
  }
  return data;
}

export async function unwrapVoid(result: Promise<{ error?: unknown; response: Response }>) {
  const { error, response } = await result;
  if (!response.ok) {
    throw await toApiErrorFromResult(response, error);
  }
}

import createClient from "openapi-fetch";
import type { paths } from "./generated/openapi";
import type {
  AnnotationRecord,
  AnnotationSearchResponse,
  CreateDocumentInput,
  CreateProjectInput,
  DocumentListResponse,
  DocumentRecord,
  ExportResponse,
  ImportPayload,
  ImportResponse,
  LabelListResponse,
  LabelRecord,
  LabelSurfaceGroupsResponse,
  ProjectImportResponse,
  ProjectListItemRecord,
  ProjectRecord,
  SaveDocumentAnnotationInput,
  SaveProjectLabelInput,
  UserRecord,
} from "./api-contract";
import type { JsonObject } from "./types";
import { toJsonObject } from "./utils";

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

function assertLabelListResponseRevision(payload: LabelListResponse): LabelListResponse {
  if (!payload.revision || payload.revision.trim().length === 0) {
    throw new ApiError("Labels revision が取得できなかった", 500);
  }
  return payload;
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
  if (!url.pathname.startsWith(baseUrl)) {
    return url.pathname;
  }
  const path = url.pathname.slice(baseUrl.length);
  return path.startsWith("/") ? path : `/${path}`;
}

function shouldAttachCsrf(request: Request, baseUrl: string) {
  if (!METHODS_REQUIRING_CSRF.has(request.method.toUpperCase())) {
    return false;
  }
  const path = toRequestPath(new URL(request.url, window.location.origin), baseUrl);
  return !CSRF_EXEMPT_ROUTES.has(`${request.method.toUpperCase()} ${path}`);
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
const client = createClient<paths>({
  baseUrl,
  credentials: "include",
});

client.use({
  onRequest({ request }) {
    if (typeof document !== "undefined" && shouldAttachCsrf(request, baseUrl)) {
      const csrfToken = readCookie(CSRF_COOKIE_NAME);
      if (csrfToken) {
        request.headers.set(CSRF_HEADER_NAME, csrfToken);
      }
    }
    return request;
  },
});

async function unwrapData<T>(result: Promise<{ data?: T; error?: unknown; response: Response }>) {
  const { data, error, response } = await result;
  if (!response.ok) {
    throw await toApiErrorFromResult(response, error);
  }
  if (typeof data === "undefined") {
    throw new ApiError("Response data is missing", 500);
  }
  return data;
}

async function unwrapVoid(result: Promise<{ error?: unknown; response: Response }>) {
  const { error, response } = await result;
  if (!response.ok) {
    throw await toApiErrorFromResult(response, error);
  }
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

export class ApiClient {
  readonly baseUrl: string;

  constructor(baseUrl = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async createSession(username: string, password: string) {
    return unwrapData<UserRecord>(client.POST("/auth/session", {
      body: { username, password },
    }));
  }

  async getSession() {
    return unwrapData<UserRecord>(client.GET("/auth/session"));
  }

  async deleteSession() {
    await unwrapVoid(client.DELETE("/auth/session"));
  }

  async listProjects() {
    return unwrapData<{ projects: ProjectListItemRecord[] }>(client.GET("/projects"));
  }

  async createProject(project: Pick<CreateProjectInput, "name" | "description" | "meta">) {
    return unwrapData<ProjectRecord>(client.POST("/projects", {
      body: {
        name: project.name,
        description: project.description ?? "",
        meta: toJsonObject(project.meta ?? null),
      },
    }));
  }

  async getProject(projectId: string) {
    return unwrapData<ProjectRecord>(client.GET("/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    }));
  }

  async deleteProject(projectId: string) {
    await unwrapVoid(client.DELETE("/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    }));
  }

  async saveProjectSettings(project: ProjectRecord) {
    return unwrapData<ProjectRecord>(client.PUT("/projects/{project_id}/settings", {
      params: { path: { project_id: project.id } },
      body: {
        name: project.name,
        description: project.description ?? "",
        meta: toJsonObject(project.meta ?? null),
      },
    }));
  }

  async listLabels(projectId: string) {
    const payload = await unwrapData<LabelListResponse>(client.GET("/projects/{project_id}/labels", {
      params: { path: { project_id: projectId } },
    }));
    return assertLabelListResponseRevision(payload);
  }

  async saveProjectLabels(
    projectId: string,
    labels: Array<Pick<SaveProjectLabelInput, "name" | "color" | "description" | "shortcut" | "meta"> & { id: string | null }>,
    baseRevision: string,
  ) {
    const payload = await unwrapData<LabelListResponse>(client.PUT("/projects/{project_id}/labels", {
      params: { path: { project_id: projectId } },
      body: {
        base_revision: baseRevision,
        labels: labels.map((label) => ({
          ...label,
          meta: toJsonObject(label.meta ?? null),
        })),
      },
    }));
    return assertLabelListResponseRevision(payload);
  }

  async listDocuments(projectId: string, options?: { offset?: number; limit?: number; search?: string; sort?: string }) {
    return unwrapData<DocumentListResponse>(client.GET("/projects/{project_id}/documents", {
      params: {
        path: { project_id: projectId },
        query: {
          offset: options?.offset ?? 0,
          limit: options?.limit ?? 100,
          search: options?.search ?? "",
          sort: (options?.sort ?? "created") as "created" | "pending" | "updated" | "name",
        },
      },
    }));
  }

  async getDocument(projectId: string, documentId: string) {
    return unwrapData<DocumentRecord>(client.GET("/projects/{project_id}/documents/{document_id}", {
      params: {
        path: { project_id: projectId, document_id: documentId },
      },
    }));
  }

  async saveDocumentBundle(
    projectId: string,
    documentId: string,
    annotations: Array<
      Pick<SaveDocumentAnnotationInput, "label_id" | "start" | "end" | "span_text" | "comment" | "status" | "meta"> & {
        id: string | null;
      }
    >,
    submit = false,
  ) {
    return unwrapData<DocumentRecord>(client.PUT("/projects/{project_id}/documents/{document_id}/bundle", {
      params: {
        path: { project_id: projectId, document_id: documentId },
      },
      body: {
        submit,
        annotations: annotations.map((annotation) => ({
          ...annotation,
          meta: toJsonObject(annotation.meta ?? null),
        })),
      },
    }));
  }

  async createDocument(projectId: string, document: Pick<CreateDocumentInput, "document_name" | "text" | "meta">) {
    return unwrapData<Omit<DocumentRecord, "annotations">>(client.POST("/projects/{project_id}/documents", {
      params: {
        path: { project_id: projectId },
      },
      body: {
        document_name: document.document_name,
        text: document.text,
        meta: toJsonObject(document.meta ?? null),
      },
    }));
  }

  async deleteDocument(projectId: string, documentId: string) {
    await unwrapVoid(client.DELETE("/projects/{project_id}/documents/{document_id}", {
      params: {
        path: { project_id: projectId, document_id: documentId },
      },
    }));
  }

  async listLabelSurfaceGroups(
    projectId: string,
    labelId: string,
    options?: { offset?: number; limit?: number; status?: string; contextWindow?: number; excludeAnnotationId?: string | null },
  ) {
    return unwrapData<LabelSurfaceGroupsResponse>(client.GET("/projects/{project_id}/labels/{label_id}/surface-groups", {
      params: {
        path: { project_id: projectId, label_id: labelId },
        query: {
          offset: options?.offset ?? 0,
          limit: options?.limit ?? 50,
          status: (options?.status ?? "verified") as "pending" | "verified" | "all",
          context_window: options?.contextWindow ?? 20,
          exclude_annotation_id: options?.excludeAnnotationId ?? undefined,
        },
      },
    }));
  }

  async searchAnnotations(
    projectId: string,
    options: {
      text: string;
      status?: string;
      labelId?: string | null;
      excludeAnnotationId?: string | null;
      offset?: number;
      limit?: number;
      contextWindow?: number;
    },
  ) {
    return unwrapData<AnnotationSearchResponse>(client.GET("/projects/{project_id}/annotations/search", {
      params: {
        path: { project_id: projectId },
        query: {
          text: options.text,
          status: (options.status ?? "verified") as "pending" | "verified" | "all",
          label_id: options.labelId ?? undefined,
          exclude_annotation_id: options.excludeAnnotationId ?? undefined,
          offset: options.offset ?? 0,
          limit: options.limit ?? 50,
          context_window: options.contextWindow ?? 20,
        },
      },
    }));
  }

  async importProjectAsNew(payload: JsonObject) {
    return unwrapData<ProjectImportResponse>(client.POST("/projects/import", {
      body: payload as ImportPayload,
    }));
  }

  async importProject(projectId: string, payload: JsonObject) {
    return unwrapData<ImportResponse>(client.POST("/projects/{project_id}/import", {
      params: {
        path: { project_id: projectId },
      },
      body: payload as ImportPayload,
    }));
  }

  async exportProject(projectId: string, includePending: boolean, includeVerified: boolean) {
    return unwrapData<ExportResponse>(client.POST("/projects/{project_id}/export", {
      params: {
        path: { project_id: projectId },
      },
      body: {
        include_pending: includePending,
        include_verified: includeVerified,
      },
    }));
  }
}

export const api = new ApiClient();

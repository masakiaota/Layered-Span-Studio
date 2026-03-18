import type {
  AnnotationRecord,
  AnnotationSearchResponse,
  DocumentRecord,
  DocumentListResponse,
  ExportResponse,
  ImportResponse,
  JsonObject,
  LabelListResponse,
  LabelSurfaceGroupsResponse,
  LabelRecord,
  ProjectImportResponse,
  ProjectListItemRecord,
  ProjectRecord,
  UserRecord,
} from "./types";
import { toJsonObject } from "./utils";

const DEFAULT_API_BASE_URL = "/api";
const CSRF_COOKIE_NAME = "lss_csrf";
const CSRF_HEADER_NAME = "X-CSRF-Token";

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

function headers(contentType?: string, includeCsrf = false) {
  const result = new Headers();
  if (contentType) {
    result.set("Content-Type", contentType);
  }
  if (includeCsrf) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      result.set(CSRF_HEADER_NAME, csrfToken);
    }
  }
  return result;
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

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

type RequestOptions = {
  method?: string;
  body?: BodyInit | null;
  contentType?: string;
  includeCsrf?: boolean;
  signal?: AbortSignal;
};

export class ApiClient {
  readonly baseUrl: string;

  constructor(baseUrl = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(path: string, options: RequestOptions = {}) {
    return fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      body: options.body,
      headers: headers(options.contentType, options.includeCsrf),
      credentials: "include",
      signal: options.signal,
    });
  }

  async createSession(username: string, password: string, signal?: AbortSignal) {
    const response = await this.request("/auth/session", {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ username, password }),
      signal,
    });
    return parseResponse<UserRecord>(response);
  }

  async getSession(signal?: AbortSignal) {
    const response = await this.request("/auth/session", { signal });
    return parseResponse<UserRecord>(response);
  }

  async deleteSession(signal?: AbortSignal) {
    const response = await this.request("/auth/session", {
      method: "DELETE",
      includeCsrf: true,
      signal,
    });
    if (!response.ok) {
      throw await toApiError(response);
    }
  }

  async listProjects(signal?: AbortSignal) {
    const response = await this.request("/projects", { signal });
    return parseResponse<{ projects: ProjectListItemRecord[] }>(response);
  }

  async createProject(project: Pick<ProjectRecord, "name" | "description" | "meta">) {
    const response = await this.request("/projects", {
      method: "POST",
      contentType: "application/json",
      includeCsrf: true,
      body: JSON.stringify({
        name: project.name,
        description: project.description ?? "",
        meta: toJsonObject(project.meta),
      }),
    });
    return parseResponse<ProjectRecord>(response);
  }

  async getProject(projectId: string) {
    const response = await this.request(`/projects/${projectId}`);
    return parseResponse<ProjectRecord>(response);
  }

  async deleteProject(projectId: string) {
    const response = await this.request(`/projects/${projectId}`, {
      method: "DELETE",
      includeCsrf: true,
    });
    if (!response.ok) {
      throw await toApiError(response);
    }
  }

  async saveProjectSettings(project: ProjectRecord) {
    const response = await this.request(`/projects/${project.id}/settings`, {
      method: "PUT",
      contentType: "application/json",
      includeCsrf: true,
      body: JSON.stringify({
        name: project.name,
        description: project.description ?? "",
        meta: toJsonObject(project.meta),
      }),
    });
    return parseResponse<ProjectRecord>(response);
  }

  async listLabels(projectId: string) {
    const response = await this.request(`/projects/${projectId}/labels`);
    return assertLabelListResponseRevision(await parseResponse<LabelListResponse>(response));
  }

  async saveProjectLabels(
    projectId: string,
    labels: Array<
      Pick<LabelRecord, "name" | "color" | "description" | "shortcut" | "meta"> & {
        id: string | null;
      }
    >,
    baseRevision: string,
  ) {
    const response = await this.request(`/projects/${projectId}/labels`, {
      method: "PUT",
      contentType: "application/json",
      includeCsrf: true,
      body: JSON.stringify({
        base_revision: baseRevision,
        labels: labels.map((label) => ({
          ...label,
          meta: toJsonObject(label.meta),
        })),
      }),
    });
    return assertLabelListResponseRevision(await parseResponse<LabelListResponse>(response));
  }

  async listDocuments(projectId: string, options?: { offset?: number; limit?: number; search?: string; sort?: string }) {
    const query = new URLSearchParams({
      offset: String(options?.offset ?? 0),
      limit: String(options?.limit ?? 100),
      search: options?.search ?? "",
      sort: options?.sort ?? "created",
    });
    const response = await this.request(`/projects/${projectId}/documents?${query.toString()}`);
    return parseResponse<DocumentListResponse>(response);
  }

  async getDocument(projectId: string, documentId: string) {
    const response = await this.request(`/projects/${projectId}/documents/${documentId}`);
    return parseResponse<DocumentRecord>(response);
  }

  async saveDocumentBundle(
    projectId: string,
    documentId: string,
    annotations: Array<
      Pick<AnnotationRecord, "label_id" | "start" | "end" | "span_text" | "comment" | "status" | "meta"> & {
        id: string | null;
      }
    >,
    submit = false,
  ) {
    const response = await this.request(`/projects/${projectId}/documents/${documentId}/bundle`, {
      method: "PUT",
      contentType: "application/json",
      includeCsrf: true,
      body: JSON.stringify({
        submit,
        annotations: annotations.map((annotation) => ({
          ...annotation,
          meta: toJsonObject(annotation.meta),
        })),
      }),
    });
    return parseResponse<DocumentRecord>(response);
  }

  async createDocument(projectId: string, document: Pick<DocumentRecord, "document_name" | "text" | "meta">) {
    const response = await this.request(`/projects/${projectId}/documents`, {
      method: "POST",
      contentType: "application/json",
      includeCsrf: true,
      body: JSON.stringify({
        document_name: document.document_name,
        text: document.text,
        meta: toJsonObject(document.meta),
      }),
    });
    return parseResponse<Omit<DocumentRecord, "annotations">>(response);
  }

  async deleteDocument(projectId: string, documentId: string) {
    const response = await this.request(`/projects/${projectId}/documents/${documentId}`, {
      method: "DELETE",
      includeCsrf: true,
    });
    if (!response.ok) {
      throw await toApiError(response);
    }
  }

  async listLabelSurfaceGroups(
    projectId: string,
    labelId: string,
    options?: { offset?: number; limit?: number; status?: string; contextWindow?: number; excludeAnnotationId?: string | null },
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({
      offset: String(options?.offset ?? 0),
      limit: String(options?.limit ?? 50),
      status: options?.status ?? "verified",
      context_window: String(options?.contextWindow ?? 20),
    });
    if (options?.excludeAnnotationId) {
      query.set("exclude_annotation_id", options.excludeAnnotationId);
    }
    const response = await this.request(`/projects/${projectId}/labels/${labelId}/surface-groups?${query.toString()}`, {
      signal,
    });
    return parseResponse<LabelSurfaceGroupsResponse>(response);
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
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({
      text: options.text,
      status: options.status ?? "verified",
      offset: String(options.offset ?? 0),
      limit: String(options.limit ?? 50),
      context_window: String(options.contextWindow ?? 20),
    });
    if (options.labelId) {
      query.set("label_id", options.labelId);
    }
    if (options.excludeAnnotationId) {
      query.set("exclude_annotation_id", options.excludeAnnotationId);
    }
    const response = await this.request(`/projects/${projectId}/annotations/search?${query.toString()}`, {
      signal,
    });
    return parseResponse<AnnotationSearchResponse>(response);
  }

  async importProjectAsNew(payload: JsonObject) {
    const response = await this.request("/projects/import", {
      method: "POST",
      contentType: "application/json",
      includeCsrf: true,
      body: JSON.stringify(payload),
    });
    return parseResponse<ProjectImportResponse>(response);
  }

  async importProject(projectId: string, payload: JsonObject) {
    const response = await this.request(`/projects/${projectId}/import`, {
      method: "POST",
      contentType: "application/json",
      includeCsrf: true,
      body: JSON.stringify(payload),
    });
    return parseResponse<ImportResponse>(response);
  }

  async exportProject(projectId: string, includePending: boolean, includeVerified: boolean) {
    const response = await this.request(`/projects/${projectId}/export`, {
      method: "POST",
      contentType: "application/json",
      includeCsrf: true,
      body: JSON.stringify({
        include_pending: includePending,
        include_verified: includeVerified,
      }),
    });
    return parseResponse<ExportResponse>(response);
  }
}

export const api = new ApiClient();

import type {
  AnnotationRecord,
  AnnotationSearchResponse,
  DocumentRecord,
  DocumentListResponse,
  ExportResponse,
  ImportResponse,
  JsonObject,
  LabelSurfaceGroupsResponse,
  LabelRecord,
  LoginResponse,
  ProjectImportResponse,
  ProjectListItemRecord,
  ProjectRecord,
  UserRecord,
} from "./types";
import { toJsonObject } from "./utils";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function headers(token?: string, contentType?: string) {
  const result = new Headers();
  if (token) {
    result.set("Authorization", `Bearer ${token}`);
  }
  if (contentType) {
    result.set("Content-Type", contentType);
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

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await response.json()) as { detail?: unknown };
      throw new Error(formatErrorDetail(json.detail) ?? "Request failed");
    }
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

export class ApiClient {
  readonly baseUrl: string;

  constructor(baseUrl = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async login(username: string, password: string) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: headers(undefined, "application/json"),
      body: JSON.stringify({ username, password }),
    });
    return parseResponse<LoginResponse>(response);
  }

  async getMe(token: string) {
    const response = await fetch(`${this.baseUrl}/auth/me`, { headers: headers(token) });
    return parseResponse<UserRecord>(response);
  }

  async listProjects(token: string) {
    const response = await fetch(`${this.baseUrl}/projects`, { headers: headers(token) });
    return parseResponse<{ projects: ProjectListItemRecord[] }>(response);
  }

  async getProject(token: string, projectId: string) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}`, { headers: headers(token) });
    return parseResponse<ProjectRecord>(response);
  }

  async saveProjectSettings(token: string, project: ProjectRecord) {
    const response = await fetch(`${this.baseUrl}/projects/${project.id}/settings`, {
      method: "PUT",
      headers: headers(token, "application/json"),
      body: JSON.stringify({
        name: project.name,
        description: project.description ?? "",
        meta: toJsonObject(project.meta),
      }),
    });
    return parseResponse<ProjectRecord>(response);
  }

  async listLabels(token: string, projectId: string) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/labels`, { headers: headers(token) });
    return parseResponse<{ labels: LabelRecord[] }>(response);
  }

  async saveProjectLabels(
    token: string,
    projectId: string,
    labels: Array<
      Pick<LabelRecord, "name" | "color" | "description" | "shortcut" | "meta"> & {
        id: string | null;
      }
    >,
  ) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/labels`, {
      method: "PUT",
      headers: headers(token, "application/json"),
      body: JSON.stringify({
        labels: labels.map((label) => ({
          ...label,
          meta: toJsonObject(label.meta),
        })),
      }),
    });
    return parseResponse<{ labels: LabelRecord[] }>(response);
  }

  async listDocuments(
    token: string,
    projectId: string,
    options?: { offset?: number; limit?: number; search?: string; sort?: string },
  ) {
    const query = new URLSearchParams({
      offset: String(options?.offset ?? 0),
      limit: String(options?.limit ?? 100),
      search: options?.search ?? "",
      sort: options?.sort ?? "created",
    });
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/documents?${query.toString()}`, {
      headers: headers(token),
    });
    return parseResponse<DocumentListResponse>(response);
  }

  async getDocument(token: string, projectId: string, documentId: string) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/documents/${documentId}`, {
      headers: headers(token),
    });
    return parseResponse<DocumentRecord>(response);
  }

  async saveDocumentBundle(
    token: string,
    projectId: string,
    documentId: string,
    annotations: Array<
      Pick<AnnotationRecord, "label_id" | "start" | "end" | "span_text" | "comment" | "status" | "meta"> & {
        id: string | null;
      }
    >,
    submit = false,
  ) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/documents/${documentId}/bundle`, {
      method: "PUT",
      headers: headers(token, "application/json"),
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

  async createDocument(
    token: string,
    projectId: string,
    document: Pick<DocumentRecord, "document_name" | "text" | "meta">,
  ) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/documents`, {
      method: "POST",
      headers: headers(token, "application/json"),
      body: JSON.stringify({
        document_name: document.document_name,
        text: document.text,
        meta: toJsonObject(document.meta),
      }),
    });
    return parseResponse<Omit<DocumentRecord, "annotations">>(response);
  }

  async listLabelSurfaceGroups(
    token: string,
    projectId: string,
    labelId: string,
    options?: { offset?: number; limit?: number; status?: string; contextWindow?: number; excludeAnnotationId?: string | null },
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
    const response = await fetch(
      `${this.baseUrl}/projects/${projectId}/labels/${labelId}/surface-groups?${query.toString()}`,
      {
        headers: headers(token),
      },
    );
    return parseResponse<LabelSurfaceGroupsResponse>(response);
  }

  async searchAnnotations(
    token: string,
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
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/annotations/search?${query.toString()}`, {
      headers: headers(token),
    });
    return parseResponse<AnnotationSearchResponse>(response);
  }

  async importProjectAsNew(token: string, payload: JsonObject) {
    const response = await fetch(`${this.baseUrl}/projects/import`, {
      method: "POST",
      headers: headers(token, "application/json"),
      body: JSON.stringify(payload),
    });
    return parseResponse<ProjectImportResponse>(response);
  }

  async importProject(token: string, projectId: string, payload: JsonObject) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/import`, {
      method: "POST",
      headers: headers(token, "application/json"),
      body: JSON.stringify(payload),
    });
    return parseResponse<ImportResponse>(response);
  }

  async exportProject(token: string, projectId: string, includePending: boolean, includeVerified: boolean) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/export`, {
      method: "POST",
      headers: headers(token, "application/json"),
      body: JSON.stringify({
        include_pending: includePending,
        include_verified: includeVerified,
      }),
    });
    return parseResponse<ExportResponse>(response);
  }
}

export const api = new ApiClient();

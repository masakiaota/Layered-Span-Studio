import type {
  AnnotationRecord,
  AnnotationSearchResponse,
  DocumentRecord,
  DocumentListResponse,
  ExportResponse,
  ImportResponse,
  JsonObject,
  LabelExampleRecord,
  LabelSurfaceGroupsResponse,
  LabelRecord,
  LoginResponse,
  ProjectBundle,
  ProjectImportResponse,
  ProjectRecord,
  UserRecord,
} from "./types";
import {
  annotationEquals,
  deepClone,
  documentEquals,
  isLocalId,
  labelEquals,
  projectEquals,
  toJsonObject,
} from "./utils";

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

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await response.json()) as { detail?: string };
      throw new Error(json.detail ?? "Request failed");
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
    return parseResponse<{ projects: ProjectRecord[] }>(response);
  }

  async getProject(token: string, projectId: string) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}`, { headers: headers(token) });
    return parseResponse<ProjectRecord>(response);
  }

  async updateProject(token: string, project: ProjectRecord) {
    const response = await fetch(`${this.baseUrl}/projects/${project.id}`, {
      method: "PATCH",
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

  async createLabel(token: string, projectId: string, label: LabelRecord) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/labels`, {
      method: "POST",
      headers: headers(token, "application/json"),
      body: JSON.stringify({
        name: label.name,
        color: label.color,
        description: label.description,
        shortcut: label.shortcut ?? null,
        meta: toJsonObject(label.meta),
      }),
    });
    return parseResponse<LabelRecord>(response);
  }

  async updateLabel(token: string, projectId: string, label: LabelRecord) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/labels/${label.id}`, {
      method: "PATCH",
      headers: headers(token, "application/json"),
      body: JSON.stringify({
        name: label.name,
        color: label.color,
        description: label.description,
        shortcut: label.shortcut ?? null,
        meta: toJsonObject(label.meta),
      }),
    });
    return parseResponse<LabelRecord>(response);
  }

  async deleteLabel(token: string, projectId: string, labelId: string) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/labels/${labelId}`, {
      method: "DELETE",
      headers: headers(token),
    });
    if (!response.ok) {
      await parseResponse(response);
    }
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

  async createDocument(token: string, projectId: string, document: DocumentRecord) {
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

  async updateDocument(token: string, projectId: string, document: DocumentRecord) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/documents/${document.id}`, {
      method: "PATCH",
      headers: headers(token, "application/json"),
      body: JSON.stringify({
        document_name: document.document_name,
        meta: toJsonObject(document.meta),
      }),
    });
    return parseResponse<Omit<DocumentRecord, "annotations">>(response);
  }

  async deleteDocument(token: string, projectId: string, documentId: string) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/documents/${documentId}`, {
      method: "DELETE",
      headers: headers(token),
    });
    if (!response.ok) {
      await parseResponse(response);
    }
  }

  async createAnnotation(token: string, projectId: string, documentId: string, annotation: AnnotationRecord) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/documents/${documentId}/annotations`, {
      method: "POST",
      headers: headers(token, "application/json"),
      body: JSON.stringify({
        label_id: annotation.label_id,
        start: annotation.start,
        end: annotation.end,
        span_text: annotation.span_text,
        comment: annotation.comment,
        status: annotation.status,
        meta: toJsonObject(annotation.meta),
      }),
    });
    return parseResponse<AnnotationRecord>(response);
  }

  async updateAnnotation(token: string, projectId: string, documentId: string, annotation: AnnotationRecord) {
    const response = await fetch(
      `${this.baseUrl}/projects/${projectId}/documents/${documentId}/annotations/${annotation.id}`,
      {
        method: "PATCH",
        headers: headers(token, "application/json"),
        body: JSON.stringify({
          comment: annotation.comment,
          status: annotation.status,
          meta: toJsonObject(annotation.meta),
        }),
      },
    );
    return parseResponse<AnnotationRecord>(response);
  }

  async deleteAnnotation(token: string, projectId: string, documentId: string, annotationId: string) {
    const response = await fetch(
      `${this.baseUrl}/projects/${projectId}/documents/${documentId}/annotations/${annotationId}`,
      {
        method: "DELETE",
        headers: headers(token),
      },
    );
    if (!response.ok) {
      await parseResponse(response);
    }
  }

  async listLabelExamples(token: string, projectId: string, labelId: string) {
    const response = await fetch(
      `${this.baseUrl}/projects/${projectId}/labels/${labelId}/examples?status=all&limit=100&context_window=16`,
      {
        headers: headers(token),
      },
    );
    return parseResponse<{ examples: LabelExampleRecord[] }>(response);
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
      match?: "exact" | "normalized";
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
      match: options.match ?? "normalized",
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

  async loadProjectBundle(token: string, projectId: string): Promise<ProjectBundle> {
    const project = await this.getProject(token, projectId);
    const [{ labels }, { documents }] = await Promise.all([
      this.listLabels(token, projectId),
      this.listDocuments(token, projectId),
    ]);
    const detailedDocuments = await Promise.all(
      documents.map((document) => this.getDocument(token, projectId, document.id)),
    );
    return {
      project,
      labels,
      documents: detailedDocuments,
    };
  }

  async saveProjectBundle(token: string, original: ProjectBundle, current: ProjectBundle): Promise<ProjectBundle> {
    const working = deepClone(current);
    if (!projectEquals(original.project, working.project)) {
      await this.updateProject(token, working.project);
    }

    const labelIdMap = new Map<string, string>();
    const originalLabelsById = new Map(original.labels.map((label) => [label.id, label]));
    for (const label of original.labels) {
      if (!working.labels.some((candidate) => candidate.id === label.id)) {
        await this.deleteLabel(token, original.project.id, label.id);
      }
    }
    for (const label of working.labels) {
      if (isLocalId(label.id)) {
        const created = await this.createLabel(token, working.project.id, label);
        labelIdMap.set(label.id, created.id);
        label.id = created.id;
        label.project_id = created.project_id;
        label.project_name = created.project_name;
      } else {
        const originalLabel = originalLabelsById.get(label.id);
        if (originalLabel && !labelEquals(originalLabel, label)) {
          await this.updateLabel(token, working.project.id, label);
        }
      }
    }

    for (const document of working.documents) {
      document.annotations.forEach((annotation) => {
        const mapped = labelIdMap.get(annotation.label_id);
        if (mapped) {
          annotation.label_id = mapped;
          const newLabel = working.labels.find((label) => label.id === mapped);
          if (newLabel) {
            annotation.label_name = newLabel.name;
          }
        }
      });
    }

    const originalDocumentsById = new Map(original.documents.map((document) => [document.id, document]));
    for (const document of original.documents) {
      if (!working.documents.some((candidate) => candidate.id === document.id)) {
        await this.deleteDocument(token, working.project.id, document.id);
      }
    }

    const documentIdMap = new Map<string, string>();
    for (const document of working.documents) {
      if (isLocalId(document.id)) {
        const created = await this.createDocument(token, working.project.id, document);
        documentIdMap.set(document.id, created.id);
        document.id = created.id;
        document.project_id = created.project_id;
        document.project_name = created.project_name ?? document.project_name;
        document.annotations.forEach((annotation) => {
          annotation.document_id = created.id;
          annotation.document_name = created.document_name;
        });
      } else {
        const originalDocument = originalDocumentsById.get(document.id);
        if (originalDocument && !documentEquals(originalDocument, document)) {
          await this.updateDocument(token, working.project.id, document);
        }
      }
    }

    for (const document of working.documents) {
      const originalDocument = originalDocumentsById.get(document.id);
      const originalAnnotationsById = new Map((originalDocument?.annotations ?? []).map((annotation) => [annotation.id, annotation]));
      if (originalDocument) {
        for (const annotation of originalDocument.annotations) {
          if (!document.annotations.some((candidate) => candidate.id === annotation.id)) {
            await this.deleteAnnotation(token, working.project.id, document.id, annotation.id);
          }
        }
      }
      for (const annotation of document.annotations) {
        const mappedDocumentId = documentIdMap.get(annotation.document_id);
        if (mappedDocumentId) {
          annotation.document_id = mappedDocumentId;
        }
        if (isLocalId(annotation.id)) {
          const created = await this.createAnnotation(token, working.project.id, document.id, annotation);
          annotation.id = created.id;
        } else {
          const originalAnnotation = originalAnnotationsById.get(annotation.id);
          if (originalAnnotation && !annotationEquals(originalAnnotation, annotation)) {
            await this.updateAnnotation(token, working.project.id, document.id, annotation);
          }
        }
      }
    }

    const project = await this.getProject(token, current.project.id);
    const { labels } = await this.listLabels(token, current.project.id);
    const persistedDocuments = await Promise.all(
      working.documents.map((document) => this.getDocument(token, current.project.id, document.id)),
    );
    return {
      project,
      labels,
      documents: persistedDocuments,
    };
  }
}

export const api = new ApiClient();

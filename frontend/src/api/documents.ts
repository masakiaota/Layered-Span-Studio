import type {
  CreateDocumentInput,
  DocumentSortValue,
  DocumentListResponse,
  DocumentRecord,
  SaveDocumentAnnotationInput,
} from "../api-contract";
import { toJsonObject } from "../utils";
import { client, unwrapData, unwrapVoid } from "./client";

type DocumentListOptions = {
  offset?: number;
  limit?: number;
  search?: string;
  sort?: DocumentSortValue;
};

export function listDocuments(projectId: string, options?: DocumentListOptions) {
  return unwrapData<DocumentListResponse>(client.GET("/projects/{project_id}/documents", {
    params: {
      path: { project_id: projectId },
        query: {
          offset: options?.offset ?? 0,
          limit: options?.limit ?? 100,
          search: options?.search ?? "",
          sort: options?.sort ?? "created",
        },
      },
  }));
}

export function getDocument(projectId: string, documentId: string) {
  return unwrapData<DocumentRecord>(client.GET("/projects/{project_id}/documents/{document_id}", {
    params: {
      path: { project_id: projectId, document_id: documentId },
    },
  }));
}

export function saveDocumentBundle(
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

export function createDocument(
  projectId: string,
  document: Pick<CreateDocumentInput, "document_name" | "text" | "meta">,
) {
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

export async function deleteDocument(projectId: string, documentId: string) {
  await unwrapVoid(client.DELETE("/projects/{project_id}/documents/{document_id}", {
    params: {
      path: { project_id: projectId, document_id: documentId },
    },
  }));
}

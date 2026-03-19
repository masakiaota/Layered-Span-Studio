import { searchAnnotations } from "./annotations";
import { createSession, deleteSession, getSession } from "./auth";
import { apiBaseUrl, ApiError } from "./client";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  saveDocumentBundle,
} from "./documents";
import { exportProject, importProject, importProjectAsNew } from "./importExport";
import { listLabelSurfaceGroups, listLabels, saveProjectLabels } from "./labels";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  saveProjectSettings,
} from "./projects";

export { ApiError } from "./client";

export const api = {
  baseUrl: apiBaseUrl,
  createSession,
  getSession,
  deleteSession,
  listProjects,
  createProject,
  getProject,
  deleteProject,
  saveProjectSettings,
  listLabels,
  saveProjectLabels,
  listDocuments,
  getDocument,
  saveDocumentBundle,
  createDocument,
  deleteDocument,
  listLabelSurfaceGroups,
  searchAnnotations,
  importProjectAsNew,
  importProject,
  exportProject,
};

export type ApiClient = typeof api;

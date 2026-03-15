import type { ComponentProps } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceView } from "../features/project-shell/WorkspaceView";
import type {
  AnnotationSearchItemRecord,
  DocumentRecord,
  DocumentListItem,
  LabelRecord,
  LabelSurfaceGroupRecord,
  ProjectRecord,
  SelectionPreview,
} from "../types";

type WorkspaceViewProps = ComponentProps<typeof WorkspaceView>;

const project: ProjectRecord = {
  id: "project-1",
  name: "Medical NER",
  description: "desc",
  meta: {},
};

const label: LabelRecord = {
  id: "label-1",
  project_id: "project-1",
  project_name: "Medical NER",
  name: "主訴",
  color: "#e74c3c",
  description: "desc",
  shortcut: "1",
  meta: {},
};

const initialDocuments: DocumentListItem[] = [
  {
    id: "doc-1",
    project_id: "project-1",
    project_name: "Medical NER",
    document_name: "Doc 1",
    text: "A short document",
    status: "verified",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    meta: {},
  },
  {
    id: "doc-2",
    project_id: "project-1",
    project_name: "Medical NER",
    document_name: "Doc 2",
    text: "Another document",
    status: "verified",
    created_at: "2026-03-02T00:00:00Z",
    updated_at: "2026-03-02T00:00:00Z",
    meta: {},
  },
  {
    id: "doc-3",
    project_id: "project-1",
    project_name: "Medical NER",
    document_name: "Doc 3",
    text: "More text",
    status: "verified",
    created_at: "2026-03-03T00:00:00Z",
    updated_at: "2026-03-03T00:00:00Z",
    meta: {},
  },
];

const annotationCurrentDocument: DocumentRecord = {
  id: "doc-1",
  project_id: "project-1",
  project_name: "Medical NER",
  document_name: "Doc 1",
  text: "Alpha beta gamma delta",
  status: "verified",
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  annotations: [
    {
      id: "ann-1",
      document_id: "doc-1",
      document_name: "Doc 1",
      label_id: "label-1",
      label_name: "主訴",
      start: 0,
      end: 5,
      span_text: "Alpha",
      comment: "",
      status: "verified",
      meta: {},
    },
    {
      id: "ann-2",
      document_id: "doc-1",
      document_name: "Doc 1",
      label_id: "label-1",
      label_name: "主訴",
      start: 6,
      end: 10,
      span_text: "beta",
      comment: "note",
      status: "pending",
      meta: {},
    },
  ],
  meta: {},
};

const noDetails: Record<string, AnnotationSearchItemRecord[]> = {};
const sameLabelExamples: LabelSurfaceGroupRecord[] = [];

function createProps(overrides: Partial<WorkspaceViewProps> = {}): WorkspaceViewProps {
  const visibleDocuments = overrides.visibleDocuments ?? initialDocuments;
  const selectedAnnotation = overrides.selectedAnnotation ?? null;

  return {
    bundle: { project, labels: [label], documents: [] },
    currentDocument: null,
    selectedDocumentId: "doc-1",
    currentDocumentLoading: false,
    currentHiddenBySearch: false,
    visibleDocuments,
    pinnedCurrentDocument: null,
    pendingDocumentTotal: 0,
    documentTotal: visibleDocuments.length,
    searchQuery: "",
    sortMode: "created",
    documentsLoadingMore: false,
    documentNextOffset: 0,
    documentListScrollRef: { current: null },
    focusedLabel: label,
    selectedAnnotationId: null,
    selectedAnnotation,
    selectedAnnotationMetaDraft: "",
    selectedAnnotationMetaError: null,
    selectionPreview: null as SelectionPreview | null,
    rightTab: "examples",
    annotationEditCollapsed: false,
    accordionOpen: {},
    sameLabelExamples,
    sameLabelExamplesTotal: 0,
    sameLabelExamplesOffset: 0,
    sameLabelExamplesLoadingMore: false,
    sameLabelExampleDetails: noDetails,
    sameLabelExamplesScrollRef: { current: null },
    sameSurfaceExamples: [],
    sameSurfaceExamplesTotal: 0,
    sameSurfaceExamplesOffset: 0,
    sameSurfaceExamplesLoadingMore: false,
    sameSurfaceExamplesScrollRef: { current: null },
    sameSurfaceTargetLabelId: null,
    getDisplayDocumentStatus: (document: Pick<DocumentListItem, "id" | "status">) => document.status,
    dirty: false,
    saving: false,
    onOpenCreateDocument: vi.fn(),
    onSearchQueryChange: vi.fn(),
    onSortModeChange: vi.fn(),
    onLoadMoreDocuments: vi.fn(),
    onSelectDocument: vi.fn(),
    onRequestDeleteDocument: vi.fn(),
    onFocusLabel: vi.fn(),
    onSelectAnnotation: vi.fn(),
    onCreateAnnotation: vi.fn(),
    onClearSelection: vi.fn(),
    onSelectionDraftChange: vi.fn(),
    onSave: vi.fn(),
    onSubmit: vi.fn(),
    onRightTabChange: vi.fn(),
    onLoadMoreSameLabelExamples: vi.fn(),
    onEnsureSameLabelDetails: vi.fn(),
    onLoadMoreSameSurfaceExamples: vi.fn(),
    onToggleAnnotationEditCollapsed: vi.fn(),
    onUpdateSelectedAnnotationStatus: vi.fn(),
    onUpdateSelectedAnnotationComment: vi.fn(),
    onUpdateSelectedAnnotationMeta: vi.fn(),
    onDeleteSelectedAnnotation: vi.fn(),
    onToggleAnnotationGroup: vi.fn(),
    ...overrides,
  };
}

describe("WorkspaceView", () => {
  it("scrolls the selected document row into view when selected id or visible rows change", () => {
    const scrollIntoView = vi.fn();
    const original = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const { rerender } = render(
        <WorkspaceView {...createProps({ selectedDocumentId: "doc-1", visibleDocuments: initialDocuments })} />,
      );

      scrollIntoView.mockClear();
      rerender(<WorkspaceView {...createProps({ selectedDocumentId: "doc-2", visibleDocuments: initialDocuments })} />);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      rerender(<WorkspaceView {...createProps({ selectedDocumentId: "doc-2", visibleDocuments: [...initialDocuments].reverse() })} />);
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", inline: "nearest" });
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("scrolls the selected annotation row when selection or list changes", () => {
    const scrollIntoView = vi.fn();
    const original = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const annotationListProps: Partial<WorkspaceViewProps> = {
        selectedDocumentId: "doc-1",
        currentDocument: annotationCurrentDocument,
        visibleDocuments: [initialDocuments[0]],
        rightTab: "annotations",
      };

      const reorderedDocument = {
        ...annotationCurrentDocument,
        annotations: [...annotationCurrentDocument.annotations].reverse(),
      };

      const { rerender } = render(
        <WorkspaceView
          {...createProps({
            ...annotationListProps,
            documentTotal: 1,
            selectedAnnotationId: "ann-1",
            selectedAnnotation: annotationCurrentDocument.annotations[0],
          })}
        />,
      );

      scrollIntoView.mockClear();

      rerender(
        <WorkspaceView
          {...createProps({
            ...annotationListProps,
            documentTotal: 1,
            selectedAnnotationId: "ann-2",
            selectedAnnotation: annotationCurrentDocument.annotations[1],
          })}
        />,
      );
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      rerender(
        <WorkspaceView
          {...createProps({
            ...annotationListProps,
            documentTotal: 1,
            selectedAnnotationId: "ann-2",
            currentDocument: reorderedDocument,
            selectedAnnotation: reorderedDocument.annotations[0],
          })}
        />,
      );
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", inline: "nearest" });
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original;
    }
  });
});

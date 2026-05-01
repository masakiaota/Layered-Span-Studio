import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceView } from "../features/project-shell/WorkspaceView";
import type { SelectionPreview } from "../features/project-shell/projectShellTypes";
import type {
  DocumentListItem,
} from "../types";
import type {
  AnnotationSearchItemRecord,
  DocumentRecord,
  LabelRecord,
  LabelSurfaceGroupRecord,
  ProjectRecord,
} from "../api-contract";

type WorkspaceViewProps = ComponentProps<typeof WorkspaceView>;

const project: ProjectRecord = {
  id: "project-1",
  name: "Medical NER",
  description: "desc",
  meta: {},
  created_at: "2026-03-01T00:00:00Z",
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

const secondaryLabel: LabelRecord = {
  id: "label-2",
  project_id: "project-1",
  project_name: "Medical NER",
  name: "所見",
  color: "#2f80ed",
  description: "desc",
  shortcut: "2",
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

const hiddenDocument: DocumentListItem = {
  id: "doc-4",
  project_id: "project-1",
  project_name: "Medical NER",
  document_name: "Doc 4",
  text: "Hidden document",
  status: "verified",
  created_at: "2026-03-04T00:00:00Z",
  updated_at: "2026-03-04T00:00:00Z",
  meta: {},
};

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
    getDisplayDocumentStatus: (document: DocumentListItem) => document.status,
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
  it("scrolls the selected document row when selection changes or the row becomes visible", () => {
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

      rerender(<WorkspaceView {...createProps({ selectedDocumentId: "doc-4", visibleDocuments: initialDocuments })} />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      rerender(
        <WorkspaceView
          {...createProps({
            selectedDocumentId: "doc-4",
            visibleDocuments: [...initialDocuments, hiddenDocument],
          })}
        />,
      );
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", inline: "nearest" });
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("scrolls the focused label chip when focus changes", () => {
    const scrollIntoView = vi.fn();
    const original = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const labels = [label, secondaryLabel];
      const { rerender } = render(
        <WorkspaceView
          {...createProps({
            bundle: { project, labels, documents: [] },
            focusedLabel: label,
          })}
        />,
      );

      scrollIntoView.mockClear();
      rerender(
        <WorkspaceView
          {...createProps({
            bundle: { project, labels, documents: [] },
            focusedLabel: secondaryLabel,
          })}
        />,
      );

      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("wraps the label selector up to three rows and scrolls vertically", () => {
    render(<WorkspaceView {...createProps()} />);

    expect(screen.getByTestId("label-selector")).toHaveStyle({
      display: "flex",
      flexWrap: "wrap",
      maxHeight: "126px",
      overflowX: "hidden",
      overflowY: "auto",
      alignContent: "flex-start",
    });
  });

  it("scrolls the selected annotation row when selection changes or the tab becomes visible", () => {
    const scrollIntoView = vi.fn();
    const original = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const annotationListProps: Partial<WorkspaceViewProps> = {
        selectedDocumentId: "doc-1",
        currentDocument: annotationCurrentDocument,
        visibleDocuments: [initialDocuments[0]],
      };

      const { rerender } = render(
        <WorkspaceView
          {...createProps({
            ...annotationListProps,
            documentTotal: 1,
            selectedAnnotationId: "ann-1",
            selectedAnnotation: annotationCurrentDocument.annotations[0],
            rightTab: "examples",
          })}
        />,
      );

      scrollIntoView.mockClear();
      expect(scrollIntoView).not.toHaveBeenCalled();

      rerender(
        <WorkspaceView
          {...createProps({
            ...annotationListProps,
            documentTotal: 1,
            selectedAnnotationId: "ann-1",
            selectedAnnotation: annotationCurrentDocument.annotations[0],
            rightTab: "annotations",
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
            selectedAnnotation: annotationCurrentDocument.annotations[1],
            rightTab: "annotations",
          })}
        />,
      );
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", inline: "nearest" });
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("hides label groups without annotations in the document annotation list", () => {
    render(
      <WorkspaceView
        {...createProps({
          bundle: { project, labels: [label, secondaryLabel], documents: [] },
          currentDocument: annotationCurrentDocument,
          rightTab: "annotations",
        })}
      />,
    );

    const annotationList = within(screen.getByTestId("document-annotation-list"));

    expect(annotationList.getByText("主訴")).toBeInTheDocument();
    expect(annotationList.queryByText("所見")).not.toBeInTheDocument();
    expect(annotationList.queryByText("Annotation なし")).not.toBeInTheDocument();
  });

  it("shows an empty state when the current document has no annotations", () => {
    render(
      <WorkspaceView
        {...createProps({
          bundle: { project, labels: [label, secondaryLabel], documents: [] },
          currentDocument: { ...annotationCurrentDocument, annotations: [] },
          rightTab: "annotations",
        })}
      />,
    );

    const annotationList = within(screen.getByTestId("document-annotation-list"));

    expect(annotationList.getByText("Annotation なし")).toBeInTheDocument();
    expect(annotationList.queryByText("主訴")).not.toBeInTheDocument();
    expect(annotationList.queryByText("所見")).not.toBeInTheDocument();
  });

  it("splits the remaining examples area equally between the same-label and same-surface panels", () => {
    render(<WorkspaceView {...createProps()} />);

    expect(screen.getByTestId("examples-panels-grid")).toHaveStyle({
      display: "grid",
      gridTemplateRows: "minmax(0,1fr) minmax(0,1fr)",
      minHeight: "0",
      flex: "1 1 0%",
    });
    expect(screen.getByTestId("same-label-examples-panel")).toHaveStyle({
      minHeight: "0",
      overflow: "hidden",
    });
    expect(screen.getByTestId("same-surface-examples-panel")).toHaveStyle({
      minHeight: "0",
      overflow: "hidden",
    });
  });
});

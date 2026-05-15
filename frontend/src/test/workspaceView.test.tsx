import type { ComponentProps } from "react";
import { createTheme } from "@mui/material/styles";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { setupUserEvent } from "./userEvent";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceView } from "../features/project-shell/WorkspaceView";
import { getAnnotationGuideMaxHeight } from "../features/project-shell/projectShellConstants";
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

const annotationGuideMaxHeight = getAnnotationGuideMaxHeight(createTheme());

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    currentDocumentOutsideWindow: false,
    pendingDocumentTotal: 0,
    documentTotal: visibleDocuments.length,
    searchQuery: "",
    sortMode: "created",
    documentsLoadingMore: false,
    documentWindowStartOffset: 0,
    documentNextOffset: 0,
    documentListScrollRef: { current: null },
    focusedLabel: label,
    selectedAnnotationId: null,
    selectedAnnotation,
    selectedAnnotationMetaDraft: "",
    selectedAnnotationMetaError: null,
    selectionPreview: null as SelectionPreview | null,
    rightTab: "examples",
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
    onReturnToSelectedDocument: vi.fn(),
    onLoadPreviousDocuments: vi.fn(),
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
    onSelectNextPendingAnnotation: vi.fn(),
    onVerifySelectedAnnotation: vi.fn(),
    onUpdateSelectedAnnotationLabel: vi.fn(),
    onUpdateSelectedAnnotationStatus: vi.fn(),
    onUpdateSelectedAnnotationComment: vi.fn(),
    onUpdateSelectedAnnotationMeta: vi.fn(),
    onDeleteSelectedAnnotation: vi.fn(),
    onToggleAnnotationGroup: vi.fn(),
    ...overrides,
  };
}

describe("WorkspaceView", () => {
  it("loads the previous document page when scrolling back to the top of a trimmed window", () => {
    const onLoadPreviousDocuments = vi.fn();
    const onLoadMoreDocuments = vi.fn();
    render(
      <WorkspaceView
        {...createProps({
          documentWindowStartOffset: 40,
          documentNextOffset: 80,
          documentTotal: 120,
          onLoadPreviousDocuments,
          onLoadMoreDocuments,
        })}
      />,
    );

    const scroller = screen.getByTestId("document-list-scroll");
    Object.defineProperty(scroller, "scrollTop", { value: 0, configurable: true, writable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true });

    fireEvent.scroll(scroller);

    expect(onLoadPreviousDocuments).toHaveBeenCalledTimes(1);
    expect(onLoadMoreDocuments).not.toHaveBeenCalled();
  });

  it("does not request the previous document page twice while the first request is in flight", () => {
    const loadDeferred = createDeferred<void>();
    const onLoadPreviousDocuments = vi.fn(() => loadDeferred.promise);
    render(
      <WorkspaceView
        {...createProps({
          documentWindowStartOffset: 40,
          documentNextOffset: 80,
          documentTotal: 120,
          onLoadPreviousDocuments,
        })}
      />,
    );

    const scroller = screen.getByTestId("document-list-scroll");
    Object.defineProperty(scroller, "scrollTop", { value: 0, configurable: true, writable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true });

    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);

    expect(onLoadPreviousDocuments).toHaveBeenCalledTimes(1);
  });

  it("shows a compact return banner instead of pinning the selected document outside the scroll window", async () => {
    const userEventSetup = setupUserEvent();
    const onReturnToSelectedDocument = vi.fn();

    render(
      <WorkspaceView
        {...createProps({
          selectedDocumentId: "doc-4",
          visibleDocuments: initialDocuments,
          currentDocumentOutsideWindow: true,
          onReturnToSelectedDocument,
        })}
      />,
    );

    expect(screen.queryByText("Doc 4")).not.toBeInTheDocument();

    await userEventSetup.click(screen.getByRole("button", { name: "選択中Documentへ戻る" }));

    expect(onReturnToSelectedDocument).toHaveBeenCalledTimes(1);
  });

  it("shows a return banner when the selected document row is mounted but outside the scroll viewport", async () => {
    const userEventSetup = setupUserEvent();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      "getBoundingClientRect",
    );

    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", {
      value: function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.documentId === "doc-1") {
          return { top: -120, bottom: -40, left: 0, right: 320, width: 320, height: 80, x: 0, y: -120, toJSON: () => null };
        }
        return { top: 0, bottom: 400, left: 0, right: 320, width: 320, height: 400, x: 0, y: 0, toJSON: () => null };
      },
      configurable: true,
    });

    try {
      render(<WorkspaceView {...createProps({ selectedDocumentId: "doc-1", visibleDocuments: initialDocuments })} />);
      const scroller = screen.getByTestId("document-list-scroll");

      fireEvent.scroll(scroller);

      await userEventSetup.click(screen.getByRole("button", { name: "選択中Documentへ戻る" }));

      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    } finally {
      window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      if (originalGetBoundingClientRect) {
        Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", originalGetBoundingClientRect);
      }
    }
  });

  it("does not flash the return banner while scrolling a newly selected visible document into view", () => {
    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      "getBoundingClientRect",
    );
    let doc2Top = 480;

    window.HTMLElement.prototype.scrollIntoView = function scrollIntoView(this: HTMLElement) {
      if (this.dataset.documentId === "doc-2") {
        doc2Top = 120;
      }
    };
    Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", {
      value: function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.documentId === "doc-2") {
          return { top: doc2Top, bottom: doc2Top + 80, left: 0, right: 320, width: 320, height: 80, x: 0, y: doc2Top, toJSON: () => null };
        }
        return { top: 0, bottom: 400, left: 0, right: 320, width: 320, height: 400, x: 0, y: 0, toJSON: () => null };
      },
      configurable: true,
    });

    try {
      const { rerender } = render(
        <WorkspaceView {...createProps({ selectedDocumentId: "doc-1", visibleDocuments: initialDocuments })} />,
      );

      rerender(<WorkspaceView {...createProps({ selectedDocumentId: "doc-2", visibleDocuments: initialDocuments })} />);

      expect(screen.queryByRole("button", { name: "選択中Documentへ戻る" })).not.toBeInTheDocument();
    } finally {
      window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      if (originalGetBoundingClientRect) {
        Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", originalGetBoundingClientRect);
      }
    }
  });

  it("keeps the first visible document anchored after previous rows are prepended", async () => {
    const previousDocuments: DocumentListItem[] = [
      { ...initialDocuments[0], id: "doc-0", document_name: "Doc 0" },
      { ...initialDocuments[1], id: "doc-00", document_name: "Doc 00" },
    ];
    const currentDocuments: DocumentListItem[] = [
      { ...initialDocuments[0], id: "doc-40", document_name: "Doc 40" },
      { ...initialDocuments[1], id: "doc-41", document_name: "Doc 41" },
    ];
    const loadDeferred = createDeferred<void>();
    const onLoadPreviousDocuments = vi.fn(() => loadDeferred.promise);
    const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      "getBoundingClientRect",
    );
    const rowTopById = new Map([
      ["doc-40", 0],
      ["doc-41", 80],
    ]);

    Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", {
      value: function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.documentRow === "true" && this.dataset.documentId) {
          const top = rowTopById.get(this.dataset.documentId) ?? 0;
          return { top, bottom: top + 80, left: 0, right: 320, width: 320, height: 80, x: 0, y: top, toJSON: () => null };
        }
        return { top: 0, bottom: 400, left: 0, right: 320, width: 320, height: 400, x: 0, y: 0, toJSON: () => null };
      },
      configurable: true,
    });

    try {
      const { rerender } = render(
        <WorkspaceView
          {...createProps({
            documentWindowStartOffset: 40,
            visibleDocuments: currentDocuments,
            selectedDocumentId: "doc-40",
            onLoadPreviousDocuments,
          })}
        />,
      );
      const scroller = screen.getByTestId("document-list-scroll");
      Object.defineProperty(scroller, "scrollTop", { value: 0, configurable: true, writable: true });
      Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
      Object.defineProperty(scroller, "scrollHeight", { value: 400, configurable: true });

      fireEvent.scroll(scroller);

      rowTopById.set("doc-0", 0);
      rowTopById.set("doc-00", 80);
      rowTopById.set("doc-40", 160);
      rowTopById.set("doc-41", 240);
      rerender(
        <WorkspaceView
          {...createProps({
            documentWindowStartOffset: 0,
            visibleDocuments: [...previousDocuments, ...currentDocuments],
            selectedDocumentId: "doc-40",
            onLoadPreviousDocuments,
          })}
        />,
      );

      await act(async () => {
        loadDeferred.resolve();
        await loadDeferred.promise;
      });

      expect(scroller.scrollTop).toBe(160);
    } finally {
      if (originalGetBoundingClientRect) {
        Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", originalGetBoundingClientRect);
      }
    }
  });

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

  it("scrolls the document canvas when the selected annotation is not visible with the next line", () => {
    const originalGetClientRects = Range.prototype.getClientRects;
    const originalGetComputedStyle = window.getComputedStyle;
    const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      "getBoundingClientRect",
    );
    const originalClientHeight = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "clientHeight");
    const originalScrollHeight = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "scrollHeight");
    const originalScrollTop = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "scrollTop");
    const scrollTopByElement = new WeakMap<HTMLElement, number>();

    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: function getClientRects(this: Range) {
        if (this.toString() === "beta") {
          return [{ left: 0, right: 40, top: 250, bottom: 280, width: 40, height: 30 }] as unknown as DOMRectList;
        }
        return [{ left: 0, right: 40, top: 20, bottom: 50, width: 40, height: 30 }] as unknown as DOMRectList;
      },
    });
    window.getComputedStyle = ((element: Element) => {
      const style = originalGetComputedStyle(element);
      if ((element as HTMLElement).dataset.testid === "doc-text") {
        return { ...style, lineHeight: "36px" };
      }
      return style;
    }) as typeof window.getComputedStyle;
    Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", {
      value: function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.testid === "document-canvas-scroll") {
          return { top: 0, bottom: 220, left: 0, right: 480, width: 480, height: 220, x: 0, y: 0, toJSON: () => null };
        }
        return { top: 0, bottom: 400, left: 0, right: 480, width: 480, height: 400, x: 0, y: 0, toJSON: () => null };
      },
      configurable: true,
    });
    Object.defineProperty(window.HTMLElement.prototype, "clientHeight", {
      get(this: HTMLElement) {
        return this.dataset.testid === "document-canvas-scroll" ? 220 : 400;
      },
      configurable: true,
    });
    Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", {
      get(this: HTMLElement) {
        return this.dataset.testid === "document-canvas-scroll" ? 1000 : 400;
      },
      configurable: true,
    });
    Object.defineProperty(window.HTMLElement.prototype, "scrollTop", {
      get(this: HTMLElement) {
        return scrollTopByElement.get(this) ?? (this.dataset.testid === "document-canvas-scroll" ? 100 : 0);
      },
      set(this: HTMLElement, value: number) {
        scrollTopByElement.set(this, value);
      },
      configurable: true,
    });

    try {
      render(
        <WorkspaceView
          {...createProps({
            currentDocument: annotationCurrentDocument,
            selectedAnnotationId: "ann-2",
            selectedAnnotation: annotationCurrentDocument.annotations[1],
          })}
        />,
      );

      expect(screen.getByTestId("document-canvas-scroll").scrollTop).toBe(279.6);
    } finally {
      Object.defineProperty(Range.prototype, "getClientRects", {
        configurable: true,
        value: originalGetClientRects,
      });
      window.getComputedStyle = originalGetComputedStyle;
      if (originalGetBoundingClientRect) {
        Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", originalGetBoundingClientRect);
      }
      if (originalClientHeight) {
        Object.defineProperty(window.HTMLElement.prototype, "clientHeight", originalClientHeight);
      }
      if (originalScrollHeight) {
        Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      }
      if (originalScrollTop) {
        Object.defineProperty(window.HTMLElement.prototype, "scrollTop", originalScrollTop);
      }
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

  it("shows selected annotation controls in the center dock and removes the right-pane editor", async () => {
    const user = setupUserEvent();
    const onSelectNextPendingAnnotation = vi.fn();
    const onVerifySelectedAnnotation = vi.fn();
    render(
      <WorkspaceView
        {...createProps({
          currentDocument: annotationCurrentDocument,
          selectedAnnotationId: "ann-2",
          selectedAnnotation: annotationCurrentDocument.annotations[1],
          rightTab: "annotations",
          onSelectNextPendingAnnotation,
          onVerifySelectedAnnotation,
        })}
      />,
    );

    const dock = within(screen.getByTestId("selected-annotation-dock"));
    expect(dock.getByText("選択中")).toBeInTheDocument();
    expect(dock.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("1 pending")).toBeInTheDocument();
    expect(screen.getByTestId("document-annotation-list")).toBeInTheDocument();

    await user.click(dock.getByRole("button", { name: "Next pending" }));
    await user.click(dock.getByRole("button", { name: "Mark verified" }));

    expect(onSelectNextPendingAnnotation).toHaveBeenCalledTimes(1);
    expect(onVerifySelectedAnnotation).toHaveBeenCalledTimes(1);
  });

  it("keeps selected annotation details open when selection changes", async () => {
    const user = setupUserEvent();
    const { rerender } = render(
      <WorkspaceView
        {...createProps({
          currentDocument: annotationCurrentDocument,
          selectedAnnotationId: "ann-1",
          selectedAnnotation: annotationCurrentDocument.annotations[0],
          rightTab: "annotations",
        })}
      />,
    );

    await user.click(within(screen.getByTestId("selected-annotation-dock")).getByRole("button", { name: "Annotation details" }));
    expect(screen.getByLabelText("Comment")).toBeInTheDocument();

    rerender(
      <WorkspaceView
        {...createProps({
          currentDocument: annotationCurrentDocument,
          selectedAnnotationId: "ann-2",
          selectedAnnotation: annotationCurrentDocument.annotations[1],
          rightTab: "annotations",
        })}
      />,
    );

    expect(screen.getByLabelText("Comment")).toBeInTheDocument();
    expect(screen.getByDisplayValue("note")).toBeInTheDocument();
  });

  it("exposes selected annotation details as an accessible disclosure", async () => {
    const user = setupUserEvent();
    render(
      <WorkspaceView
        {...createProps({
          currentDocument: annotationCurrentDocument,
          selectedAnnotationId: "ann-1",
          selectedAnnotation: annotationCurrentDocument.annotations[0],
        })}
      />,
    );

    const detailsButton = within(screen.getByTestId("selected-annotation-dock")).getByRole("button", {
      name: "Annotation details",
    });
    expect(detailsButton).toHaveAttribute("aria-expanded", "false");

    await user.click(detailsButton);

    expect(detailsButton).toHaveAttribute("aria-expanded", "true");
    expect(detailsButton.getAttribute("aria-controls")).toContain("selected-annotation-details-ann-1");
  });

  it("clears the range selection preview when selecting an annotation from the list", async () => {
    const user = setupUserEvent();
    const onSelectionDraftChange = vi.fn();
    const onSelectAnnotation = vi.fn();
    render(
      <WorkspaceView
        {...createProps({
          currentDocument: annotationCurrentDocument,
          rightTab: "annotations",
          selectionPreview: { start: 0, end: 5, text: "alpha" },
          onSelectionDraftChange,
          onSelectAnnotation,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /0-5/ }));

    expect(onSelectionDraftChange).toHaveBeenCalledWith(null);
    expect(onSelectAnnotation).toHaveBeenCalledWith("ann-1");
  });

  it("lets keyboard users operate annotation groups and rows", async () => {
    const user = setupUserEvent();
    const onToggleAnnotationGroup = vi.fn();
    const onSelectAnnotation = vi.fn();
    render(
      <WorkspaceView
        {...createProps({
          currentDocument: annotationCurrentDocument,
          rightTab: "annotations",
          onToggleAnnotationGroup,
          onSelectAnnotation,
        })}
      />,
    );

    const annotationList = within(screen.getByTestId("document-annotation-list"));
    const groupButton = annotationList.getByRole("button", { name: /主訴/ });
    expect(groupButton).toHaveAttribute("aria-expanded", "true");
    groupButton.focus();
    await user.keyboard("{Enter}");
    expect(onToggleAnnotationGroup).toHaveBeenCalledWith("label-1");

    const rowButton = annotationList.getByRole("button", { name: /0-5/ });
    expect(rowButton).toHaveAttribute("aria-pressed", "false");
    rowButton.focus();
    await user.keyboard(" ");
    expect(onSelectAnnotation).toHaveBeenCalledWith("ann-1");
  });

  it("marks the selected annotation row for assistive technology", () => {
    render(
      <WorkspaceView
        {...createProps({
          currentDocument: annotationCurrentDocument,
          selectedAnnotationId: "ann-1",
          rightTab: "annotations",
        })}
      />,
    );

    const annotationList = within(screen.getByTestId("document-annotation-list"));

    expect(annotationList.getByRole("button", { name: /0-5/ })).toHaveAttribute("aria-pressed", "true");
    expect(annotationList.getByRole("button", { name: /6-10/ })).toHaveAttribute("aria-pressed", "false");
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

  it("caps long annotation guide content while keeping both examples panels visible", () => {
    const longDescription = Array.from({ length: 20 }, (_value, index) => `基準 ${index + 1}`).join("\n");

    render(
      <WorkspaceView
        {...createProps({
          focusedLabel: { ...label, description: longDescription },
        })}
      />,
    );

    expect(screen.getByTestId("examples-panels-grid")).toHaveStyle({
      display: "grid",
      gridTemplateRows: "minmax(0,1fr) minmax(0,1fr)",
      minHeight: "0",
      flex: "1 1 0%",
    });
    expect(screen.getByTestId("annotation-guide-panel")).toHaveStyle({
      maxHeight: annotationGuideMaxHeight,
      minHeight: "0",
      overflow: "hidden",
    });
    expect(screen.getByTestId("annotation-guide-content")).toHaveStyle({
      minHeight: "0",
      overflow: "auto",
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

  it("allows short annotation guide content to use natural height", () => {
    render(<WorkspaceView {...createProps()} />);

    expect(screen.getByTestId("examples-panels-grid")).toHaveStyle({
      display: "grid",
      gridTemplateRows: "minmax(0,1fr) minmax(0,1fr)",
      minHeight: "0",
      flex: "1 1 0%",
    });
    expect(screen.getByTestId("annotation-guide-panel")).toHaveStyle({
      maxHeight: annotationGuideMaxHeight,
      minHeight: "0",
      overflow: "hidden",
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

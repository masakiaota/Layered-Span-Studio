import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "index.html");

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.listeners = new Map();
    this.files = null;
    this.innerHTML = "";
    this.scrollTop = 0;
    this.value = "";
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  async dispatch(type) {
    const handler = this.listeners.get(type);
    if (!handler) return;
    await handler({ preventDefault() {}, target: this });
  }

  focus() {}
}

function createDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] ?? null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    body: {
      appendChild() {},
    },
    createElement() {
      return new FakeElement();
    },
    activeElement: null,
  };
}

function loadMockApp(document) {
  const windowListeners = {};
  const html = readFileSync(htmlPath, "utf8");
  const match = html.match(/<script>\n([\s\S]*?)\n\s*<\/script>\s*<\/body>/);
  assert.ok(match, "mock script not found");

  const source = match[1]
    .replace(/\n\s*window\.addEventListener\("hashchange", render\);\n\s*if \(!location\.hash\) location\.hash = "#\/projects";\n\s*render\(\);\s*$/, "\n");

  const context = vm.createContext({
    JSON,
    Math,
    Date,
    structuredClone,
    Blob,
    URL: {
      createObjectURL() {
        return "blob:mock";
      },
      revokeObjectURL() {},
    },
    location: { hash: "" },
    window: {
      innerWidth: 1440,
      innerHeight: 900,
      addEventListener(type, handler) {
        if (!windowListeners[type]) windowListeners[type] = [];
        windowListeners[type].push(handler);
      },
      setTimeout() {
        return 0;
      },
      getSelection() {
        return { isCollapsed: true };
      },
    },
    document,
    HTMLElement: class HTMLElement {},
    alert() {},
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
  });

  vm.runInContext(
    `${source}
showFlash = () => {};
render = () => {};
globalThis.__mock_exports = {
  applyDocSwitch,
  bindCommonEvents,
  bindKeyboardShortcuts,
  bindWorkspaceControls,
  createProjectFromImportPayload,
  doesDocumentMatchSearch,
  ensureWorkspaceState,
  getAnnotationsInPanelOrder,
  getDocumentSearchSnippet,
  getSameLabelSurfaceExamples,
  getSameSurfaceAnnotationExamples,
  getVisibleDocuments,
  highlightSearchTerms,
  moveAnnotationByDirection,
  normalizeSearchText,
  refreshDocumentPanel,
  renderWorkspace,
  restoreCurrentProject,
  moveRightPanelTabByDirection,
  setRenderImpl(fn) {
    render = fn;
  },
  state,
  savedSnapshots,
};
`,
    context,
    { filename: htmlPath }
  );

  return {
    ...context.__mock_exports,
    location: context.location,
    async dispatchWindowEvent(type, eventInit = {}) {
      const listeners = windowListeners[type] || [];
      const event = {
        key: "",
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...eventInit,
      };
      for (const listener of listeners) {
        await listener(event);
      }
      return event;
    },
  };
}

function validImportPayload() {
  return {
    project: {
      id: "project-seed",
      name: "Imported Project",
      description: "desc",
      meta: {},
    },
    labels: [],
    documents: [],
    meta: {
      format: "layered-span-studio/export",
      version: "1.0",
    },
  };
}

test("project list import keeps a discard snapshot for the created project", async () => {
  const importButton = new FakeElement();
  const fileInput = new FakeElement();
  fileInput.files = [
    {
      async text() {
        return JSON.stringify(validImportPayload());
      },
    },
  ];

  const mockApp = loadMockApp(
    createDocument({
      "run-project-import-btn": importButton,
      "project-import-json-file": fileInput,
    })
  );

  mockApp.bindCommonEvents();
  await importButton.dispatch("click");

  const importedProject = mockApp.state.projects.at(-1);
  const originalName = importedProject.name;
  mockApp.state.currentProjectId = importedProject.id;
  importedProject.name = "Edited after import";

  mockApp.restoreCurrentProject();

  assert.equal(mockApp.state.projects.at(-1).name, originalName);
});

test("doc annotation list order is grouped by label and sorted by span index", () => {
  const mockApp = loadMockApp(createDocument({}));
  const project = {
    labels: [
      { id: "label-a", name: "A" },
      { id: "label-b", name: "B" },
    ],
  };
  const doc = {
    annotations: [
      { id: "ann-4", labelId: "label-b", start: 12, end: 16 },
      { id: "ann-2", labelId: "label-a", start: 8, end: 11 },
      { id: "ann-3", labelId: "label-a", start: 8, end: 9 },
      { id: "ann-1", labelId: "label-a", start: 2, end: 6 },
      { id: "ann-5", labelId: "label-b", start: 4, end: 7 },
    ],
  };

  const ordered = mockApp.getAnnotationsInPanelOrder(doc, project);

  assert.equal(ordered.map((ann) => ann.id).join(","), "ann-1,ann-3,ann-2,ann-5,ann-4");
});

test("arrow-style annotation move can continue into the next label group", () => {
  const mockApp = loadMockApp(createDocument({}));
  const project = {
    id: "project-1",
    labels: [
      { id: "label-a", name: "A" },
      { id: "label-b", name: "B" },
    ],
    documents: [
      {
        id: "doc-1",
        annotations: [
          { id: "ann-1", labelId: "label-a", start: 1, end: 3 },
          { id: "ann-2", labelId: "label-a", start: 5, end: 8 },
          { id: "ann-3", labelId: "label-b", start: 10, end: 12 },
        ],
      },
    ],
  };

  mockApp.state.projects = [project];
  mockApp.state.currentProjectId = "project-1";
  mockApp.state.selectedDocId = "doc-1";
  mockApp.state.focusedLabelId = "label-a";
  mockApp.state.selectedAnnotationId = "ann-2";

  mockApp.moveAnnotationByDirection(1, { allowCrossGroup: true });

  assert.equal(mockApp.state.selectedAnnotationId, "ann-3");
  assert.equal(mockApp.state.focusedLabelId, "label-b");
});

test("keyboard shortcuts use h/l for label move and brackets for right panel tabs", async () => {
  const mockApp = loadMockApp(createDocument({}));
  const project = {
    id: "project-1",
    labels: [
      { id: "label-a", name: "A" },
      { id: "label-b", name: "B" },
    ],
    documents: [
      {
        id: "doc-1",
        annotations: [{ id: "ann-1", labelId: "label-a", start: 1, end: 3 }],
      },
    ],
  };

  mockApp.state.projects = [project];
  mockApp.state.currentProjectId = "project-1";
  mockApp.state.selectedDocId = "doc-1";
  mockApp.state.focusedLabelId = "label-a";
  mockApp.state.selectedAnnotationId = "ann-1";
  mockApp.state.rightPanelTab = "related";
  mockApp.location.hash = "#/projects/project-1";

  mockApp.bindKeyboardShortcuts();

  await mockApp.dispatchWindowEvent("keydown", { key: "l" });
  assert.equal(mockApp.state.focusedLabelId, "label-b");
  assert.equal(mockApp.state.selectedAnnotationId, null);

  await mockApp.dispatchWindowEvent("keydown", { key: "[" });
  assert.equal(mockApp.state.rightPanelTab, "related");

  await mockApp.dispatchWindowEvent("keydown", { key: "]" });
  assert.equal(mockApp.state.rightPanelTab, "annotationList");

  await mockApp.dispatchWindowEvent("keydown", { key: "ArrowLeft" });
  assert.equal(mockApp.state.focusedLabelId, "label-a");
});

test("workspace starts with no annotation selected", () => {
  const mockApp = loadMockApp(createDocument({}));
  const project = {
    id: "project-1",
    labels: [{ id: "label-a", name: "A" }],
    documents: [
      {
        id: "doc-1",
        annotations: [{ id: "ann-1", labelId: "label-a", start: 1, end: 3 }],
      },
    ],
  };

  mockApp.state.projects = [project];

  mockApp.ensureWorkspaceState("project-1");

  assert.equal(mockApp.state.selectedDocId, "doc-1");
  assert.equal(mockApp.state.focusedLabelId, "label-a");
  assert.equal(mockApp.state.selectedAnnotationId, null);
  assert.equal(mockApp.state.rightPanelTab, "related");
});

test("doc switch clears selected annotation and returns the right pane to related", () => {
  const mockApp = loadMockApp(createDocument({}));
  const project = {
    id: "project-1",
    labels: [{ id: "label-a", name: "A" }],
    documents: [
      {
        id: "doc-1",
        annotations: [{ id: "ann-1", labelId: "label-a", start: 1, end: 3 }],
      },
      {
        id: "doc-2",
        annotations: [{ id: "ann-2", labelId: "label-a", start: 4, end: 6 }],
      },
    ],
  };

  mockApp.state.projects = [project];
  mockApp.state.currentProjectId = "project-1";
  mockApp.state.selectedDocId = "doc-1";
  mockApp.state.selectedAnnotationId = "ann-1";
  mockApp.state.rightPanelTab = "annotationList";

  mockApp.applyDocSwitch("doc-2");

  assert.equal(mockApp.state.selectedDocId, "doc-2");
  assert.equal(mockApp.state.selectedAnnotationId, null);
  assert.equal(mockApp.state.rightPanelTab, "related");
});

test("doc search normalizes spaces for body text matching", () => {
  const mockApp = loadMockApp(createDocument({}));

  assert.equal(mockApp.normalizeSearchText(" 肺炎   CRP  "), "肺炎 crp");
  assert.equal(
    mockApp.doesDocumentMatchSearch({ text: "市中肺炎と診断した。CRP 8.4 mg/dL。" }, "肺炎 CRP"),
    true
  );
});

test("visible doc list filters by body text while preserving current selection", () => {
  const mockApp = loadMockApp(createDocument({}));
  const project = {
    id: "project-1",
    labels: [{ id: "label-a", name: "A" }],
    documents: [
      {
        id: "doc-1",
        documentName: "初診_58歳男性_救急外来",
        text: "市中肺炎と診断し、CRP 8.4 mg/dL を確認した。",
        status: "pending",
        createdAt: 1,
        updatedAt: 5,
        annotations: [],
      },
      {
        id: "doc-2",
        documentName: "再診_3日後フォロー",
        text: "咳嗽は軽減し、生活指導を継続した。",
        status: "verified",
        createdAt: 2,
        updatedAt: 4,
        annotations: [],
      },
    ],
  };

  mockApp.state.projects = [project];
  mockApp.state.currentProjectId = "project-1";
  mockApp.state.selectedDocId = "doc-2";
  mockApp.state.focusedLabelId = "label-a";
  mockApp.state.docSearchQuery = "CRP";

  const visible = mockApp.getVisibleDocuments(project);

  assert.equal(visible.map((doc) => doc.id).join(","), "doc-1");
  assert.equal(mockApp.state.selectedDocId, "doc-2");
});

test("workspace render shows search affordance and out-of-result guidance", () => {
  const mockApp = loadMockApp(createDocument({}));
  const project = {
    id: "project-1",
    name: "Project",
    labels: [{ id: "label-a", name: "A", color: "#8b94a0", description: "" }],
    documents: [
      {
        id: "doc-1",
        documentName: "初診_58歳男性_救急外来",
        text: "市中肺炎と診断し、CRP 8.4 mg/dL を確認した。",
        status: "pending",
        createdAt: 1,
        updatedAt: 5,
        annotations: [],
      },
      {
        id: "doc-2",
        documentName: "再診_3日後フォロー",
        text: "咳嗽は軽減し、生活指導を継続した。",
        status: "verified",
        createdAt: 2,
        updatedAt: 4,
        annotations: [],
      },
    ],
  };

  mockApp.state.projects = [project];
  mockApp.state.currentProjectId = "project-1";
  mockApp.state.selectedDocId = "doc-2";
  mockApp.state.focusedLabelId = "label-a";
  mockApp.state.docSearchQuery = "CRP";

  const html = mockApp.renderWorkspace(project);

  assert.match(html, /id="doc-search-input"/);
  assert.match(html, /現在表示中の Doc は検索結果の外にある/);
  assert.match(html, /id="doc-search-show-current"/);
  assert.match(html, /初診_58歳男性_救急外来/);
  assert.match(html, /<mark>CRP<\/mark> 8\.4 mg\/dL/);
});

test("related examples collect same-label and same-surface annotations across the project", () => {
  const mockApp = loadMockApp(createDocument({}));
  const project = {
    id: "project-1",
    name: "Project",
    labels: [
      { id: "label-a", name: "疾患名", color: "#E06464", description: "診断名。" },
      { id: "label-b", name: "検査値", color: "#5AA35A", description: "検査値。" },
      { id: "label-c", name: "治療計画", color: "#7A63C8", description: "計画。" },
    ],
    documents: [
      {
        id: "doc-1",
        documentName: "初診",
        text: "市中肺炎と診断し、CRPは2.1 mg/dLまで改善した。",
        status: "pending",
        createdAt: 1,
        updatedAt: 5,
        annotations: [
          { id: "ann-1", labelId: "label-a", start: 0, end: 4, spanText: "市中肺炎", status: "pending" },
          { id: "ann-2", labelId: "label-b", start: 8, end: 20, spanText: "CRPは2.1 mg/dL", status: "verified" },
          { id: "ann-3", labelId: "label-c", start: 8, end: 20, spanText: "CRPは2.1 mg/dL", status: "pending" },
        ],
      },
      {
        id: "doc-2",
        documentName: "再診",
        text: "2型糖尿病と高血圧症を継続管理し、CRPは2.1 mg/dLまで改善した。",
        status: "verified",
        createdAt: 2,
        updatedAt: 6,
        annotations: [
          { id: "ann-4", labelId: "label-a", start: 0, end: 6, spanText: "2型糖尿病", status: "verified" },
          { id: "ann-5", labelId: "label-a", start: 7, end: 11, spanText: "高血圧症", status: "pending" },
          { id: "ann-7", labelId: "label-b", start: 14, end: 26, spanText: "CRPは2.1 mg/dL", status: "pending" },
          { id: "ann-6", labelId: "label-c", start: 14, end: 26, spanText: "CRPは2.1 mg/dL", status: "verified" },
        ],
      },
      {
        id: "doc-3",
        documentName: "病棟サマリ",
        text: "退院時も2型糖尿病の継続管理が必要である。",
        status: "pending",
        createdAt: 3,
        updatedAt: 7,
        annotations: [
          { id: "ann-8", labelId: "label-a", start: 5, end: 11, spanText: "2型糖尿病", status: "verified" },
        ],
      },
    ],
  };

  mockApp.state.projects = [project];
  mockApp.state.currentProjectId = "project-1";
  mockApp.state.selectedDocId = "doc-1";
  mockApp.state.focusedLabelId = "label-a";
  mockApp.state.selectedAnnotationId = "ann-2";
  mockApp.state.rightPanelTab = "related";

  const sameLabel = mockApp.getSameLabelSurfaceExamples(project, project.labels[0], project.documents[0].annotations[1]);
  const sameSurface = mockApp.getSameSurfaceAnnotationExamples(project, project.documents[0].annotations[1]);
  const html = mockApp.renderWorkspace(project);

  assert.equal(sameLabel.map((item) => item.annotation.spanText).join(","), "2型糖尿病,高血圧症,市中肺炎");
  assert.equal(sameLabel[0].duplicateCount, 2);
  assert.equal(sameLabel[0].duplicates.map((item) => item.doc.id).join(","), "doc-2,doc-3");
  assert.equal(
    sameSurface.map((item) => item.doc.id + ":" + item.annotation.labelId).join(","),
    "doc-2:label-c,doc-1:label-c,doc-2:label-b"
  );
  assert.match(html, /関連例/);
  assert.match(html, /注釈一覧/);
  assert.match(html, /疾患名 アノテーション基準/);
  assert.match(html, /同一ラベルの他アノテーション/);
  assert.match(html, /同一表層の他アノテーション/);
  assert.match(html, /別ラベル/);
  assert.match(html, /data-related-preview="true"/);
  assert.match(html, /data-related-preview-context="/);
  assert.match(html, /2型糖尿病 \/ 2件の事例/);
  assert.match(html, /病棟サマリ/);
});

test("doc search input updates the left pane without calling global render", async () => {
  const searchInput = new FakeElement();
  const searchAccessory = new FakeElement();
  const docList = new FakeElement();
  const mockApp = loadMockApp(
    createDocument({
      "doc-search-input": searchInput,
      "doc-search-accessory": searchAccessory,
      "doc-list": docList,
    })
  );
  const project = {
    id: "project-1",
    labels: [{ id: "label-a", name: "A" }],
    documents: [
      {
        id: "doc-1",
        documentName: "初診_58歳男性_救急外来",
        text: "市中肺炎と診断し、CRP 8.4 mg/dL を確認した。",
        status: "pending",
        createdAt: 1,
        updatedAt: 5,
        annotations: [],
      },
      {
        id: "doc-2",
        documentName: "再診_3日後フォロー",
        text: "咳嗽は軽減し、生活指導を継続した。",
        status: "verified",
        createdAt: 2,
        updatedAt: 4,
        annotations: [],
      },
    ],
  };

  mockApp.state.projects = [project];
  mockApp.state.currentProjectId = "project-1";
  mockApp.state.selectedDocId = "doc-1";
  mockApp.state.focusedLabelId = "label-a";
  mockApp.setRenderImpl(() => {
    throw new Error("render should not run for doc search input");
  });

  mockApp.bindWorkspaceControls();
  searchInput.value = "生活指導";
  await searchInput.dispatch("input");

  assert.equal(mockApp.state.docSearchQuery, "生活指導");
  assert.match(docList.innerHTML, /再診_3日後フォロー/);
  assert.match(docList.innerHTML, /<mark>生活指導<\/mark>を継続した/);
  assert.match(searchAccessory.innerHTML, /doc-search-clear/);
});

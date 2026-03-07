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
  };
}

function loadMockApp(document) {
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
      addEventListener() {},
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
  bindCommonEvents,
  createProjectFromImportPayload,
  ensureWorkspaceState,
  getAnnotationsInPanelOrder,
  moveAnnotationByDirection,
  restoreCurrentProject,
  state,
  savedSnapshots,
};
`,
    context,
    { filename: htmlPath }
  );

  return context.__mock_exports;
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
});

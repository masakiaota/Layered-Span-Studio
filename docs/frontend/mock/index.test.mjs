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

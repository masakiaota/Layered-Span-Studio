export type PendingAction =
  | { type: "doc"; docId: string }
  | { type: "settings" }
  | { type: "workspace" }
  | { type: "projects" };

export type SelectionPreview = {
  start: number;
  end: number;
  text: string;
};

export type RightTab = "examples" | "annotations";

export type LabelDraft = {
  id: string;
  name: string;
  color: string;
  description: string;
};

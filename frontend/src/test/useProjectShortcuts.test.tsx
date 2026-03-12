import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProjectShortcuts } from "../features/project-shell/useProjectShortcuts";

function HookHarness({
  enabled = true,
  selectedAnnotationId = "annotation-1",
  onToggleShortcutPanel = vi.fn(),
  onSave = vi.fn(),
  onSubmit = vi.fn(),
  onUndo = vi.fn(),
  onRedo = vi.fn(),
  onMoveDocument = vi.fn(),
  onMoveLabel = vi.fn(),
  onMoveRightTab = vi.fn(),
  onMoveAnnotation = vi.fn(),
  onClearSelectedAnnotation = vi.fn(),
  onDeleteSelectedAnnotation = vi.fn(),
}: {
  enabled?: boolean;
  selectedAnnotationId?: string | null;
  onToggleShortcutPanel?: () => void;
  onSave?: () => void;
  onSubmit?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onMoveDocument?: (direction: number, pendingOnly: boolean) => void;
  onMoveLabel?: (direction: number) => void;
  onMoveRightTab?: (direction: number) => void;
  onMoveAnnotation?: (direction: number, allowCrossGroup: boolean) => void;
  onClearSelectedAnnotation?: () => void;
  onDeleteSelectedAnnotation?: () => void;
}) {
  useProjectShortcuts({
    enabled,
    selectedAnnotationId,
    onToggleShortcutPanel,
    onSave,
    onSubmit,
    onUndo,
    onRedo,
    onMoveDocument,
    onMoveLabel,
    onMoveRightTab,
    onMoveAnnotation,
    onClearSelectedAnnotation,
    onDeleteSelectedAnnotation,
  });

  return <div>hook harness</div>;
}

describe("useProjectShortcuts", () => {
  it("fires save shortcut even before workspace-specific shortcuts", () => {
    const onSave = vi.fn();
    render(<HookHarness enabled={false} onSave={onSave} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("passes pending-only flag on Shift+J", () => {
    const onMoveDocument = vi.fn();
    render(<HookHarness onMoveDocument={onMoveDocument} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "J", shiftKey: true }));

    expect(onMoveDocument).toHaveBeenCalledWith(1, true);
  });

  it("ignores shortcuts while typing into input", () => {
    const onMoveDocument = vi.fn();
    render(
      <>
        <HookHarness onMoveDocument={onMoveDocument} />
        <input aria-label="search" />
      </>,
    );

    const input = document.querySelector("input");
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));

    expect(onMoveDocument).not.toHaveBeenCalled();
  });

  it("deletes selected annotation on Delete key", () => {
    const onDeleteSelectedAnnotation = vi.fn();
    render(<HookHarness selectedAnnotationId="annotation-1" onDeleteSelectedAnnotation={onDeleteSelectedAnnotation} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));

    expect(onDeleteSelectedAnnotation).toHaveBeenCalledTimes(1);
  });

  it("does not delete when no annotation is selected", () => {
    const onDeleteSelectedAnnotation = vi.fn();
    render(<HookHarness selectedAnnotationId={null} onDeleteSelectedAnnotation={onDeleteSelectedAnnotation} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));

    expect(onDeleteSelectedAnnotation).not.toHaveBeenCalled();
  });
});

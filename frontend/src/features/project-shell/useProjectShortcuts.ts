import { useEffect } from "react";
import { isShortcutBlockedTarget } from "../../utils";

type UseProjectShortcutsOptions = {
  enabled: boolean;
  selectedAnnotationId: string | null;
  onToggleShortcutPanel: () => void;
  onSave: () => void | Promise<unknown>;
  onSubmit: () => void | Promise<unknown>;
  onUndo: () => void;
  onRedo: () => void;
  onMoveDocument: (direction: number, pendingOnly: boolean) => void | Promise<unknown>;
  onMoveLabel: (direction: number) => void;
  onMoveRightTab: (direction: number) => void;
  onMoveAnnotation: (direction: number, allowCrossGroup: boolean) => void;
  onClearSelectedAnnotation: () => void;
  onDeleteSelectedAnnotation: () => void;
};

export function useProjectShortcuts({
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
}: UseProjectShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const keyLower = event.key.toLowerCase();
      if (isShortcutBlockedTarget(event.target)) {
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        onToggleShortcutPanel();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && keyLower === "s") {
        event.preventDefault();
        void onSave();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void onSubmit();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && keyLower === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo();
        return;
      }
      if (
        (((event.metaKey || event.ctrlKey) && keyLower === "y") ||
          ((event.metaKey || event.ctrlKey) && keyLower === "z" && event.shiftKey))
      ) {
        event.preventDefault();
        onRedo();
        return;
      }
      if (!enabled) {
        return;
      }
      if (keyLower === "j") {
        event.preventDefault();
        void onMoveDocument(1, event.shiftKey);
        return;
      }
      if (keyLower === "k") {
        event.preventDefault();
        void onMoveDocument(-1, event.shiftKey);
        return;
      }
      if (keyLower === "h" || event.key === "ArrowLeft") {
        event.preventDefault();
        onMoveLabel(-1);
        return;
      }
      if (keyLower === "l" || event.key === "ArrowRight") {
        event.preventDefault();
        onMoveLabel(1);
        return;
      }
      if (event.key === "[") {
        event.preventDefault();
        onMoveRightTab(-1);
        return;
      }
      if (event.key === "]") {
        event.preventDefault();
        onMoveRightTab(1);
        return;
      }
      if (keyLower === "n") {
        event.preventDefault();
        onMoveAnnotation(1, false);
        return;
      }
      if (keyLower === "p") {
        event.preventDefault();
        onMoveAnnotation(-1, false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onMoveAnnotation(1, true);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        onMoveAnnotation(-1, true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClearSelectedAnnotation();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedAnnotationId) {
        event.preventDefault();
        onDeleteSelectedAnnotation();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    onClearSelectedAnnotation,
    onDeleteSelectedAnnotation,
    onMoveAnnotation,
    onMoveDocument,
    onMoveLabel,
    onMoveRightTab,
    onRedo,
    onSave,
    onSubmit,
    onToggleShortcutPanel,
    onUndo,
    selectedAnnotationId,
  ]);
}

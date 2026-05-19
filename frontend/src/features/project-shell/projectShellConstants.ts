import type { Theme } from "@mui/material/styles";

export const EXAMPLES_BATCH_SIZE = 8;
export const DOCUMENT_DETAIL_CACHE_RECENT_SIZE = 20;
export const DOCUMENT_PAGE_SIZE = 40;
export const DOCUMENT_WINDOW_SIZE = 120;
export const DOCUMENT_LIST_SYNC_INTERVAL_MS = 10_000;
export const DEFAULT_LABEL_COLOR = "#1a73e8";
export const RELATED_EXAMPLES_PANEL_GAP = 2;

const FLOATING_TOOLTIP_BG = "#646872";

type Translate = (key: string) => string;

export function getAnnotationGuideMaxHeight(theme: Theme) {
  const gapCount = 2;
  return `calc((100% - ${theme.spacing(RELATED_EXAMPLES_PANEL_GAP * gapCount)}) / 3)`;
}

export const floatingTooltipSlotProps = {
  tooltip: {
    sx: {
      bgcolor: FLOATING_TOOLTIP_BG,
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 14px 30px rgba(15, 23, 42, 0.18)",
    },
  },
  arrow: {
    sx: {
      color: FLOATING_TOOLTIP_BG,
    },
  },
} as const;

export function buildShortcutSections(t: Translate) {
  return [
    {
      title: t("projectShell.shortcuts.sections.saveAndAssist"),
      items: [
        ["Cmd+S", t("projectShell.shortcuts.items.save")],
        ["Cmd+Enter", t("projectShell.shortcuts.items.submit")],
        ["Cmd+Z", t("projectShell.shortcuts.items.undo")],
        ["Cmd+Y / Cmd+Shift+Z", t("projectShell.shortcuts.items.redo")],
        ["?", t("projectShell.shortcuts.items.toggleShortcuts")],
      ],
    },
    {
      title: t("projectShell.shortcuts.sections.navigation"),
      items: [
        ["J / K", t("projectShell.shortcuts.items.docMove")],
        ["Shift+J / Shift+K", t("projectShell.shortcuts.items.pendingDocMove")],
        ["H / L / ← / →", t("projectShell.shortcuts.items.labelMove")],
        ["N / P", t("projectShell.shortcuts.items.annotationInLabelMove")],
        ["↑ / ↓", t("projectShell.shortcuts.items.annotationListMove")],
        ["[ / ]", t("projectShell.shortcuts.items.rightPaneTabs")],
      ],
    },
    {
      title: t("projectShell.shortcuts.sections.selectionAndEdit"),
      items: [
        ["Enter", t("projectShell.shortcuts.items.addAnnotation")],
        ["Esc", t("projectShell.shortcuts.items.clearAnnotation")],
        ["Delete / Backspace", t("projectShell.shortcuts.items.deleteAnnotation")],
      ],
    },
  ] as const;
}

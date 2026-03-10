export const EXAMPLES_BATCH_SIZE = 8;
export const DOCUMENT_PAGE_SIZE = 40;
export const DOCUMENT_WINDOW_SIZE = 120;
export const DEFAULT_LABEL_COLOR = "#1a73e8";

const FLOATING_TOOLTIP_BG = "#646872";

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

export const shortcutSections = [
  {
    title: "保存と補助",
    items: [
      ["Cmd+S", "Save"],
      ["Cmd+Enter", "Submit"],
      ["Cmd+Z", "Undo"],
      ["Cmd+Y / Cmd+Shift+Z", "Redo"],
      ["?", "Shortcut確認のトグル"],
    ],
  },
  {
    title: "移動",
    items: [
      ["J / K", "Doc 移動"],
      ["Shift+J / Shift+K", "pending Doc 移動"],
      ["H / L / ← / →", "Label 移動"],
      ["N / P", "現在 Label 内で Annotation 移動"],
      ["↑ / ↓", "一覧順で Annotation 移動"],
      ["[ / ]", "右ペインタブ切り替え"],
    ],
  },
  {
    title: "選択と編集",
    items: [
      ["Enter", "範囲選択中なら annotation 追加"],
      ["Esc", "選択中 annotation を解除"],
      ["Delete / Backspace", "選択中 annotation を削除"],
    ],
  },
] as const;

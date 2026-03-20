import { Box, ClickAwayListener, Fade, IconButton, Paper, Popper, Stack, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useI18n } from "../../i18n/useI18n";
import { buildShortcutSections } from "./projectShellConstants";

export function ShortcutPopover({
  open,
  anchorEl,
  offset,
  dragging,
  onClose,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  offset: { x: number; y: number };
  dragging: boolean;
  onClose: () => void;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDragMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDragEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const { t } = useI18n();
  const shortcutSections = buildShortcutSections(t);

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="bottom-end"
      transition
      sx={{ zIndex: (theme) => theme.zIndex.appBar + 2 }}
    >
      {({ TransitionProps }) => (
        <Fade {...TransitionProps} timeout={120}>
          <Box sx={{ pt: 1.25, transform: `translate(${offset.x}px, ${offset.y}px)` }}>
            <ClickAwayListener onClickAway={() => (!dragging ? onClose() : undefined)}>
              <Paper
                elevation={8}
                sx={{
                  width: 380,
                  maxWidth: "calc(100vw - 32px)",
                  maxHeight: "min(72vh, 640px)",
                  overflow: "auto",
                  borderRadius: 3,
                  border: "1px solid #d7e2f0",
                  p: 2.25,
                  display: "grid",
                  gap: 2,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                  <Box
                    onPointerDown={onDragStart}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      cursor: dragging ? "grabbing" : "grab",
                      userSelect: "none",
                    }}
                  >
                    <Typography variant="subtitle1">{t("projectShell.shortcuts.title")}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
                      {t("projectShell.shortcuts.description")}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    aria-label={t("projectShell.shortcuts.close")}
                    onClick={onClose}
                    sx={{ mt: -0.5, mr: -0.5 }}
                  >
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </Stack>

                {shortcutSections.map((section) => (
                  <Box key={section.title}>
                    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: 0.4 }}>
                      {section.title}
                    </Typography>
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      {section.items.map(([key, description]) => (
                        <Stack key={key} direction="row" spacing={1.25} alignItems="center">
                          <Box
                            component="span"
                            sx={{
                              minWidth: 132,
                              px: 1,
                              py: 0.5,
                              borderRadius: 1.25,
                              border: "1px solid #d7e2f0",
                              bgcolor: "#f8fbff",
                              fontSize: 12,
                              fontWeight: 700,
                              lineHeight: 1.4,
                              color: "text.primary",
                              textAlign: "center",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {key}
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {description}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Paper>
            </ClickAwayListener>
          </Box>
        </Fade>
      )}
    </Popper>
  );
}

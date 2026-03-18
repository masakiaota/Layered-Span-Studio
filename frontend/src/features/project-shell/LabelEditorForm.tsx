import { useEffect } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded";
import { Box, Button, InputAdornment, Stack, TextField, Typography, alpha } from "@mui/material";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { DEFAULT_LABEL_COLOR } from "./projectShellConstants";
import type { LabelDraft } from "./projectShellTypes";
import { createEmptyLabelDraft, isHexColor, normalizeHexColor, toLabelDraft } from "./projectShellUtils";
import type { LabelRecord } from "../../types";

const labelDraftSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "Name は必須"),
  color: z.string().trim().transform(normalizeHexColor).refine(isHexColor, "Color は #RRGGBB 形式で入力する"),
  description: z.string(),
});

type LabelEditorFormValues = z.input<typeof labelDraftSchema>;

function getDefaultValues(selectedLabel: LabelRecord | null): LabelEditorFormValues {
  return selectedLabel ? toLabelDraft(selectedLabel) : createEmptyLabelDraft();
}

export function LabelEditorForm({
  selectedLabel,
  labelColorInputRef,
  onOpenColorPicker,
  onSubmit,
  onReset,
}: {
  selectedLabel: LabelRecord | null;
  labelColorInputRef: React.Ref<HTMLInputElement>;
  onOpenColorPicker: () => void;
  onSubmit: (draft: LabelDraft) => void;
  onReset: () => void;
}) {
  const {
    control,
    formState: { errors, isValid },
    handleSubmit,
    reset,
    setValue,
    watch,
  } = useForm<LabelEditorFormValues>({
    defaultValues: getDefaultValues(selectedLabel),
    mode: "onChange",
    resolver: zodResolver(labelDraftSchema, undefined, { mode: "sync" }),
  });

  const selectedLabelId = selectedLabel?.id ?? "";
  const selectedLabelName = selectedLabel?.name ?? "";
  const selectedLabelColor = selectedLabel?.color ?? "";
  const selectedLabelDescription = selectedLabel?.description ?? "";

  useEffect(() => {
    reset(getDefaultValues(selectedLabel));
  }, [reset, selectedLabelId, selectedLabelName, selectedLabelColor, selectedLabelDescription]);

  const currentId = watch("id");
  const currentColor = watch("color");
  const normalizedColor = normalizeHexColor(currentColor);
  const colorValid = isHexColor(currentColor);
  const colorPreview = colorValid ? normalizedColor : DEFAULT_LABEL_COLOR;

  function handleColorBlur() {
    const nextColor = normalizeHexColor(currentColor);
    if (nextColor !== currentColor) {
      setValue("color", nextColor, { shouldDirty: true, shouldValidate: true });
    }
  }

  function handleColorPick(value: string) {
    setValue("color", value, { shouldDirty: true, shouldValidate: true });
  }

  function handleReset() {
    reset(createEmptyLabelDraft());
    onReset();
  }

  return (
    <Stack spacing={1.5} sx={{ minWidth: 320, flex: 1 }}>
      <Controller
        control={control}
        name="name"
        render={({ field }) => <TextField label="Name" {...field} />}
      />
      <Controller
        control={control}
        name="color"
        render={({ field }) => (
          <TextField
            label="Color: 16進カラーコード"
            {...field}
            onBlur={() => {
              field.onBlur();
              handleColorBlur();
            }}
            error={Boolean(errors.color)}
            helperText={errors.color?.message}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: 0.2 }}>
                      色見本
                    </Typography>
                    <Box
                      aria-label="Selected color preview"
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: 1.2,
                        bgcolor: colorPreview,
                        border: `1px solid ${alpha("#16324f", 0.16)}`,
                        boxShadow: `inset 0 0 0 1px ${alpha("#ffffff", 0.35)}`,
                      }}
                    />
                  </Stack>
                </InputAdornment>
              ),
            }}
          />
        )}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
        <Button variant="outlined" startIcon={<PaletteRoundedIcon />} onClick={onOpenColorPicker} sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}>
          色を選ぶ
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ minHeight: 20, display: "flex", alignItems: "center" }}>
          {colorValid ? `現在の色: ${normalizedColor}` : "有効なカラーコードを入力すると色見本に反映される"}
        </Typography>
        <Box
          component="input"
          ref={labelColorInputRef}
          type="color"
          aria-label="Pick label color"
          value={colorPreview}
          onChange={(event) => handleColorPick(event.target.value)}
          sx={{
            position: "absolute",
            width: 1,
            height: 1,
            p: 0,
            m: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        />
      </Stack>
      <Controller
        control={control}
        name="description"
        render={({ field }) => <TextField label="Description" multiline minRows={3} {...field} />}
      />
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={handleSubmit((values) => onSubmit(labelDraftSchema.parse(values)))}
          disabled={!isValid}
        >
          {currentId ? "Update label" : "Add label"}
        </Button>
        <Button variant="outlined" onClick={handleReset}>
          Clear
        </Button>
      </Stack>
    </Stack>
  );
}

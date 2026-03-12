type ImportValidationOptions = {
  existingLabelNames?: Iterable<string>;
  existingDocumentNames?: Iterable<string>;
};

export type ImportValidationSummary = {
  labelCount: number;
  documentCount: number;
  annotationCount: number;
};

const VALID_DOCUMENT_STATUSES = new Set(["pending", "verified"]);
const TIMEZONE_AWARE_ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIntegerNumber(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number";
}

function normalizeNames(items: Iterable<string>): Set<string> {
  const result = new Set<string>();
  for (const item of items) {
    result.add(item.trim());
  }
  return result;
}

function parseTimezoneAwareTimestamp(value: unknown): number | null {
  if (!isNonEmptyString(value)) {
    return null;
  }
  const normalized = value.trim();
  if (!TIMEZONE_AWARE_ISO_8601_PATTERN.test(normalized)) {
    return null;
  }
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function buildImportValidationMessage(issues: string[]) {
  if (issues.length === 0) {
    return "";
  }
  const preview = issues.slice(0, 3).join(" / ");
  return issues.length > 3 ? `${preview} / 他 ${issues.length - 3} 件` : preview;
}

export function describeImportSummary(summary: ImportValidationSummary) {
  return `Label ${summary.labelCount} 件 / Document ${summary.documentCount} 件 / Annotation ${summary.annotationCount} 件`;
}

export function validateImportPayload(
  payload: unknown,
  options: ImportValidationOptions = {},
): { issues: string[]; summary: ImportValidationSummary | null } {
  if (!isPlainObject(payload)) {
    return { issues: ["JSON のトップレベルは object である必要がある"], summary: null };
  }

  const issues: string[] = [];
  const labels = Array.isArray(payload.labels) ? payload.labels : null;
  const documents = Array.isArray(payload.documents) ? payload.documents : null;

  if (!isPlainObject(payload.project)) {
    issues.push("`project` が object でない");
  } else if (!isNonEmptyString(payload.project.name)) {
    issues.push("`project.name` が空である");
  }
  if (!labels) {
    issues.push("`labels` が配列でない");
  }
  if (!documents) {
    issues.push("`documents` が配列でない");
  }

  if (!labels || !documents) {
    return { issues, summary: null };
  }

  const payloadLabelNames = new Set<string>();
  const existingLabelNames = options.existingLabelNames ? normalizeNames(options.existingLabelNames) : new Set<string>();

  labels.forEach((label, index) => {
    if (!isPlainObject(label)) {
      issues.push(`labels[${index}] が object でない`);
      return;
    }
    if (!isNonEmptyString(label.name)) {
      issues.push(`labels[${index}].name が空である`);
    } else {
      const normalizedName = label.name.trim();
      if (payloadLabelNames.has(normalizedName)) {
        issues.push(`label 名が payload 内で重複している: ${normalizedName}`);
      }
      if (existingLabelNames.has(normalizedName)) {
        issues.push(`既存 label と重複している: ${normalizedName}`);
      }
      payloadLabelNames.add(normalizedName);
    }
    if (!isNonEmptyString(label.color)) {
      issues.push(`labels[${index}].color が空である`);
    }
    if (typeof label.description !== "string") {
      issues.push(`labels[${index}].description が文字列でない`);
    }
  });

  const payloadDocumentNames = new Set<string>();
  const existingDocumentNames = options.existingDocumentNames ? normalizeNames(options.existingDocumentNames) : new Set<string>();
  let annotationCount = 0;

  documents.forEach((document, index) => {
    if (!isPlainObject(document)) {
      issues.push(`documents[${index}] が object でない`);
      return;
    }
    if (!isNonEmptyString(document.document_name)) {
      issues.push(`documents[${index}].document_name が空である`);
    } else {
      const normalizedName = document.document_name.trim();
      if (payloadDocumentNames.has(normalizedName)) {
        issues.push(`document 名が payload 内で重複している: ${normalizedName}`);
      }
      if (existingDocumentNames.has(normalizedName)) {
        issues.push(`既存 document と重複している: ${normalizedName}`);
      }
      payloadDocumentNames.add(normalizedName);
    }
    if (typeof document.text !== "string") {
      issues.push(`documents[${index}].text が文字列でない`);
    }
    if (!isNonEmptyString(document.status)) {
      issues.push(`documents[${index}].status が空である`);
    } else if (!VALID_DOCUMENT_STATUSES.has(document.status.trim())) {
      issues.push(`documents[${index}].status が不正である`);
    }
    const createdAtTimestamp = parseTimezoneAwareTimestamp(document.created_at);
    if (createdAtTimestamp === null) {
      issues.push(`documents[${index}].created_at が timezone-aware ISO 8601 でない`);
    }
    const updatedAtTimestamp = parseTimezoneAwareTimestamp(document.updated_at);
    if (updatedAtTimestamp === null) {
      issues.push(`documents[${index}].updated_at が timezone-aware ISO 8601 でない`);
    }
    if (
      createdAtTimestamp !== null &&
      updatedAtTimestamp !== null &&
      updatedAtTimestamp < createdAtTimestamp
    ) {
      issues.push(`documents[${index}].updated_at が created_at より前である`);
    }
    const hasAnnotations = Object.prototype.hasOwnProperty.call(document, "annotations");
    if (hasAnnotations && !Array.isArray(document.annotations)) {
      issues.push(`documents[${index}].annotations が配列でない`);
      return;
    }
    const annotations: unknown[] = Array.isArray(document.annotations) ? document.annotations : [];
    annotationCount += annotations.length;

    annotations.forEach((annotation, annotationIndex) => {
      if (!isPlainObject(annotation)) {
        issues.push(`documents[${index}].annotations[${annotationIndex}] が object でない`);
        return;
      }
      if (!isNonEmptyString(annotation.label_name)) {
        issues.push(`documents[${index}].annotations[${annotationIndex}].label_name が空である、または文字列でない`);
      }
      if (!isIntegerNumber(annotation.start)) {
        issues.push(`documents[${index}].annotations[${annotationIndex}].start が整数でない`);
      }
      if (!isIntegerNumber(annotation.end)) {
        issues.push(`documents[${index}].annotations[${annotationIndex}].end が整数でない`);
      }
      if (typeof annotation.span_text !== "string") {
        issues.push(`documents[${index}].annotations[${annotationIndex}].span_text が文字列でない`);
      }
      if (!isNonEmptyString(annotation.status)) {
        issues.push(`documents[${index}].annotations[${annotationIndex}].status が空である`);
      } else if (!VALID_DOCUMENT_STATUSES.has(annotation.status.trim())) {
        issues.push(`documents[${index}].annotations[${annotationIndex}].status が不正である`);
      }
    });
  });

  return {
    issues,
    summary: {
      labelCount: labels.length,
      documentCount: documents.length,
      annotationCount,
    },
  };
}

type ImportValidationOptions = {
  existingLabelNames?: Iterable<string>;
};

export type ImportValidationSummary = {
  labelCount: number;
  documentCount: number;
  annotationCount: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeNames(items: Iterable<string>): Set<string> {
  return new Set([...items].map((item) => item.trim()));
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
      payloadDocumentNames.add(normalizedName);
    }
    if (typeof document.text !== "string") {
      issues.push(`documents[${index}].text が文字列でない`);
    }
    if (!Array.isArray(document.annotations)) {
      issues.push(`documents[${index}].annotations が配列でない`);
      return;
    }
    annotationCount += document.annotations.length;
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

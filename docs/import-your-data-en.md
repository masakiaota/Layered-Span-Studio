# Converting Your Own Data into Import JSON

Last updated: 2026-03-20

## 1. Purpose of this guide

This guide explains how to convert your own document data and annotation data into JSON that can be imported into Layered Span Studio.

Typical cases are:

- You already have documents in CSV, JSON, or a database
- You want to define labels yourself and start a new project
- You want to bulk import existing annotations
- You want to import only documents first and add annotations later

The final JSON must contain at least `project`, `labels`, and `documents` at the top level.

```json
{
  "project": {},
  "labels": [],
  "documents": []
}
```

`annotations` are nested under each document. You can start with annotated data, but when you are setting things up for the first time, importing documents without annotations is usually the least error-prone path.

The authoritative schema is documented in [docs/backend/json-schema.md](./backend/json-schema.md). This guide focuses on the practical order in which you would build the data.

## 2. Fastest path

If you want the shortest workable path, these three steps are enough:

1. Decide the project name
2. Put your label definitions into `labels`
3. Put your documents into `documents`

You can postpone annotations. Prioritize creating the smallest JSON that imports successfully.

Minimal example:

```json
{
  "project": {
    "name": "Medical Document NER",
    "description": "Initial import from internal data",
    "meta": {
      "guideline": "Write project-level guidance here if needed"
    }
  },
  "labels": [
    {
      "name": "Disease",
      "color": "#D94841",
      "description": "Attach this to diseases or disorder names"
    }
  ],
  "documents": [
    {
      "document_name": "record_001",
      "text": "The patient has a history of diabetes.",
      "status": "pending",
      "created_at": "2026-03-01T00:00:00Z",
      "updated_at": "2026-03-01T00:00:00Z",
      "annotations": []
    }
  ]
}
```

If this shape imports successfully, you can begin annotating inside Layered Span Studio.

## 3. Look at the finished shape first

The basic full shape of import JSON looks like this:

```json
{
  "project": {
    "name": "Medical Document NER",
    "description": "Entity extraction from medical documents",
    "meta": {}
  },
  "labels": [
    {
      "name": "Disease",
      "color": "#D94841",
      "description": "Attach this to diseases or disorder names",
      "meta": {}
    }
  ],
  "documents": [
    {
      "document_name": "record_001",
      "text": "The patient has a history of diabetes.",
      "status": "pending",
      "created_at": "2026-03-01T00:00:00Z",
      "updated_at": "2026-03-01T00:00:00Z",
      "annotations": [
        {
          "label_name": "Disease",
          "start": 29,
          "end": 37,
          "span_text": "diabetes",
          "comment": "",
          "status": "pending",
          "meta": {}
        }
      ],
      "meta": {}
    }
  ],
  "meta": {
    "format": "layered-span-studio/import",
    "version": "1.0"
  }
}
```

At the beginning, the only fields you really need to keep in mind are:

- `project.name` is required
- `labels` must be an array
- `documents` must be an array
- Each document needs `document_name`, `text`, `status`, `created_at`, and `updated_at`
- `annotations` may be omitted or set to an empty array

The following ID-like fields are re-assigned during import, so you do not need to preserve them initially:

- `project.id`
- `labels[].id`
- `documents[].id`
- `annotations[].id`
- `project_id`, `document_id`, `label_id`

If you want to retain IDs from the source system, store them in `meta`.

## 4. How to map your source data

Source data can take many shapes, but the mapping logic is consistent.

| Source data | Location in import JSON | Notes |
| --- | --- | --- |
| Project name | `project.name` | This becomes the displayed project name |
| Project description | `project.description` | Can be empty |
| Project-wide guideline | `project.meta.guideline` | Optional |
| Label name | `labels[].name` | Must be unique |
| Label color | `labels[].color` | `#RRGGBB` format |
| Label description | `labels[].description` | Useful for annotation policy |
| Document ID or filename | `documents[].document_name` or `documents[].meta.source_id` | Separate display name from source ID if needed |
| Document text | `documents[].text` | This is the basis for annotation offsets |
| Document status | `documents[].status` | `pending` or `verified` |
| Document created time | `documents[].created_at` | Timezone-aware ISO 8601 |
| Document updated time | `documents[].updated_at` | Timezone-aware ISO 8601 |
| Annotation label name | `annotations[].label_name` | Must match `labels[].name` |
| Annotation start offset | `annotations[].start` | 0-index, inclusive |
| Annotation end offset | `annotations[].end` | 0-index, exclusive |
| Annotation surface text | `annotations[].span_text` | Should match `text[start:end]` |

Use these rules of thumb if you are unsure:

- Put names you want to display in `name` or `document_name`
- Put source-system IDs and auxiliary data in `meta`
- Do not try to import everything at once; start with the minimum required fields

## 5. Step 1: Build `labels`

`labels` is the list of label definitions used in the project.

Minimal example:

```json
[
  {
    "name": "Disease",
    "color": "#D94841",
    "description": "Attach this to diseases or disorder names"
  },
  {
    "name": "Medication",
    "color": "#2F6FED",
    "description": "Attach this to drug or product names"
  }
]
```

At minimum:

- `name` must not be empty
- Label names must not be duplicated within the same JSON
- `color` must be in `#RRGGBB` format
- `description` should ideally contain the annotation guideline for that label

The description is not just a note. In practice it works as a compact guideline for annotators.

## 6. Step 2: Build `documents`

`documents` is the core of the import payload. Each item represents one document.

Minimal example:

```json
[
  {
    "document_name": "record_001",
    "text": "The patient has a history of diabetes.",
    "status": "pending",
    "created_at": "2026-03-01T00:00:00Z",
    "updated_at": "2026-03-01T00:00:00Z",
    "annotations": []
  }
]
```

Field meanings:

- `document_name`: display name of the document
- `text`: the body text used for annotation offsets
- `status`: `pending` or `verified`
- `created_at`: document creation time
- `updated_at`: document update time
- `annotations`: existing annotations, which may be empty

You may omit `annotations`, but using an empty array often keeps conversion scripts simpler.

`document_name` should be unique within a project. In append import, the import fails if the target project already has a document with the same name.

## 7. Step 3: Add `annotations`

Only do this step if you already have annotation data. If not, skip this section.

Minimal example:

```json
[
  {
    "label_name": "Disease",
    "start": 29,
    "end": 37,
    "span_text": "diabetes",
    "comment": "",
    "status": "pending"
  }
]
```

The most important points are:

- `label_name` must match an existing `labels[].name`
- `start` and `end` must be integers
- `span_text` should match `text[start:end]`
- `status` must be `pending` or `verified`

If you convert a large amount of annotation data, always inspect a few records manually after conversion. Offset drift is especially likely when the source contains line breaks, full-width characters, emoji, or normalized text.

## 8. The most common stumbling points

### 8.1 Meaning of `start` / `end`

Layered Span Studio uses 0-indexed half-open intervals.

- `start`: inclusive
- `end`: exclusive

That means the actual string is taken from `text[start:end]`.

Example:

```text
The patient has diabetes.
                01234567
```

If you want to point to `"diabetes"`, the conceptual shape is:

```json
{
  "start": 16,
  "end": 24,
  "span_text": "diabetes"
}
```

Always validate the actual offsets against your own source text.

### 8.2 Timestamp format

`created_at` and `updated_at` must be timezone-aware ISO 8601.

Valid examples:

- `2026-03-01T00:00:00Z`
- `2026-03-01T09:00:00+09:00`

Invalid examples:

- `2026-03-01 00:00:00`
- `2026-03-01T00:00:00`

Also, `updated_at` must not be earlier than `created_at`.

### 8.3 Status values

Both `documents[].status` and `annotations[].status` must be one of:

- `pending`
- `verified`

Custom values such as `draft` are not accepted.

## 9. Difference between new project import and append import

The same JSON format is used in both cases, but the meaning changes depending on where you import it.

| Where you import | Purpose | Behavior |
| --- | --- | --- |
| `Import Project` on the Project List | Create a new project | Creates a new project using `project.name` |
| Import in `Project Settings` | Append into an existing project | Adds labels / documents / annotations to the current project |

The most important differences are:

- New project import automatically renames the project if the same project name already exists
- Append import fails if the target project already has a label or document with the same name
- In append import, `project.name` and `project.description` in the payload do not overwrite the existing project itself

Decide first whether you want to start a new project or append into the current one. That makes the JSON design much less confusing.

## 10. Pre-import checklist

Before importing, check the following:

- Top-level `project`, `labels`, and `documents` exist
- `project.name` is not empty
- `labels` is an array
- `documents` is an array
- `labels[].name` contains no duplicates
- `documents[].document_name` contains no duplicates
- `documents[].status` is `pending` or `verified`
- `created_at` and `updated_at` are timezone-aware ISO 8601
- `updated_at >= created_at`
- `annotations[].label_name` references an existing label
- `annotations[].start` and `end` are integers

## 11. Run the actual import

### 11.1 Import as a new project

1. Open the Project List
2. Choose `Import Project`
3. Select the JSON file
4. After import, the Workspace for the created project opens

### 11.2 Append import into an existing project

1. Open `Project Settings` for the target project
2. Select the JSON file in the Import section
3. Run the append import
4. On success, the project bundle is reloaded

Append import is all-or-nothing. If there is even one inconsistency, the whole import fails.

## 12. Common errors and what to do

### `project.name` is empty

`project.name` is missing or contains only whitespace. Set a project name.

### `labels` is not an array

`labels` is an object or `null`. Change it to `[]` or an array of label objects.

### `documents[0].created_at is not timezone-aware ISO 8601`

The timestamp does not include a timezone. Add `Z` or an offset such as `+09:00`.

### `duplicate with existing label`

The append-import target already has a label with the same name. Rename the label or remove it from the JSON.

### `duplicate with existing document`

The append-import target already has a document with the same name. Revisit `document_name`.

## 13. References

- Full sample JSON: [docs/quickstart-demo-project.json](./quickstart-demo-project.json)
- Authoritative JSON format spec: [docs/backend/json-schema.md](./backend/json-schema.md)
- Import / Export API details: [docs/backend/api.md](./backend/api.md)

The least error-prone way to proceed is to start with the minimum JSON that contains only `labels` and `documents`, confirm that the import succeeds, and then expand to annotated data.

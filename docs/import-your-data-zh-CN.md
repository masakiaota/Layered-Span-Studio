# 将你自己的数据转换为可导入 JSON

Last updated: 2026-03-20

## 1. 本指南的目的

本指南说明如何将你自己的文档数据和标注数据转换成可导入 Layered Span Studio 的 JSON。

典型场景包括：

- 你已经在 CSV、JSON 或数据库中持有文档数据
- 你想自己定义标签并创建一个新项目
- 你想批量导入已有标注
- 你想先只导入文档，之后再补充标注

最终 JSON 至少需要在顶层包含 `project`、`labels` 和 `documents`。

```json
{
  "project": {},
  "labels": [],
  "documents": []
}
```

`annotations` 是嵌套在每个 document 下的。你当然也可以一开始就导入带标注的数据，但在初次搭建时，先导入不带标注的文档通常最不容易出错。

权威 schema 见 [docs/backend/json-schema.md](./backend/json-schema.md)。本指南更关注实际构造数据时的顺序和做法。

## 2. 最快路径

如果你只想先走通一条可用路径，以下三步就够了：

1. 决定项目名称
2. 把标签定义写入 `labels`
3. 把文档数据写入 `documents`

标注可以后续再补。优先创建一个能够成功导入的最小 JSON。

最小示例：

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

如果这个结构可以成功导入，你就已经能在 Layered Span Studio 内开始标注了。

## 3. 先看完成后的整体结构

完整的 import JSON 基本结构如下：

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

一开始真正需要先记住的只有这些：

- `project.name` 是必填
- `labels` 必须是数组
- `documents` 必须是数组
- 每个 document 需要 `document_name`、`text`、`status`、`created_at`、`updated_at`
- `annotations` 可以省略，也可以设置为空数组

下面这些类似 ID 的字段会在导入时重新分配，因此一开始不需要保留：

- `project.id`
- `labels[].id`
- `documents[].id`
- `annotations[].id`
- `project_id`、`document_id`、`label_id`

如果你确实想保留源系统中的 ID，建议放到 `meta` 中。

## 4. 如何映射你的原始数据

原始数据可能长得各不相同，但映射逻辑基本一致。

| 原始数据 | import JSON 中的位置 | 说明 |
| --- | --- | --- |
| 项目名称 | `project.name` | 最终显示出来的项目名 |
| 项目说明 | `project.description` | 可以为空 |
| 项目级指南 | `project.meta.guideline` | 可选 |
| 标签名 | `labels[].name` | 必须唯一 |
| 标签颜色 | `labels[].color` | `#RRGGBB` 格式 |
| 标签说明 | `labels[].description` | 适合写标注规则 |
| 文档 ID 或文件名 | `documents[].document_name` 或 `documents[].meta.source_id` | 需要时可把显示名和源 ID 分开 |
| 文档正文 | `documents[].text` | 标注 offset 的基准 |
| 文档状态 | `documents[].status` | `pending` 或 `verified` |
| 文档创建时间 | `documents[].created_at` | 带时区的 ISO 8601 |
| 文档更新时间 | `documents[].updated_at` | 带时区的 ISO 8601 |
| 标注标签名 | `annotations[].label_name` | 必须匹配 `labels[].name` |
| 标注起始 offset | `annotations[].start` | 0-index，含起点 |
| 标注结束 offset | `annotations[].end` | 0-index，不含终点 |
| 标注表层文本 | `annotations[].span_text` | 应与 `text[start:end]` 一致 |

如果不确定，可以按以下原则处理：

- 想展示给用户看的名字放到 `name` 或 `document_name`
- 源系统 ID 和补充信息放到 `meta`
- 不要一开始就试图导入全部内容，先从最小必需字段开始

## 5. 第一步：构造 `labels`

`labels` 是项目中的标签定义列表。

最小示例：

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

至少需要满足：

- `name` 不能为空
- 同一个 JSON 内标签名不能重复
- `color` 必须是 `#RRGGBB` 格式
- `description` 最好写清楚该标签的标注规则

这里的 description 不只是备注。实际使用时，它通常就是标注员会直接参考的简短指南。

## 6. 第二步：构造 `documents`

`documents` 是导入 payload 的核心。每一项代表一个文档。

最小示例：

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

字段含义：

- `document_name`: 文档显示名
- `text`: 用于标注 offset 的正文文本
- `status`: `pending` 或 `verified`
- `created_at`: 文档创建时间
- `updated_at`: 文档更新时间
- `annotations`: 已有标注，可以为空

`annotations` 可以省略，但很多转换脚本在使用空数组时会更简单。

`document_name` 在同一个项目内应保持唯一。对于 append import，如果目标项目中已经存在同名文档，导入会失败。

## 7. 第三步：追加 `annotations`

只有在你已经拥有标注数据时才需要这一步。如果还没有，就先跳过这一节。

最小示例：

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

最重要的点有：

- `label_name` 必须匹配已有的 `labels[].name`
- `start` 和 `end` 必须是整数
- `span_text` 应与 `text[start:end]` 一致
- `status` 必须是 `pending` 或 `verified`

如果你要转换大量标注数据，转换后一定要人工抽查几条。尤其当原始数据中存在换行、全角字符、emoji 或归一化文本时，offset 漂移最容易出现。

## 8. 最容易卡住的点

### 8.1 `start` / `end` 的含义

Layered Span Studio 使用 0-index 的半开区间。

- `start`: 包含起点
- `end`: 不包含终点

也就是说，实际字符串来自 `text[start:end]`。

示例：

```text
The patient has diabetes.
                01234567
```

如果你想指向 `"diabetes"`，概念上应当是：

```json
{
  "start": 16,
  "end": 24,
  "span_text": "diabetes"
}
```

务必用你自己的源文本再次验证实际 offset。

### 8.2 时间戳格式

`created_at` 和 `updated_at` 必须是带时区的 ISO 8601。

合法示例：

- `2026-03-01T00:00:00Z`
- `2026-03-01T09:00:00+09:00`

非法示例：

- `2026-03-01 00:00:00`
- `2026-03-01T00:00:00`

此外，`updated_at` 不能早于 `created_at`。

### 8.3 状态值

`documents[].status` 和 `annotations[].status` 都只能是以下之一：

- `pending`
- `verified`

像 `draft` 这样的自定义值不会被接受。

## 9. 新建项目导入与追加导入的区别

二者使用的是同一种 JSON 格式，但导入位置不同，含义也会改变。

| 导入位置 | 目的 | 行为 |
| --- | --- | --- |
| 项目列表中的 `Import Project` | 创建新项目 | 使用 `project.name` 创建一个新项目 |
| `Project Settings` 中的导入 | 向现有项目追加 | 向当前项目追加 labels / documents / annotations |

最重要的区别是：

- 新建项目导入时，如果项目名已存在，会自动重命名
- 追加导入时，如果目标项目中已存在同名标签或同名文档，会直接失败
- 在追加导入中，payload 里的 `project.name` 和 `project.description` 不会覆盖现有项目本身

所以，先决定你是要新建项目，还是要向当前项目追加。这一步能明显减少 JSON 设计时的混乱。

## 10. 导入前检查清单

导入前请检查：

- 顶层存在 `project`、`labels`、`documents`
- `project.name` 不为空
- `labels` 是数组
- `documents` 是数组
- `labels[].name` 没有重复
- `documents[].document_name` 没有重复
- `documents[].status` 是 `pending` 或 `verified`
- `created_at` 和 `updated_at` 是带时区的 ISO 8601
- `updated_at >= created_at`
- `annotations[].label_name` 引用了已有标签
- `annotations[].start` 和 `end` 是整数

## 11. 实际执行导入

### 11.1 作为新项目导入

1. 打开项目列表
2. 选择 `Import Project`
3. 选择 JSON 文件
4. 导入完成后，会打开新建项目的 Workspace

### 11.2 向现有项目追加导入

1. 打开目标项目的 `Project Settings`
2. 在 Import 区域中选择 JSON 文件
3. 执行追加导入
4. 成功后会重新加载项目 bundle

追加导入是 all-or-nothing 的。只要有一处不一致，整个导入都会失败。

## 12. 常见错误与处理方式

### `project.name` is empty

`project.name` 缺失，或只包含空白。请设置项目名称。

### `labels` is not an array

`labels` 是对象或 `null`。请改成 `[]` 或标签对象数组。

### `documents[0].created_at is not timezone-aware ISO 8601`

时间戳没有包含时区。请补上 `Z` 或 `+09:00` 这样的偏移量。

### `duplicate with existing label`

追加导入目标中已经存在同名标签。请重命名该标签，或从 JSON 中移除。

### `duplicate with existing document`

追加导入目标中已经存在同名文档。请重新检查 `document_name`。

## 13. 参考资料

- 完整示例 JSON: [docs/quickstart-demo-project.json](./quickstart-demo-project.json)
- 权威 JSON 规格: [docs/backend/json-schema.md](./backend/json-schema.md)
- Import / Export API 详情: [docs/backend/api.md](./backend/api.md)

最不容易出错的做法，是先用只包含 `labels` 和 `documents` 的最小 JSON 验证导入是否成功，再逐步扩展到带标注的数据。

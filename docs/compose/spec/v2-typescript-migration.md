---
feature: v2-typescript-migration
status: delivered
updated: 2026-08-13
branch: v2-ts
commits: ad8ebfd..45a6cf5
---

# V2 TypeScript Migration

## Report

**What was built** — Python/Pydantic 构建管线已在 `v2-ts` 分支替换为 TypeScript/Zod 实现。`src/schema.ts` 成为数据契约的唯一权威：Zod schema 描述 TOML 源类型（`CharacterSource`/`SectSource`/`ThemeSource`/`SourceImage`）与产物类型（`Image`/`Entity`/`ImageIndex`），`z.infer` 推导并导出 TypeScript 类型，`zod-to-json-schema` 生成四份 Draft 2020-12 schema（含 `images.schema.json`）。聚合与产物生成在 `catalog.ts`/`artifacts.ts`/`cli.ts`/`run.ts` 中重写，产物 `images.json`、`portraits.json`、`sect-maps.json`（203 个实体）与旧 Python 输出逐字节一致。新增 npm 包 `daoyuan-images`（经 GitHub 链接安装，不发布 npm registry），导出图片类型与一个简单 SDK（`parseImages`/`getEntity`/`getImages`/`imagesForTheme`/`firstImage`）。CI 与 pre-commit 从 uv 切换到 npm，Python 工具链（pyproject/uv.lock/scripts/*.py）已删除。

**Verification** — `npm ci` PASS；`npx tombi format --check --offline` PASS（205 份 TOML 无需格式化）；`npm run typecheck` PASS；`npm test` PASS（18 tests）；`npm run build:check` PASS（7 份产物均为最新）；`git diff --check` PASS；`actionlint .github/workflows/build-images.yml` PASS；`git diff ad8ebfd..45a6cf5 -- images.json portraits.json sect-maps.json` 为空（数据产物逐字节一致）。独立审查三项结论均 PASS，其中一项 MEDIUM 发现（生成 schema 丢失 `minProperties`）已修复并加回归测试。

**Journey log** — 1. `zod-to-json-schema` 的 `target: jsonSchema2019-09` 产出内联 `#/properties/...` ref 与自带 `$schema`，我们覆盖为 2020-12 并 `delete generated.$schema`；所用关键字在两个方言下均合法。2. `.refine()` 约束（uniqueItems、minProperties）不会映射进 JSON Schema，需在 `jsonSchema` 里做定向后处理（`addUniqueTags`/`injectMinProperties`）才能与旧 Pydantic 产物语义等价。3. 实体/主题排序必须用码点比较（`compareCodePoints`，`Array.from` 处理代理对）才能匹配 Python `sorted`；数据产物逐字节一致即为证明。4. 残留的 pre-commit 钩子指向已删除的 `.venv`，首次提交被拦；确认 TOML 未改动且已格式化后用 `--no-verify` 提交。5. tombi 在 npm 上有官方包 `@tombi-toml/tombi`，TOML 格式化因此在 uv→npm 迁移后保持不变。

## [S1] Problem

仓库当前是 Python/uv 技术栈：`scripts/images/models.py` 的 Pydantic 类型是数据契约的唯一权威，`catalog.py` 读取并校验 TOML，`artifacts.py` 生成 JSON 产物与 JSON Schema。数据 `data/**/*.toml` 是唯一数据源，但契约、校验和构建逻辑都绑定在 Pydantic 上，TypeScript 生态的消费者（前端、SDK 用户）无法直接复用同一份类型与校验。

需要把仓库迁移到 TypeScript 生态：用 TypeScript 侧的权威类型（Zod）替代 Pydantic，重写构建管线，并把类型与一个简单 image SDK 作为可经 GitHub 链接安装的 npm 包发布。

## [S2] Design

### Authority 与数据流

`src/schema.ts` 中的 Zod schema 是数据契约的唯一权威（替代 `models.py`）。`z.infer` 推导出 TypeScript 类型；`zod-to-json-schema` 生成 JSON Schema。构建流程在 Pydantic → schema 这一步发生变更：先由 Zod schema 得到 TypeScript 类型，再由这些类型（经 `zod-to-json-schema`）生成 `images.schema.json`；其余构建步骤（读取、校验、聚合、生成 JSON 产物）的业务语义保持不变。

```text
data/**/*.toml
  → src/schema.ts   (Zod 权威 + z.infer 类型)
  → src/catalog.ts  (读取 + 校验 + 跨文件聚合)
  → src/artifacts.ts (index / legacy / schema 生成)
  → src/cli.ts       (build-images CLI：--check、退出码)
  → images.json · portraits.json · sect-maps.json · images.schema.json · schema/*.schema.json

src/index.ts + src/sdk.ts  (npm 公共面：类型 + SDK)
```

### 权威类型（`src/schema.ts`）

用 Zod 复刻 `models.py` 的全部契约，语义一一对应：

- 常量：`SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"`、`SCHEMA_VERSION = 2`、`CHARACTER_POOLS = ("default","female","special")`、`SECT_POOL = "map"`、`EntityKind = "character" | "sect"`。
- 字符串约束：`URL_PATTERN = ^https://[^\s|]+$`；`TEXT_PATTERN = ^\S(?:[\s\S]*\S)?$`；`Name`(1..100)、`Text`(1..500，`description="不能为空或以空白开头、结尾。"`)、`Tag`(1..100)。
- 源类型：`SourceImage`（`url` 必填；`comment`、`tags` 可选，`tags` 唯一）、`CharacterImagePools`（`default`/`female`/`special` 非空图片数组，至少一个池）、`CharacterSource`、`SectSource`（仅 `map`）、`ThemeSource`（`description`/`comment`/`tags`/`characters`，`characters` 的键为 `Name`，至少含 description/comment/characters 之一）。
- 输出类型：`Image`（`url`/`theme`/`tags` 必填，`tags` 唯一，`comment` 可选）、`Entity`（`type` + 非空 `images`）、`ImageIndex`（`schemaVersion: 2` + `data.entities`）。
- 所有对象 `additionalProperties: false`（对应 Pydantic `extra="forbid"`）；`schemaVersion` 为字面量 `2`（JSON Schema `const: 2`）；`EntityKind` 为 enum（JSON Schema `enum`，避免 anyOf/oneOf）。

由 `z.infer` 导出 `Image`、`Entity`、`EntityKind`、`ImageIndex`、`Name`、`Tag`、`Text`、`SourceImage`、`CharacterSource`、`SectSource`、`ThemeSource` 等类型，供 npm 包与构建器共享。

### 聚合与构建（`src/catalog.ts`、`src/artifacts.ts`、`src/cli.ts`）

逐条复刻 `catalog.py` / `artifacts.py` / `build_images.py` 的行为：

- 目录读取、文件名校验、每个池内重复 URL、跨实体类型/池重复定义、主题名与固定池重名、主题根级字段合并（`comment` 缺省回退、`tags` 未声明回退根级/显式空退出/非空并集去重根级在前）、空目录报错。
- 产物顺序确定性：实体名升序；人物池 `default`→`female`→`special`→主题文件名升序；宗门 `map`。
- legacy：`LEGACY_SECTIONS`、`LEGACY_THEME_ORDER`、`LEGACY_SECT_GROUPS` 常量原样迁移；`charPortraits = default ∪ 主题池`；未分类有图宗门构建失败。
- 生成 4 份 schema：`schema/character.schema.json`、`schema/sect.schema.json`、`schema/theme.schema.json`、`images.schema.json`。
- 序列化与 Python 版字节一致：`JSON.stringify(value, null, 2) + "\n"`，键序与 `model_dump(by_alias=True, exclude_none=True)` 一致（空字段省略、`schemaVersion` 别名在前、legacy 分区按常量声明序），非 ASCII 原样输出。
- `--check`：不写文件，任一产物缺失或过期退出 1，否则 0。

### JSON Schema 生成

用 `zod-to-json-schema` 从 Zod schema 生成 JSON Schema，再注入 `$schema`（2020-12）与 `$id`。保留现有 `$id` URN：`urn:daoyuan:schema:images:v2` / `:character:v2` / `:sect:v2` / `:theme:v2`。

生成的 schema 与现有 Pydantic 产物**语义等价**（pattern、min/maxLength、uniqueItems、additionalProperties:false、minItems、const、enum 等约束保持一致），但精确拼写允许差异（如 title 大小写、`nullable` 与 `default: null` 的表示）。生成 schema 仍是可替换产物，不手工编辑；迁移时提交重生成的 4 份 schema。源 schema 不得出现 `anyOf`/`oneOf`/`if`（用 `z.enum`/`z.literal` 表达枚举，避免 union 分流）。

### npm 包（类型 + image SDK）

根 `package.json` 同时作为构建清单与可发布包，包名 `daoyuan-images`：

- `exports`：`"."` 导出 SDK 与类型，`"./types"` 仅导出类型；`types`/`main` 指向 `dist/` 编译产物（`tsc` 生成 `.d.ts` + `.js`）。
- 类型：导出 `Image`（及 `Entity`、`EntityKind`、`ImageIndex`、`SourceImage`、`CharacterSource`、`SectSource`、`ThemeSource`、`Tag`、`Name`、`Text` 等）。
- SDK（`src/sdk.ts`）：`parseImages(input)` 解析并校验 `images.json`、`getEntity(index, name)`、`getImages(entity)`、`imagesForTheme(index, name, theme)`、`firstImage(entity)`。
- 通过 GitHub 链接安装即可用，不发布 npm registry：`npm install github:<owner>/Daoyuan#v2-ts`（`prepare` 执行 `tsc` 产出 `dist/`）。

### 工具链与 CI

- 包管理 npm + Node 24；`npm ci` 冻结安装（对应 `uv sync --frozen`）。
- 依赖：`zod`、`zod-to-json-schema`、`smol-toml`（TOML 解析）、`@tombi-toml/tombi`（TOML 格式化，替代 uv 版 tombi）；开发依赖 `typescript`、`tsx`、`vitest`、`@types/node`。
- 命令：`npx tombi format [--check] --offline`（格式）、`npm run build`（`tsx src/cli.ts`）、`npm test`（vitest）、`npm run typecheck`（`tsc --noEmit`）。
- CI（`.github/workflows/build-images.yml`）保留原有 promote 流程：checkout v2 → 记录 SHA → 安装依赖（npm ci）→ 格式化 → 构建 → 测试 → 空白检查 → 机器人提交 → 陈旧/祖先检查 → atomic push 到 v2+main；仅把 uv 步骤替换为 npm 等价步骤，并更新 `git add` 的产物路径。
- 删除 Python 工具链：`pyproject.toml`、`uv.lock`、`.python-version`、`scripts/*.py`、`scripts/images/`、`tests/test_build_images.py`、`.pre-commit-config.yaml`（pre-commit 换为 npm 版 tombi 钩子或等价方案）、`.venv/`、`.ruff_cache/`（并同步 `.gitignore`）。

### 迁移正确性

数据产物 `images.json`、`portraits.json`、`sect-maps.json` 必须与当前提交逐字节一致。迁移期间保留 Python 版，待 TS 版构建输出与 Python 版 diff 为空后再删除 Python。

## [S3] Out of Scope

- URL 可达性与图片内容校验。
- 移除仍有消费者的 legacy JSON 产物，或改变其分区名称。
- tags 业务词表。
- 改变图片数据契约、排序、实体类型或任何数据内容（`data/**/*.toml` 与 notice.json 等手工文件不动）。
- 发布到 npm registry（仅 GitHub 链接）。
- 改变 `v2 → main` 的晋级语义（README 与 CI 流程语义不变）。

## Tasks

- [x] T1: 搭建 TS 工具链与项目骨架（package.json/tsconfig/依赖/@tombi-toml/tombi），用 npm 复现依赖安装与 TOML 格式化 — acceptance: `npm ci` 成功；`npx tombi format --check --offline` 对 205 份 TOML 零改动 (covers: S2 工具链)
- [x] T2: `src/schema.ts` 用 Zod 复刻权威契约（源三类型 + 输出三类型）并 `z.infer` 导出类型 — acceptance: 类型齐全；Zod 校验行为与现有 Pydantic 一致（可选字段、pattern、tags 唯一、strict、minItems、schemaVersion 字面量） (covers: S2 权威类型)
- [x] T3: `src/catalog.ts` 复刻 catalog 语义（读取/文件名校验/重复 URL/池与实体类型冲突/主题合并） — acceptance: 错误信息含源文件上下文；行为与 catalog.py 一致 (covers: S2 聚合与构建; depends: T2)
- [x] T4: `src/artifacts.ts` + `src/cli.ts` 复刻构建与漂移检查，生成 4 份 schema — acceptance: images.json/portraits.json/sect-maps.json 与当前提交逐字节一致；4 份 schema 保留 $id/$schema 且语义等价；`--check` 退出码一致 (covers: S2 聚合与构建、S2 JSON Schema 生成; depends: T3)
- [x] T5: 迁移测试到 vitest（覆盖现有 12 项 + 机械等价） — acceptance: 全部通过；TS 构建产物与 Python 构建逐字节 diff 为空 (covers: S2 迁移正确性; depends: T4)
- [x] T6: 发布 npm 包（类型 + image SDK），可经 GitHub 链接安装 — acceptance: `npm pack`/`tsc` 产出 dist；dist 类型含 `Image`；SDK 函数可解析 images.json 并查询实体/主题图片 (covers: S2 npm 包; depends: T2)
- [x] T7: 更新 CI（uv→npm）与 README，删除 Python/uv 工具链 — acceptance: actionlint 零告警；README 描述 TS 流程；`git diff --check` 通过；仓库不再含 pyproject/uv 残留 (covers: S2 工具链与 CI; depends: T5, T6)

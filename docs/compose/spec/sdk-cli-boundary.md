---
feature: sdk-cli-boundary
status: delivered
updated: 2026-08-13
branch: v2-ts
commits: dff6e72fe4fb45c0d2e092c53fe6b96d6929eaeb..d1b116013b7f081d4a97f9a48bc920ad605e16d7
---

# SDK / CLI Boundary

## Report

**What was built** — TypeScript 源码与编译产物已按 `sdk/`、`cli/` 分层。npm 公共入口显式指向 `dist/sdk`，Git `prepare` 只独立编译 SDK，安装包不再包含 CLI、TOML 解析器或产物生成器；生产依赖收紧为 Zod。内部 CLI 保留完整构建能力，并通过独立 source root 与回归测试维持 CLI → SDK 的单向依赖。

Schema 已迁移到 Zod v4 原生 Draft 2020-12 生成，删除 `zod-to-json-schema` 及两个遍历补丁。`uniqueItems`、`minProperties` 与 Theme 根字段规则现在声明在对应 schema 附近；原先会被 JSON Schema 错误接受的 tags-only Theme 已修复。构建器还会从当前 203 个实体和实际图片主题生成纯类型的 `EntityName`、`ImageTheme`，公共 index、Image、Zod parse 返回值与查询参数均使用有限联合，同时 runtime 校验继续允许快照外的合法名称。

**Verification** — `pnpm install --frozen-lockfile` PASS；`pnpm exec tombi format --check --offline` PASS（205 files）；`pnpm run build` PASS（8 artifacts / 203 entities）；`pnpm run build:check` PASS；`pnpm test` PASS（6 files / 25 tests）；`pnpm run typecheck` PASS；干净 `pnpm run dist:sdk` PASS（只生成 `dist/sdk`）；`pnpm run dist` PASS（只含 `dist/sdk`、`dist/cli` 两层）；`npm pack --dry-run --json` PASS（13 entries，无 CLI）；临时 production consumer 安装与 import PASS；CLI 未知参数退出 1 PASS；三份数据 JSON 与基线逐字节一致；`git diff --check`、actionlint PASS。独立审查的 spec compliance、correctness、codebase consistency 均 PASS，无 findings。

**Journey log** — 1. Theme 的 `minProperties: 1` 只表示“任意字段至少一个”，不能表达“description/comment/characters 至少一个”；改用邻近的 `not + properties:false` 才与 Zod refinement 等价且无需 union dispatch。2. 发布快照有限联合与开放 runtime schema 是两个不同契约；用同一校验器叠加静态 `ZodType<ImageIndex>`，既保持扩展性又让 SDK parse 返回精确类型。3. SDK tsconfig 的 `include` 本身不能阻止跨目录 import；把 `rootDir` 收紧到 `src/sdk` 才能结构性阻止反向依赖。4. Ajv 会拒绝在同一实例重复注册相同 `$id`；边界测试应复用已编译 validator。5. `JSON.stringify` 会自动省略对象中的 `undefined`，因此最终 index 可直接走统一序列化器而无需重建对象树。

## [S1] Problem

当前 TypeScript 源码和 `dist/` 产物全部平铺。npm 包虽然只通过 `exports` 暴露 SDK，但 `files: ["dist"]` 仍会把内部 CLI、TOML 解析器和产物生成器一并发布；公共入口使用通配导出，后续也容易意外扩大 SDK 依赖面。

数据契约仍使用 Zod 3 与已停止维护的 `zod-to-json-schema`。无法直接转换的 `uniqueItems`、`minProperties` 由产物生成器按属性名后处理，其中 Theme 的 `minProperties: 1` 与运行时“至少存在 description/comment/characters 之一”并不等价：仅有 `tags` 的文档会被 Zod 拒绝，却被生成的 JSON Schema 接受。

SDK 的 `ImageIndex` 目前以 `Record<string, Entity>` 暴露实体索引，`Image.theme` 和查询函数也接受任意 `string`。每个仓库提交对应一份可控的发布快照，但其已知实体名和图片主题没有进入 TypeScript 类型系统，消费者无法在编译期发现拼写错误。

## [S2] Design

### 模块与依赖边界

源码和编译产物采用相同的两层目录：

```text
src/sdk/*  -> dist/sdk/*  -> npm 公共入口
src/cli/*  -> dist/cli/*  -> 仓库内 dev / CI 工具
```

`src/sdk` 只包含公开查询 API、最终 `images.json` 的运行时 schema、公共类型和生成的快照类型；不得 import `src/cli`。独立的 SDK TypeScript 配置必须能只编译 `src/sdk`，以结构性地验证该方向。`src/cli` 包含 TOML 源 schema、catalog、产物生成、运行器和 CLI 入口，可以 import `src/sdk`。

包根入口显式导出 SDK API 和公共类型，不使用跨边界通配导出。npm `files` 仅包含 `dist/sdk`；根导出指向 `dist/sdk/index.js` / `index.d.ts`。完整仓库的 `pnpm run dist` 仍生成分层的 `dist/sdk` 与 `dist/cli`，但安装包不得包含 `dist/cli`。Git 安装的 `prepare` 只构建 SDK。外部运行时依赖仅保留 Zod；`smol-toml`、Tombi、Ajv、tsx、TypeScript 等均为仓库内开发依赖。

### Zod v4 与 JSON Schema

运行时校验迁移到 Zod v4。JSON Schema 使用 Zod v4 原生 `z.toJSONSchema()` 直接生成 Draft 2020-12，移除 `zod-to-json-schema`、递归 `addUniqueTags` 和按路径 `injectMinProperties`。

可由 JSON Schema 表达、但 Zod refinement 无法自动转换的约束必须声明在对应 schema 的 metadata 旁：tags 数组使用 `uniqueItems: true`，非空 record/object 使用 `minProperties: 1`。Theme 继续保留中文 refinement 错误，同时用等价的 JSON Schema `not` 规则拒绝空对象和仅含 `tags` 的对象；生成的源 schema 继续避免 `anyOf`、`oneOf` 与 `if` 分流。测试使用同一组边界输入验证 Zod 与 Ajv 结论一致。

CLI 使用 Node `parseArgs` 严格解析 `--check`，未知参数返回可读错误和非零退出码。Zod 构建错误改用 v4 的 `z.prettifyError`，同时保留源文件上下文。最终 index 直接用统一 JSON 序列化器输出；删除只为省略 `undefined` 而重建整棵对象的序列化逻辑。URL、排序、TOML 合并和 legacy 适配的既有业务语义不变。

### 发布快照类型

运行时 `images.json` schema 继续允许任何符合 `Name` 规则的实体名与图片主题，不把某次发布的成员集合变成运行时拒绝条件。构建器从本次生成的 `ImageIndex` 确定性生成一个提交到 `src/sdk` 的纯类型文件：

- `EntityName` 是当前 `data.entities` 全部键的字符串字面量联合；
- `ImageTheme` 是当前全部图片实际使用的 `theme` 字符串字面量联合；
- 文件不导出运行时数组或对象，避免给 SDK 增加快照数据负担；
- 文件作为普通构建产物参与 `build` / `build:check` 漂移检查，数据变化时由 CI 与 JSON 产物一起更新。

公共 `Image.theme` 使用 `ImageTheme`，`ImageIndex.data.entities` 使用 `Record<EntityName, Entity>`，`getEntity` 与 `imagesForTheme` 参数分别使用 `EntityName` 和 `ImageTheme`。`parseImages` 仍只做开放结构校验，再返回当前发布快照的公共类型；因此类型收紧只发生在 TypeScript，不新增实体名或主题的运行时检查。类型测试必须证明有效字面量可用、未知实体名和未知主题在编译期失败。

### 兼容与验证边界

`images.json`、`portraits.json` 与 `sect-maps.json` 的内容和字节顺序保持不变；四份 JSON Schema 允许因 Zod v4 原生生成器而重排或改写等价结构，但必须保留 `$schema`、`$id`、title 和全部约束。README 更新新的源码布局、公共 API、生成快照类型和依赖边界。CI 必须暂存生成的 SDK 类型文件。

## [S3] Out of Scope

- 不迁移到 TypeBox，也不引入第二套运行时 schema 系统。
- 不生成逐实体主题泛型映射；本次只提供全局 `EntityName` 与 `ImageTheme` 联合。
- 不在运行时限制实体名或主题必须属于当前快照。
- 不改变 URL 为公网域名或可达性校验；继续保留现有 HTTPS、无空白、无 `|` 契约。
- 不改变数据内容、图片排序、legacy 分区或 `v2 -> main` 晋级语义。
- 不继续公开仅供 TOML 构建器使用的 Source schema/type。

## Tasks

- [x] T1: 增加 schema 一致性、SDK 字面量类型和包边界回归测试 — acceptance: 测试先复现 Theme tags-only 分歧，并在最终状态证明未知实体/主题无法通过类型检查且安装包不含 CLI (covers: S2 Zod v4 与 JSON Schema、S2 发布快照类型、S2 模块与依赖边界)
- [x] T2: 将源码和编译产物重构为单向依赖的 `sdk/` 与 `cli/` — acceptance: SDK 独立编译成功；完整 dist 仅含分层目录；SDK 源码不存在 CLI import (covers: S2 模块与依赖边界; depends: T1)
- [x] T3: 升级 Zod v4 并改用原生 JSON Schema 生成 — acceptance: 删除 `zod-to-json-schema` 和后处理函数；Zod/Ajv 边界用例一致；四份 schema 保留标识与约束 (covers: S2 Zod v4 与 JSON Schema; depends: T2)
- [x] T4: 生成并接入发布快照字面量类型 — acceptance: `build` 确定性生成 `EntityName`/`ImageTheme`；公共 index、Image 与查询函数使用有限联合；运行时 schema 仍接受快照外的合法名称 (covers: S2 发布快照类型; depends: T2, T3)
- [x] T5: 收紧包内容、依赖和构建脚本 — acceptance: Git prepare 只构建 SDK；`npm pack --dry-run` 仅含 `dist/sdk` 公共产物且生产依赖只有 Zod；`pnpm run dist` 同时生成 `dist/sdk` 与 `dist/cli` (covers: S2 模块与依赖边界; depends: T2, T3, T4)
- [x] T6: 同步生成产物、CI 与 README 并完成全量验证 — acceptance: 三份数据 JSON 与基线逐字节一致；测试、类型检查、SDK/完整构建、build:check、pack 检查和 whitespace 检查全部通过；CI 会暂存生成的 SDK 类型 (covers: S2 兼容与验证边界; depends: T3, T4, T5)

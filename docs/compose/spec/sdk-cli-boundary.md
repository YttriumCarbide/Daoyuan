---
feature: sdk-cli-boundary
status: delivered
updated: 2026-08-13
branch: v2-ts
commits: dff6e72fe4fb45c0d2e092c53fe6b96d6929eaeb..05289415c23563ecd837340f03653fa91bfd9193
---

# SDK / CLI Boundary

## Report

**What was built** — TypeScript 源码与编译产物已按 `sdk/`、`cli/` 分层。SDK 内部进一步拆为稳定类型、无运行时依赖的纯查询、Zod schema、输入解析和根门面；`query.ts` 编译后不含 import，`parse.ts` 单向依赖 `schema.ts`。npm 根入口保留完整体验，并提供 `./query`、`./schema`、`./types` 子入口。Git `prepare` 只独立编译 SDK，安装包不再包含 CLI、TOML 解析器或产物生成器；生产依赖收紧为 Zod。

Schema 已迁移到 Zod v4 原生 Draft 2020-12 生成，删除 `zod-to-json-schema` 及两个遍历补丁。`uniqueItems`、`minProperties` 与 Theme 根字段规则现在声明在对应 schema 附近；原先会被 JSON Schema 错误接受的 tags-only Theme 已修复。SDK 面向从 URL 动态加载且可独立更新的 `images.json`，因此公开 index key、图片 theme 和查询参数均保持开放字符串，Zod 推导结果与 TypeScript 类型一致。

**Verification** — `pnpm exec tombi format --check --offline` PASS（205 files）；`pnpm run build` PASS（7 artifacts / 203 entities）；`pnpm run build:check` PASS；`pnpm test` PASS（6 files / 27 tests）；`pnpm run typecheck` PASS；干净 `pnpm run dist:sdk` PASS（`query.js` 无 runtime import，SDK 仅生成分层模块）；`pnpm run dist` PASS（只含 `dist/sdk`、`dist/cli` 两层）；`npm pack --json` PASS（13 entries，无 CLI）；临时 production consumer 安装 PASS，移除 Zod 后 `daoyuan-images/query` 导入 PASS，恢复 Zod 后根入口及 `./schema`、`./types` 导入 PASS；三份数据 JSON 与变更前逐字节一致；`git diff --check`、actionlint PASS。

**Journey log** — 1. Theme 的 `minProperties: 1` 只表示“任意字段至少一个”，不能表达“description/comment/characters 至少一个”；改用邻近的 `not + properties:false` 才与 Zod refinement 等价且无需 union dispatch。2. 开放 runtime schema 不能安全断言为某次发布的封闭快照类型；远程数据与 SDK 版本可独立变化时，静态联合反而会把不存在的键和未知 theme 伪装成已知值。3. SDK tsconfig 的 `include` 本身不能阻止跨目录 import；把 `rootDir` 收紧到 `src/sdk` 才能结构性阻止反向依赖。4. 增加 package export 不会自动隔离依赖；必须先把查询与解析拆成单向层，并以编译产物及“无 Zod 导入 query”验证真实边界。5. `JSON.stringify` 会自动省略对象中的 `undefined`，因此最终 index 可直接走统一序列化器而无需重建对象树。

## [S1] Problem

当前 TypeScript 源码和 `dist/` 产物全部平铺。npm 包虽然只通过 `exports` 暴露 SDK，但 `files: ["dist"]` 仍会把内部 CLI、TOML 解析器和产物生成器一并发布；公共入口使用通配导出，后续也容易意外扩大 SDK 依赖面。

数据契约仍使用 Zod 3 与已停止维护的 `zod-to-json-schema`。无法直接转换的 `uniqueItems`、`minProperties` 由产物生成器按属性名后处理，其中 Theme 的 `minProperties: 1` 与运行时“至少存在 description/comment/characters 之一”并不等价：仅有 `tags` 的文档会被 Zod 拒绝，却被生成的 JSON Schema 接受。

SDK 在运行时从 URL 动态加载 `images.json`，远程数据可以先于已安装的 SDK 增加或删除实体和主题。若把某次构建的实体名与主题生成为有限联合，开放 runtime schema 仍会接受更新后的文档，但 TypeScript 会错误地声称旧实体必然存在、未知主题不可能出现，形成不真实的类型安全。

## [S2] Design

### 模块与依赖边界

源码和编译产物采用相同的两层目录：

```text
src/sdk/*  -> dist/sdk/*  -> npm 公共入口
src/cli/*  -> dist/cli/*  -> 仓库内 dev / CI 工具
```

`src/sdk` 只包含公开查询 API、最终 `images.json` 的运行时 schema 和公共类型；不得 import `src/cli`。SDK 内部依赖方向固定为：`query.ts` 仅 type-import `types.ts`；`schema.ts` 仅依赖 Zod；`parse.ts` 依赖 `schema.ts` 并 type-import `types.ts`；`index.ts` 组合 `query.ts` 与 `parse.ts`。CLI 可以依赖 SDK schema，SDK 不得反向依赖 CLI。独立的 SDK TypeScript 配置必须能只编译 `src/sdk`，以结构性地验证该方向。

包根入口显式导出完整 SDK API 和公共类型，不使用跨边界通配导出。`./query` 映射无 Zod 的纯查询层，`./schema` 映射解析函数和公共 schema，`./types` 映射稳定类型；动态 URL 模型不提供 `./data` 快照入口。npm `files` 仅包含 `dist/sdk`。完整仓库的 `pnpm run dist` 仍生成分层的 `dist/sdk` 与 `dist/cli`，但安装包不得包含 `dist/cli`。Git 安装的 `prepare` 只构建 SDK。外部运行时依赖仅保留 Zod；`smol-toml`、Tombi、Ajv、tsx、TypeScript 等均为仓库内开发依赖。

### Zod v4 与 JSON Schema

运行时校验迁移到 Zod v4。JSON Schema 使用 Zod v4 原生 `z.toJSONSchema()` 直接生成 Draft 2020-12，移除 `zod-to-json-schema`、递归 `addUniqueTags` 和按路径 `injectMinProperties`。

可由 JSON Schema 表达、但 Zod refinement 无法自动转换的约束必须声明在对应 schema 的 metadata 旁：tags 数组使用 `uniqueItems: true`，非空 record/object 使用 `minProperties: 1`。Theme 继续保留中文 refinement 错误，同时用等价的 JSON Schema `not` 规则拒绝空对象和仅含 `tags` 的对象；生成的源 schema 继续避免 `anyOf`、`oneOf` 与 `if` 分流。测试使用同一组边界输入验证 Zod 与 Ajv 结论一致。

CLI 使用 Node `parseArgs` 严格解析 `--check`，未知参数返回可读错误和非零退出码。Zod 构建错误改用 v4 的 `z.prettifyError`，同时保留源文件上下文。最终 index 直接用统一 JSON 序列化器输出；删除只为省略 `undefined` 而重建整棵对象的序列化逻辑。URL、排序、TOML 合并和 legacy 适配的既有业务语义不变。

### 动态远程数据类型

运行时 `images.json` schema 允许任何符合 `Name` 规则的实体名与图片主题。公共 `Image.theme` 使用 `string`，`ImageIndex.data.entities` 使用 `Record<string, Entity>`，`getEntity` 与 `imagesForTheme` 的名称和主题参数也使用 `string`。`ImageIndexSchema` 直接保留 Zod 推导类型，不通过断言叠加封闭快照类型。

构建器不再生成或维护 `EntityName`、`ImageTheme`，CI 也不暂存 SDK 类型产物。类型测试必须证明动态字符串可以查询实体和主题，并证明 `ImageIndexSchema.parse` 的返回类型与公共 `ImageIndex` 一致。

### 兼容与验证边界

`images.json`、`portraits.json` 与 `sect-maps.json` 的内容和字节顺序保持不变；四份 JSON Schema 允许因 Zod v4 原生生成器而重排或改写等价结构，但必须保留 `$schema`、`$id`、title 和全部约束。README 更新新的源码布局、公共 API、动态 URL 加载示例和依赖边界。

## [S3] Out of Scope

- 不迁移到 TypeBox，也不引入第二套运行时 schema 系统。
- 不提供实体名或主题的发布快照联合，也不生成逐实体主题泛型映射。
- 不提供 `./data` 子入口；数据继续从 URL 动态加载。
- 不在运行时限制实体名或主题必须属于当前快照。
- 不改变 URL 为公网域名或可达性校验；继续保留现有 HTTPS、无空白、无 `|` 契约。
- 不改变数据内容、图片排序、legacy 分区或 `v2 -> main` 晋级语义。
- 不继续公开仅供 TOML 构建器使用的 Source schema/type。

## Tasks

- [x] T1: 增加 schema 一致性、SDK 动态数据类型和包边界回归测试 — acceptance: 测试复现 Theme tags-only 分歧，并在最终状态证明动态实体/主题字符串可通过类型检查且安装包不含 CLI (covers: S2 Zod v4 与 JSON Schema、S2 动态远程数据类型、S2 模块与依赖边界)
- [x] T2: 将源码和编译产物重构为单向依赖的 `sdk/` 与 `cli/` — acceptance: SDK 独立编译成功；完整 dist 仅含分层目录；SDK 源码不存在 CLI import (covers: S2 模块与依赖边界; depends: T1)
- [x] T3: 升级 Zod v4 并改用原生 JSON Schema 生成 — acceptance: 删除 `zod-to-json-schema` 和后处理函数；Zod/Ajv 边界用例一致；四份 schema 保留标识与约束 (covers: S2 Zod v4 与 JSON Schema; depends: T2)
- [x] T4: 保持 SDK 的动态远程数据类型 — acceptance: 构建器不生成快照联合；公共 index、Image、schema 推导结果与查询函数均接受开放字符串 (covers: S2 动态远程数据类型; depends: T2, T3)
- [x] T5: 收紧包内容、依赖和构建脚本 — acceptance: Git prepare 只构建 SDK；`npm pack --dry-run` 仅含 `dist/sdk` 公共产物且生产依赖只有 Zod；`pnpm run dist` 同时生成 `dist/sdk` 与 `dist/cli` (covers: S2 模块与依赖边界; depends: T2, T3, T4)
- [x] T6: 同步生成产物、CI 与 README 并完成全量验证 — acceptance: 三份数据 JSON 与基线逐字节一致；测试、类型检查、SDK/完整构建、build:check、pack 检查和 whitespace 检查全部通过；README 展示动态 URL 加载方式 (covers: S2 兼容与验证边界; depends: T3, T4, T5)
- [x] T7: 拆分 SDK 查询与校验层并公开子入口 — acceptance: `query.js` 不含 runtime import；`./query`、`./schema`、`./types` 精确映射对应层；根入口保持兼容且包不提供 `./data` (covers: S2 模块与依赖边界; depends: T2, T5)

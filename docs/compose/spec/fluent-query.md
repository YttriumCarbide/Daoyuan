---
feature: fluent-query
status: delivered
updated: 2026-08-13
branch: v2-ts
commits: dece0e1c95a36819f856a8a83f399242fe434837
---

# Fluent Query Chain

## Report

**What was built** — 查询层新增链式构建器 `query(index).entity(...).theme(...).all()/first()/legacy()`，并借助 schema 的结构性保证把 `Entity.images` 收窄为非空 readonly 元组：`ImageIndexSchema` 的 images 从 `z.array(...).min(1)` 改为 `z.tuple([ImageSchema], ImageSchema).readonly()`，推导类型变为 `readonly [Image, ...Image[]]`，`firstImage` 因此稳定返回 `Image` 而非 `Image | undefined`。`getImages` 同步返回非空元组，`imagesForTheme` 保持 `Image[]`（主题是开放字符串，过滤结果可以为空）。链式构建器不可变、复用既有纯函数，`query.ts` 仍无 runtime import。

`.legacy()` 直接返回 `url1|url2` 风格拼接串，语义与 legacy 产物一致：按展示顺序 `join("|")`，无图片返回空串。CLI 的 `buildIndex` 增加无断言的 `toImages` 非空守卫适配 readonly tuple。`images.schema.json` 重新生成：`minItems + items` 等价改写为 `prefixItems + items`（另带 `readOnly: true` 注解，非断言关键字），三份数据 JSON 字节不变。

**Verification** — `pnpm run typecheck` PASS（含既有「parse 返回类型 ≡ ImageIndex」类型测试）；`pnpm test` PASS（6 files / 32 tests，新增链式行为、缺失实体、构建器不可变与类型断言）；`pnpm run build` PASS（7 artifacts / 203 entities，数据 JSON 与基线一致）；`pnpm run build:check` PASS；`pnpm run dist:sdk` PASS；`git diff --check` PASS；`images.schema.json` 与重建产物一致且约束等价（Ajv 校验通过）。

**Journey log** — 1. Zod 4 的 `z.tuple(items, rest)` 第二个参数是元素 schema 本身，`[]` 由 tuple 自动补全；沿用 Zod 3 的「最后一项传数组」习惯会推导出 `[...][][]` 的嵌套数组类型（`z.tuple([ImageSchema], z.array(ImageSchema))` → rest 为 `Image[][]`）。2. `z.array().min(1)` 只校验不改变推导类型（`min()` 返回 `this`）；非空元组必须由 tuple schema 表达，才能保持「Zod 推导结果与 TypeScript 类型一致」的既有契约。3. `.readonly()` 只影响类型，但 Zod v4 原生生成器会在 JSON Schema 中额外输出 `readOnly: true` 注解——非断言关键字，不影响任何文档的接受集，落在等价改写边界内。4. 链式 `.first()` 与 `firstImage` 的可空性差异是刻意的：实体名是开放字符串、schema 保证不了存在性，只有「持有 Entity」的路径才是 total。

## [S1] Problem

查询层只有数据优先的纯函数，消费方常见的「取实体 → 取图片 → 取第一张」需要嵌套书写（`firstImage(getEntity(index, name))`），`imagesForTheme(index, name, theme)` 三参数重复传 index；旧客户端所需的 `url1|url2` 拼接串没有任何现成入口，只能手工 `map().join("|")`。

另一方面，`Entity.images` 的类型是 `Image[]`，与 schema 的 `minItems: 1` 保证脱节：`firstImage` 被迫返回 `Image | undefined`，消费方明明持有已校验的实体，却要到处处理不可能出现的不存在情况。类型没有表达 schema 已经做出的结构性保证。

## [S2] Design

### 非空 readonly 元组

`EntitySchema.images` 改为 `z.tuple([ImageSchema], ImageSchema).readonly()`：运行时语义与 `min(1)` 等价（至少一张），推导类型为 `readonly [Image, ...Image[]]`。公共 `Entity.images` 同步收窄；「`ImageIndexSchema.parse` 返回类型 ≡ `ImageIndex`」的既有类型测试继续约束二者同步，不引入断言。`firstImage(entity)` 返回 `Image`，`getImages(entity)` 返回 `readonly [Image, ...Image[]]`。这是 schema 校验本身作出的结构性保证，与「实体名/主题保持开放字符串」的动态契约不冲突——开放的是名字，非空是结构。

### 链式查询构建器

`query(index)` 返回不可变的 `ImageQuery` 构建器：`.entity(name)` 选择实体、`.theme(theme)` 过滤主题（均为开放字符串），`.all()` 返回当前筛选下全部图片、`.first()` 返回第一张、`.legacy()` 返回 `url1|url2` 拼接串。每一步返回新实例，可复用；内部复用 `getEntity`/`imagesForTheme` 纯函数，`query.ts` 保持零 runtime import。链式路径基于开放实体名：实体不存在时 `.all()` 返回 `[]`、`.first()` 返回 `undefined`、`.legacy()` 返回 `""`，与 `buildLegacySectMaps` 对无地图宗门写空串的 legacy 语义一致。

### CLI 适配

`buildIndex` 用 `toImages` 非空守卫（`const [first, ...rest] = images; if (first === undefined) throw ...`，无类型断言）把局部 `RuntimeImage[]` 收敛为非空元组；空实体在构建时提前报出清晰错误。

### 产物边界

`images.schema.json` 由 Zod v4 原生生成器改写为 `prefixItems + items` 等价形式并附带 `readOnly` 注解：接受集不变（首元素必须匹配即至少一张），保留 `$schema`、`$id`、title 与全部约束；`images.json`、`portraits.json`、`sect-maps.json` 字节不变。

## [S3] Out of Scope

- 不把实体名或主题做成发布快照联合；查询参数继续接受开放字符串。
- 不给数据对象附加方法（`index.key(...)` 不可行）；链必须从 `query(index)` 入口开始。
- 不做 data-last 柯里化或管道风格 API；现有四个纯函数保持原语义。
- `.legacy()` 不做 legacy section 映射或 `charPortraits` 合并（那是构建期 `artifacts.ts` 的职责）。
- 不改变 `images.json` 数据内容、图片排序或 `v2 -> main` 晋级语义。

## Tasks

- [x] T1: schema 改为非空 readonly 元组并同步公共类型 — acceptance: 既有「parse 返回 ≡ ImageIndex」类型测试通过；`Entity.images` 可安全索引、`firstImage` 返回 `Image` (covers: S2 非空 readonly 元组)
- [x] T2: 实现链式查询构建器 — acceptance: `entity/theme/all/first/legacy` 语义与既有纯函数一致；构建器不可变；`query.ts` 仍零 runtime import (covers: S2 链式查询构建器; depends: T1)
- [x] T3: CLI 适配 readonly tuple — acceptance: `buildIndex` 经 `toImages` 守卫产出非空元组且无类型断言；typecheck 通过 (covers: S2 CLI 适配; depends: T1)
- [x] T4: 补充行为与类型测试 — acceptance: 链式行为、缺失实体、构建器不可变、非空元组与构建器类型断言全部通过 (covers: S2 链式查询构建器、S2 非空 readonly 元组; depends: T2)
- [x] T5: 更新文档与产物并完成全量验证 — acceptance: `docs/sdk.md` 展示链式用法与语义说明；`images.schema.json` 重新生成且约束等价、数据 JSON 字节不变；测试/typecheck/build/build:check/dist:sdk 全部通过 (covers: S2 产物边界; depends: T2, T3, T4)

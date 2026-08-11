---
feature: legacy-build
status: delivered
updated: 2026-08-11
branch: v2
commits: c2a852e..c3e91c7
---

# Legacy Build

## Report

**What was built** — `scripts/build_images.py` 现在与 `images.json` 同一管线**总是**生成两份 legacy 格式产物：`portraits.json`（五分区：charPortraits/charPortraitsFemale/specialPortraits/weddingPortraits/TarotPortraits；固定池 default/female/special 映射前三分区，主题池 wedding/tarot 映射后两分区，其中 charPortraits = default 池 ∪ 主题池，婚纱/塔罗立绘同时保留在默认立绘中与旧格式行为一致；comment 丢弃、键按实体名升序）与 `sect-maps.json`（按 `玄天界` / `九天仙界` 分组，无图宗门保留空字符串占位）。`--check` 模式与 CI 漂移检查/自动提交均纳入两个新文件——action 在 push/workflow_dispatch 时把四份产物一起同步提交到 v2 和 main 两个分支；`docs/compose/spec/images-build.md` 受影响段落同步修订。

**Verification** — `uv run python scripts/build_images.py` PASS；`--check` 一致退出 0 PASS；产物断言 PASS（五分区键数 179/35/104/12/20；charPortraits 179 键 320 URL；sect-maps 包含 2 个世界、48 个宗门，其中 24 个有图宗门 URL 与 TOML 一致、24 个无图宗门保留空字符串占位）；完整单元测试通过。

**Journey log** — 1. 世界分组信息在 TOML 迁移时未被建模；为恢复旧客户端契约，现阶段由 `LEGACY_SECT_GROUPS` 临时集中维护类别与空图占位，后续可迁移为独立配置或 TOML 字段；2. 玖柒的婚纱 URL 早在 0f4e597 就被她的塔罗 URL 顶掉（旧 portraits.json 里根本没有），legacy build 从 wedding.toml 取回后婚纱/塔罗各归其位，旧文件 URL 级核对才能证明"无丢失"；3. 产物生成顺序影响警告打印时机——legacy 主题池告警只能在 build 后产生，warning 打印统一后移到全部构建之后；4. 初次交付后核对发现 charPortraits 少 33 个婚纱/塔罗 URL（319→286），旧格式消费者依赖默认立绘里的可切换立绘，用户要求"319 一个不能少"——修复为 charPortraits = default ∪ 主题池（主题立绘与默认立绘并存），实现时注意固定池须排在主题池之前处理、仅主题池并入 charPortraits（否则 female/special 会泄漏进来）。
## [S1] Problem

消费者过渡期仍读取旧格式的 `portraits.json` 与 `sect-maps.json`（`|` 分隔 URL、`charPortraits/charPortraitsFemale/specialPortraits/weddingPortraits/TarotPortraits` 五分区；sect-maps 按世界分组），但这两份文件是手工维护的，与 TOML 源不一致：

- 旧格式消费者依赖 `charPortraits` 中的可切换立绘（含婚纱/塔罗），而 `weddingPortraits`/`TarotPortraits` 分区长期为空——主题立绘只在 TOML 主题池中有归属，legacy 文件之间口径不一；
- 数据更新要手工同步两份文件，容易漂移。

需要 build 从 TOML 源直接生成 legacy 格式产物，保证与 `images.json` 同一数据源、同一确定性序列化，且 `charPortraits` 保持旧格式行为（默认立绘含全部可切换立绘，一个 URL 都不少）。

## [S2] Design

### 输出与生成方式

`scripts/build_images.py` 在构建时**总是**生成两份 legacy 产物（与 images.json 同一管线）：

- `portraits.json` — 旧格式人物立绘；
- `sect-maps.json` — 旧格式宗门地图。

`--check` 模式同样漂移检查这两个文件；CI 漂移检查与自动提交纳入（与 images.json 一致）。序列化复用现有规则：`ensure_ascii=False`、`indent=2`、末尾换行。

### portraits.json 池映射

| TOML 池 | legacy 分区 |
|---|---|
| character 固定池 `default` | `charPortraits` |
| character 固定池 `female` | `charPortraitsFemale` |
| character 固定池 `special` | `specialPortraits` |
| 主题池 `wedding` | `weddingPortraits` |
| 主题池 `tarot` | `TarotPortraits` |

- 每个分区值为 `实体名 → "url1\|url2"`，comment 在 legacy 格式中丢弃；
- 五个分区始终输出（无内容时为空对象 `{}`）；
- `charPortraits` = default 池 ∪ 主题池（wedding/tarot）：主题立绘既写入各自分区，也按 `default 在前、主题池在后的顺序` 并入对应实体的默认立绘，保证旧格式消费者可切换立绘一个不少（旧文件 319 个 URL 全保留，另恢复玖柒婚纱图 1 个）；
- 其他主题池（当前不存在）无对应分区，告警跳过，不并入 `charPortraits`；
- 键按实体名升序（与 images.json 排序约定一致，保证确定性）。

### sect-maps.json 世界分组输出

为兼容旧客户端，顶层固定为 `玄天界` 与 `九天仙界`，组内为 `宗门名 → "url1\|url2"`。世界与宗门名单暂由 `LEGACY_SECT_GROUPS` 集中维护；有 TOML 源的宗门写入地图 URL，无 TOML 源的宗门保留空字符串占位。若新增有图宗门未配置类别，构建直接失败，避免生成物静默丢失数据。

### 数据流

```
data/character/*.toml ─┐
data/sect/*.toml ──────┤→ collect_sources → build_legacy_portraits → portraits.json
data/themes/*.toml ────┘                → build_legacy_sect_maps  → sect-maps.json
                                        → build_document         → images.json
```

legacy 产物不做 schema 校验（旧格式无 schema 契约，源数据已在 TOML 校验层保证合法性）。

## [S3] Out of Scope

- sect-maps 世界分组从独立配置或 TOML 字段动态生成（当前临时硬编码）。
- `portrait-drawers.json`、`notice.json` 的生成——仍手工维护。
- legacy 格式中 comment 的表达。

## Tasks

- [x] T1: build_images.py 生成 portraits.json（池映射 + 五分区 + 键排序 + comment 丢弃） — acceptance: 产物通过 JSON 解析；charPortraits 179 键 320 URL，旧文件 319 个 URL 全部保留（缺失 0 个）且含 wedding/tarot 立绘（并存）；weddingPortraits 12 键、TarotPortraits 20 键；charPortraitsFemale 35、specialPortraits 104；键升序；--check 漂移退出 1 / 一致退出 0 (covers: S2)
- [x] T2: build_images.py 生成 sect-maps.json（按世界分组、无图宗门保留占位） — acceptance: URL 与 data/sect TOML 一致；未分类有图宗门构建失败；--check 覆盖 (covers: S2)
- [x] T3: 更新 .github/workflows/build-images.yml（drift 检查 + 自动提交纳入 portraits.json/sect-maps.json） — acceptance: actionlint 零告警；drift 步骤与 S2 一致 (covers: S2)
- [x] T4: 更新 docs/compose/spec/images-build.md 受影响段落（legacy 文件"保持不变"表述、目录树、workflow 步骤） — acceptance: 文档与新的生成行为一致 (covers: S2)

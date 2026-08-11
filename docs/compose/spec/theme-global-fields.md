---
feature: theme-global-fields
status: delivered
updated: 2026-08-11
branch: v2
commits: eddf77b..27c90ec
---

# Theme Global Fields

## Report

**What was built** — 主题 TOML 根级新增 `tags` 字段，根级 `comment` 从纯维护元数据变为图片缺省说明。合并语义：comment 图片级优先、缺省回退根级；tags 未声明时回退根级、显式 `tags = []` 退出全局、非空时与根级取并集去重（根级在前）。`SourceImage.tags` 改为 `OptionalTags`（`None` 区分未声明与空列表），schema 由 models 自动再生成。wedding.toml 迁移到根级字段：12 张图片获得 `["WIKI-2026-W32"]`，绯月、百铃保留显式 `tags = []` 不带 WIKI 标签。

**Verification** — `uv run tombi format --check --offline` 通过（205 份 TOML）；`uv run python scripts/build_images.py --check` 通过（203 个实体，产物最新）；`uv run python -m unittest discover -s tests` 12 项全部通过；images.json 中 14 张 wedding 图片 comment 均为"婚纱"，12 张含 `["WIKI-2026-W32"]`，绯月、百铃为 `[]`。

**Journey log** — 1. 根级 `comment` 原本只是 schema 中闲置的元数据，本次复用它作为图片缺省值，未新增字段；2. 需求中途补充"绯月、百铃不加 WIKI 标签"，推动 `SourceImage.tags` 引入 `None` 哨兵区分"未声明"与"显式空列表"，三源 schema 的 tags 因此出现 `default: null` 的良性变更；3. spec 的 T1 任务行在 amendment 时残留旧措辞（"计入 tags"），由 reviewer 指出后修正，与 acceptance 一致。

## [S1] Problem

wedding 主题的每张图片都重复写 `comment = "婚纱"` 和 `tags = ["WIKI-2026-W32"]`。同一主题的图片共享这些元数据，应允许在 TOML 根级声明一次，由构建脚本应用到该主题的所有图片。

## [S2] Design

### 根级字段

`ThemeSource`（`scripts/images/models.py`）的根级字段：

- `tags: list[Tag]`：新增，主题全局标签，非空字符串、唯一。
- `comment`：已有根级字段，从纯维护元数据变为图片缺省说明。
- `description` 不变，仍是纯维护说明。

### 合并语义（已确认）

对主题内每张图片：

- `comment`：图片有 comment 时保留图片值；否则回退到根级 comment。
- `tags`：图片未声明 tags 时使用根级 tags；显式声明 `tags = []` 则不使用根级 tags（退出全局）；声明非空 tags 时与根级取并集去重，根级在前。

合并在构建时完成，源 TOML 保持原样；去重发生在校验之前，跨层重复不报错。

### 实现

- `models.py`：`SourceImage.resolve(comment=..., tags=...)` 返回合并后的新 `SourceImage`；`ThemeSource.require_content` 不把根级 `tags` 视为内容，仅含 tags 无 characters 的主题仍报错。
- `catalog.py`：主题加载循环对 `character["images"]` 逐张应用 `resolve`。
- schema 由 models 自动生成，不需要手工修改。
- `portraits.json` / `sect-maps.json` 只含 URL，不受影响。

### 数据迁移与文档

- `data/themes/wedding.toml` 迁移：根级 `comment = "婚纱"`、`tags = ["WIKI-2026-W32"]`，删除每张图片的重复字段；绯月、百铃保留显式 `tags = []` 以不使用全局 tags。
- 重新生成 `images.json`：其余 12 张 wedding 图片输出 `comment = "婚纱"`、`tags = ["WIKI-2026-W32"]`，绯月、百铃输出 `comment = "婚纱"`、无 tags。
- README「新增主题」补充根级字段用法。

## [S3] Out of Scope

- 主题内 character 级（`[characters."X"]` 子表）全局字段。
- 人物、宗门文件的全局字段。
- tags 词表校验（README 已声明不做）。

## Tasks

- [x] T1: `ThemeSource` 增加根级 `tags` 字段，`require_content` 不把 tags 计入内容 — acceptance: 生成的 theme.schema.json 出现根级 tags；仅含 tags 无 characters 的主题校验失败 (covers: S2)
- [x] T2: `SourceImage.resolve` 实现 comment 回退与 tags 合并（未声明回退根级、显式空列表退出、非空并集去重根级在前），catalog 主题循环应用 — acceptance: 单测覆盖图片 comment 覆盖根级、tags 并集去重、根级 tags 在前、显式 `tags = []` 不使用根级四种行为 (covers: S2; depends: T1)
- [x] T3: wedding.toml 迁移 + README 更新 + 重新生成产物 — acceptance: 14 张 wedding 图片全部获得根级 comment；除绯月、百铃（显式 `tags = []`，输出无 tags）外 12 张含 `["WIKI-2026-W32"]`；`--check` 通过 (covers: S2; depends: T2)

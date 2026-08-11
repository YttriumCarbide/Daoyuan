---
feature: theme-global-fields
status: in-progress
updated: 2026-08-11
branch: v2
---

# Theme Global Fields

## Report

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
- `tags`：根级 tags 与图片 tags 取并集去重，根级 tags 在前。

合并在构建时完成，源 TOML 保持原样；去重发生在校验之前，跨层重复不报错。

### 实现

- `models.py`：`SourceImage.resolve(comment=..., tags=...)` 返回合并后的新 `SourceImage`；`ThemeSource.require_content` 不把根级 `tags` 视为内容，仅含 tags 无 characters 的主题仍报错。
- `catalog.py`：主题加载循环对 `character["images"]` 逐张应用 `resolve`。
- schema 由 models 自动生成，不需要手工修改。
- `portraits.json` / `sect-maps.json` 只含 URL，不受影响。

### 数据迁移与文档

- `data/themes/wedding.toml` 迁移：根级 `comment = "婚纱"`、`tags = ["WIKI-2026-W32"]`，删除每张图片的重复字段。
- 重新生成 `images.json`：wedding 图片输出应与迁移前（逐图声明版）完全一致，即 `comment = "婚纱"`、`tags = ["WIKI-2026-W32"]`。
- README「新增主题」补充根级字段用法。

## [S3] Out of Scope

- 主题内 character 级（`[characters."X"]` 子表）全局字段。
- 人物、宗门文件的全局字段。
- tags 词表校验（README 已声明不做）。

## Tasks

- [ ] T1: `ThemeSource` 增加根级 `tags` 字段，`require_content` 计入 tags — acceptance: 生成的 theme.schema.json 出现根级 tags；仅含 tags 无 characters 的主题校验失败 (covers: S2)
- [ ] T2: `SourceImage.resolve` 实现 comment 回退与 tags 并集去重，catalog 主题循环应用 — acceptance: 单测覆盖图片 comment 覆盖根级、tags 并集去重、根级 tags 在前三种行为 (covers: S2; depends: T1)
- [ ] T3: wedding.toml 迁移 + README 更新 + 重新生成产物 — acceptance: 13 张 wedding 图片全部获得根级 comment/tags；与迁移前逐图声明版相比，仅此前遗漏 tags 的绯月、百铃两张新增 tags，其余不变；`--check` 通过 (covers: S2; depends: T2)

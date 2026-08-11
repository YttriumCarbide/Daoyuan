---
feature: images-build
status: delivered
updated: 2026-08-11
branch: v2
commits: 1977b9c..1b11e24
---

# Images Build Pipeline

## Report

**What was built** — `data/` 中的 TOML 是唯一数据源。Pydantic 类型同时驱动运行时校验和 Draft 2020-12 JSON Schema；构建器生成 `images.json`、三份 TOML schema、`images.schema.json` 和两份 legacy 兼容产物。

**Verification** — 全量 205 份 TOML 通过 Taplo 与 Pydantic 校验；203 个实体构建成功；产物幂等；源 schema 不包含 `oneOf` / `anyOf` 结构分流。

**Journey log** — 1. 源图片统一为 `SourceImage` 对象数组，不保留字符串简写；2. 人物、宗门、主题分别使用独立 schema；3. legacy 文件只是从 typed catalog 生成的边界适配器。

## [S1] Problem

图片数据需要在友好的 TOML 维护格式、结构化 `images.json` 与旧客户端格式之间保持一致，同时为 VS Code/Taplo 提供可定位到具体字段的错误。

## [S2] Design

### Authority

- `scripts/images/models.py` 是唯一契约来源。
- `CharacterSource`、`SectSource`、`ThemeSource` 描述三类 TOML；`ImageIndex` 描述最终 JSON。
- 每个图片池是非空 `list[SourceImage]`；`url` 必填，`comment` 和 `tags` 可选。
- 生成 schema 是可替换产物，不手工维护。

### Modules

```text
TOML -> models.py -> catalog.py -> artifacts.py -> JSON / JSON Schema
                                      └---------> legacy adapters
```

- `catalog.py` 负责读取、文件名校验、重复 URL、重复池与实体类型冲突。
- `artifacts.py` 负责确定性排序、现代产物、legacy 适配、schema 和文件漂移检查。
- `build_images.py` 只保留 CLI 参数、输出和退出码。

### Ordering and compatibility

- 实体按名称排序。
- 人物图片依次为 `default`、`female`、`special`、按文件名排序的主题；宗门为 `map`。
- `portraits.json` 和 `sect-maps.json` 保持旧消费者契约，但不进入核心类型。
- `--check` 不写文件，任一产物缺失或过期时返回 1。

## [S3] Out of Scope

- URL 可达性和图片内容检查。
- 移除仍有消费者的 legacy JSON 产物。
- 为 tag 定义业务词表。

## Tasks

- [x] T1: 建立 Pydantic 权威契约并生成四份 schema (covers: S2)
- [x] T2: 建立 typed catalog 与跨文件语义校验 (covers: S2; depends: T1)
- [x] T3: 生成现代与 legacy 产物，并支持漂移检查 (covers: S2; depends: T2)
- [x] T4: 配置 VS Code/Taplo 独立 schema 关联与 CI 验证 (covers: S2; depends: T3)

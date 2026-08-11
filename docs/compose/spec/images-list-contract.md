---
feature: images-list-contract
status: delivered
updated: 2026-08-11
branch: v2
commits: ee89ba7..e0e8568
---

# Images List Contract

## Report

**What was built** — `images.json` 已升级为 `schemaVersion: 2`：每个实体的 `images` 是稳定的 `Image[]`，每张图片必须携带非空开放字符串 `theme` 与 `tags: string[]`，`comment` 保持可选。图片分类名称保持不变，宗门地图使用 `map`；203 个实体、483 张图片从 v1 机械拍平后实体、类型、URL 与顺序完全一致。

TOML 继续按现有池与主题文件维护，图片统一为 `{ url, comment?, tags? }` 对象数组。Pydantic 类型同时描述 TOML 与最终 JSON，并转换出四份独立 Draft 2020-12 schema；生成 schema 不是权威来源。README 已同步新契约，两份 legacy 产物保持字节不变。

**Verification** — `uv sync --frozen` PASS；`uv run python -m unittest discover -s tests -v` PASS（8 tests）；`uv run python scripts/build_images.py` PASS（203 entities）；`uv run python scripts/build_images.py --check` PASS；205 个 TOML 文件通过各自的 Pydantic 生成 schema 校验；类型转换产物与已提交 schema 一致；全量 `images.json` 通过 `ImagesDocument` 校验；`git diff --check` PASS。

**Journey log** — 1. 只扁平化消费产物即可获得稳定 API，同时保留按角色/跨角色主题维护 TOML 的便利；2. theme 直接使用源分类名，避免维护额外的名称映射；3. 源 schema 与产物 schema 可以复用定义，但内容不同就不能共享 canonical `$id`；4. 破坏性结构迁移用 v1 池逐项机械拍平核对，证明 483 张图片无丢失、无重排。

## [S1] Problem

`images.json` 当前把 theme 作为 `entities[*].images` 的动态属性名。每新增一个主题都会改变对象结构并要求生成 schema 动态展开属性，消费者也必须先遍历分组再读取图片，不利于统一筛选和后续元数据扩展。

## [S2] Design

### 产物契约

`images.json` 升级为 `schemaVersion: 2`。实体索引与 `type` 保持不变，`entities[*].images` 改为非空 `Image` 数组：

```json
{
  "schemaVersion": 2,
  "data": {
    "entities": {
      "瑶汐": {
        "type": "character",
        "images": [
          {
            "url": "https://example.com/default.png",
            "theme": "default",
            "tags": []
          }
        ]
      }
    }
  }
}
```

每个 `Image`：

- 必须包含合法 HTTPS `url`、非空且无首尾空白的 `theme`、`tags` 字符串数组；`comment` 保持可选。
- `tags` 允许空数组；每个值必须非空、无首尾空白且数组内唯一。
- `theme` 是开放字符串而非 enum，以便新增主题时不改变 schema shape。
- 人物 `default` / `female` / `special` 及主题文件名原样作为 theme；宗门地图使用 `map`。
- 图片顺序保持现有语义：人物依次为 `default`、`female`、`special`，之后按主题文件名排序；每个 theme 内保持 TOML 书写顺序。宗门为 `map`。

根路径 `images.schema.json` 改为稳定的 v2 产物 schema，不再按主题文件动态生成 `characterImages.properties`。schema 拒绝旧的 theme-keyed 对象、空 theme、非数组 tags 和未知 Image 字段。

### 数据源与兼容边界

TOML 继续按现有池/主题文件组织，不进行全量扁平化迁移。每个池统一为 `SourceImage` 对象数组：`url` 必填，`comment` 和 `tags` 可选。schema 将输入图片与最终图片拆为独立定义，theme 仍由图片所在分类或主题文件名生成。

`portraits.json` 与 `sect-maps.json` 的格式、内容和 legacy 分区命名保持不变；legacy 构建忽略 `tags` 与 `comment`。README 更新图片结构、theme 和 tags 写法。

## [S3] Out of Scope

- 不把全部 TOML 数据源改写成扁平 Image 数组。
- 不移除 legacy 产物或修改其分区名称。
- 不限制 theme 为固定枚举，不定义 tags 的业务词表。
- 不修改实体索引、实体类型或 URL 可达性校验。

## Tasks

- [x] T1: 为 v2 契约补充构建与 schema 回归测试 — acceptance: 测试证明产物为 Image 数组、theme 保持源分类名、tags 默认/透传正确，并拒绝空 theme 与非法 tags (covers: S2)
- [x] T2: 重构静态 schema 与构建器，生成稳定的 v2 `images.json` / `images.schema.json`，保持 legacy 输出不变 — acceptance: 全量构建成功；新产物通过 v2 schema；构建前后 portraits.json 与 sect-maps.json 字节不变 (covers: S2; depends: T1)
- [x] T3: 更新 README 与生成产物并完成全量验证 — acceptance: README 示例与 v2 契约一致；单元测试、构建、漂移检查和 schema meta-validation 全部通过 (covers: S2; depends: T2)

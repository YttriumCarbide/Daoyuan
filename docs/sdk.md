# daoyuan-images SDK

本仓库同时发布一个 npm 包 `daoyuan-images`，可直接经 GitHub 链接安装，无需发布到 npm registry：

```bash
npm install github:YttriumCarbide/Daoyuan#main
```

> 用 pnpm 11 安装 git 依赖时，默认禁止运行其 `prepare` 构建脚本，需要先在消费方批准该依赖的构建（`pnpm approve-builds` 或在 `allowBuilds` 中允许对应 git 依赖），否则会因未产出 `dist/` 而安装失败。

SDK 先按职责分为纯类型、纯查询和运行时校验三层，再映射为公开入口：

| 入口 | 内容 | 加载 Zod |
|---|---|---|
| `daoyuan-images` | 完整公共门面 | 是 |
| `daoyuan-images/query` | `query`、`getEntity`、`getImages`、`imagesForTheme`、`firstImage` | 否 |
| `daoyuan-images/schema` | `parseImages`、`ImageIndexSchema`、`SCHEMA_VERSION` | 是 |
| `daoyuan-images/types` | `Image`、`Entity`、`EntityKind`、`ImageIndex` | 否 |

SDK 面向从 URL 动态加载的 `images.json`，因此实体名和主题保持开放字符串，与远程数据独立更新的语义一致：

```ts
import { parseImages, query } from "daoyuan-images";

const response = await fetch(
  "https://raw.githubusercontent.com/YttriumCarbide/Daoyuan/main/images.json",
);
if (!response.ok) throw new Error(`加载 images.json 失败：${response.status}`);

const index = parseImages(await response.json());
const first = query(index).entity("白薇").first(); // 第一张立绘
const wedding = query(index).entity("白薇").theme("wedding").all(); // 指定主题的全部
const legacy = query(index).entity("白薇").theme("default").legacy(); // "url1|url2" 拼接串
```

`parseImages` 会严格校验文档结构和字段格式，但不会把实体名或主题限制为安装 SDK 时的数据快照。

如果数据已在其他边界完成校验（例如启动时用 `parseImages` 校验一次并缓存），后续只读取已校验的数据时，可以只加载无运行时依赖的查询层：

```ts
import { query } from "daoyuan-images/query";
import type { ImageIndex } from "daoyuan-images/types";

// indexJson 是校验边界持久化的结果（parseImages 校验后序列化保存），此处只查询
const index = JSON.parse(indexJson) as ImageIndex;

query(index).entity("白薇").first(); // 第一张图片
query(index).entity("白薇").all(); // 全部图片
query(index).entity("白薇").theme("default").all(); // 指定主题
query(index).entity("白薇").theme("default").first(); // 主题下的第一张
query(index).entity("白薇").theme("default").legacy(); // "url1|url2" legacy 拼接串
```

链式查询说明：

- `.entity()` 选择实体、`.theme()` 过滤主题，两者都是开放字符串；每一步都返回新构建器，可以复用；
- 持有 `Entity` 时 `firstImage(entity)` 稳定返回 `Image`：schema 保证每个实体的 `images` 至少一张（类型为 `readonly [Image, ...Image[]]`）；
- 链式查询基于开放实体名，实体不存在时 `.all()` 返回 `[]`、`.first()` 返回 `undefined`、`.legacy()` 返回 `""`；
- `.legacy()` 与 `portraits.json`、`sect-maps.json` 中的 `url1|url2` 格式一致：按展示顺序拼接，`|` 不会出现在单条 url 中。

发布包只包含 `dist/sdk`，生产依赖只有 Zod。TOML 解析、JSON/JSON Schema 生成与 legacy 适配位于内部 `src/cli`，只供本仓库的开发和 CI 使用，不会进入安装包。

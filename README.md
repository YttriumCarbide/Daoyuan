# Daoyuan · 道渊图片数据仓库

本仓库维护道渊的图片集。

日常维护只需要修改 `v2` 分支中 `data/` 目录下的 TOML 文件并推送。CI 会自动格式化、构建和测试，通过后将同一个提交晋级到 `main`。脚本会生成：

- `images.json`：人物和宗门的图片数据；
- `images.schema.json`：用于校验 `images.json`；
- `portraits.json`、`sect-maps.json`：供现有客户端使用的兼容文件。

`notice.json` 是手工维护的游戏公告，不由构建脚本修改。

## 快速开始

项目使用 [npm](https://www.npmjs.com/) 管理 TypeScript 环境，要求 Node `>=20`（CI 固定使用 Node 24）。

```bash
npm ci
npx pre-commit install   # 可选；pre-commit 需单独安装（pipx / Homebrew）
npm run build
```

`pre-commit` 只需安装一次。之后提交 `data/` 下的 TOML 时，Tombi 会先自动格式化；如果文件被修改，请重新 `git add` 后再次提交。

本地构建便于提交前预览结果，但不要求人工提交重新生成的 JSON；推送 `v2` 后，CI 会自动补齐格式化和生成产物提交。

## 图片写法

每张图片都是一个表：`url` 必填，`comment` 和 `tags` 可选。

```toml
[[images.default]]
url = "https://example.com/default.png"

[[images.special]]
url = "https://example.com/special.png"
comment = "活动立绘"
tags = ["event", "portrait"]
```

规则：

- URL 必须以 `https://` 开头；
- 同一分类中不能出现重复 URL；
- 图片顺序就是展示优先级，第一张优先；
- `comment` 和 `tags` 都可以省略；
- tags 中的值必须是非空字符串，同一张图片不能有重复标签。

### 完整参考示例

[`data/character/白薇.toml`](data/character/白薇.toml) 是人物图片配置的示例，可作为新增或整理人物数据时的参考。它展示了 schema 声明、TOML 注释、同一分类下的多张图片，以及 `comment`、`tags` 等可选字段的写法。

白薇文件中的字段用于展示不同配置方式，目前版本没有限制 tags 类型，后续再考虑是否强制词条类型验证。

## 新增人物

创建 `data/character/<人物名>.toml`。文件名就是人物名：

```toml
#:schema ../../schema/character.schema.json

[images]
default = [
  { url = "https://example.com/default.png" },
]
female = [
  { url = "https://example.com/female.png" },
]
special = [
  { url = "https://example.com/special.png", comment = "心动立绘" },
]
```

人物支持三个固定分类：

- `default`：默认立绘；
- `female`：性转立绘；
- `special`：心动立绘。

没有图片的分类可以不写。

## 新增宗门

创建 `data/sect/<宗门名>.toml`：

```toml
#:schema ../../schema/sect.schema.json

[images]
map = [
  { url = "https://example.com/map.png" },
]
```

宗门目前只支持 `map`。没有地图的宗门不需要创建文件。

## 新增主题

主题用于给多个人物添加同一类图片。创建 `data/themes/<主题名>.toml`，文件名就是最终写入图片的 `theme`。

例如 `data/themes/tarot.toml`：

```toml
#:schema ../../schema/theme.schema.json

description = "塔罗主题立绘"
comment = "塔罗牌"
tags = ["tarot"]

[characters."瑶汐"]
images = [
  { url = "https://example.com/tarot-1.png" },
  { url = "https://example.com/tarot-2.png", comment = "魔术师", tags = ["card"] },
]

[characters."叶焚渊"]
images = [
  { url = "https://example.com/tarot-3.png" },
]
```

注意：

- 主题名不能使用 `default`、`female` 或 `special`；
- 中文人物名需要加引号，例如 `[characters."瑶汐"]`；
- `description` 是可选的维护说明；
- 根级 `comment` 和 `tags` 是全局默认：主题内每张图片缺省使用该 `comment`；图片未声明 `tags` 时使用根级 `tags`，显式声明 `tags = []` 则不使用根级 `tags`，声明非空 `tags` 时与根级取并集（根级在前）。上例中 `tarot-1.png` 输出 `comment = "塔罗牌"`、`tags = ["tarot"]`，`tarot-2.png` 输出 `comment = "魔术师"`、`tags = ["tarot", "card"]`；
- 一个主题文件可以包含多个人物，一个人物也可以出现在多个主题中。

主题会自动写入 `images.json`。如果 `portraits.json` 也需要这个主题，请在 `src/artifacts.ts` 中补充对应分区：

```ts
const LEGACY_SECTIONS: Record<string, string> = {
  // ...
  mytheme: "MyThemePortraits",
};

const LEGACY_THEME_ORDER = ["wedding", "tarot", "mytheme"];
```

## images.json

文件按人物名或宗门名保存数据，每个实体都有一个图片数组：

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
            "tags": [],
            "comment": "可选说明"
          }
        ]
      }
    }
  }
}
```

图片字段：

| 字段 | 是否必填 | 说明 |
|---|---|---|
| `url` | 是 | 图片地址 |
| `theme` | 是 | 图片分类，例如 `default`、`female`、`special`、`wedding`、`tarot` 或 `map` |
| `tags` | 是 | 标签数组，没有标签时为 `[]` |
| `comment` | 否 | 图片说明 |

人物图片按 `default`、`female`、`special`、主题文件名的顺序生成；同一 theme 内保持 TOML 中的书写顺序。

## 构建与检查

```bash
# 格式化所有 TOML 数据源
npx tombi format --offline

# 只检查 TOML 格式，不修改文件
npx tombi format --check --offline

# 校验 TOML 并生成所有 JSON 文件
npm run build

# 只检查已提交的 JSON 是否需要更新
npm run build:check

# 运行测试
npm test

# 类型检查
npm run typecheck
```

`src/schema.ts` 中的 Zod 类型是数据契约的唯一来源。构建命令先把 Zod schema 推导为 TypeScript 类型，再由这些类型（经 `zod-to-json-schema`）转换为 Draft 2020-12 schema：`schema/` 下三份文件供 TOML 编辑器使用，根目录的 `images.schema.json` 用于校验最终产物。生成的 schema 不要直接编辑。

## npm 包

本仓库同时发布一个 npm 包 `daoyuan-images`，可直接经 GitHub 链接安装，无需发布到 npm registry：

```bash
npm install github:<owner>/Daoyuan#v2-ts
```

包导出：

- 类型：`Image`、`Entity`、`EntityKind`、`ImageIndex`、`SourceImage`、`CharacterSource`、`SectSource`、`ThemeSource`、`Tag`、`Name` 等（`z.infer` 推导）；
- 一个简单 image SDK：`parseImages`、`getEntity`、`getImages`、`imagesForTheme`、`firstImage`。

## 自动维护与发布

`v2` 是唯一维护分支，`main` 是客户端读取的发布分支。日常流程如下：

1. 修改并 push `v2`；
2. GitHub Actions 自动格式化 TOML、生成 JSON 并运行测试；
3. 格式或产物有变化时，机器人把变化提交到 `v2`；
4. CI 确认 `main` 没有分叉后，把同一个最终提交原子快进到 `v2` 和 `main`；
5. `main` 更新即完成发布，不额外创建 tag 或 GitHub Release。

任何格式化、构建或测试失败都会停止晋级。`main` 不向 `v2` 反向同步，也不接受日常人工提交；`notice.json` 等手工文件随 `v2` 的普通提交一起晋级，不属于生成产物。

## 编辑器支持

仓库已为 `data/character/`、`data/sect/` 和 `data/themes/` 配置 TOML schema。VS Code 推荐安装 **Tombi**，仓库设置会在保存时自动格式化，并提供字段提示和格式错误诊断。

## 目录结构

```text
.
├── data/
│   ├── character/          # 人物图片
│   ├── sect/               # 宗门地图
│   └── themes/             # 跨人物主题
├── schema/
│   ├── character.schema.json # 人物 TOML 校验规则
│   ├── sect.schema.json      # 宗门 TOML 校验规则
│   └── theme.schema.json     # 主题 TOML 校验规则
├── src/
│   ├── schema.ts           # 权威 Zod 契约 + z.infer 类型
│   ├── catalog.ts          # TOML 读取与跨文件聚合
│   ├── artifacts.ts        # 产物与 schema 生成
│   ├── run.ts              # 构建/漂移检查入口
│   ├── cli.ts              # 命令行入口
│   ├── sdk.ts              # image SDK
│   └── index.ts            # npm 包公共出口
├── tests/                  # 构建脚本测试（vitest）
├── tombi.toml              # TOML 格式化范围与规则
├── .pre-commit-config.yaml # 提交前自动格式化
├── package.json            # npm 包与脚本
├── tsconfig.json           # TypeScript 配置
├── images.json             # 图片数据
├── images.schema.json      # images.json 校验规则
├── portrait-drawers.json   # 旧客户端立绘抽屉配置
├── portraits.json          # 人物兼容文件
├── sect-maps.json          # 宗门兼容文件
└── notice.json             # 游戏公告
```

## 许可证

[MIT](LICENSE)

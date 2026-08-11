# Daoyuan · 道渊图片数据仓库

本仓库维护道渊的图片集。

日常只需要修改 `data/` 目录中的 TOML 文件，然后运行构建命令。脚本会生成：

- `images.json`：人物和宗门的图片数据；
- `images.schema.json`：用于校验 `images.json`；
- `portraits.json`、`sect-maps.json`：供现有客户端使用的兼容文件。

`notice.json` 是手工维护的游戏公告，不由构建脚本修改。

## 快速开始

项目使用 [uv](https://docs.astral.sh/uv/) 管理 Python 环境：

```bash
uv sync --frozen
uv run python scripts/build_images.py
```

修改 TOML 后，请同时提交重新生成的 JSON 文件。

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

## 新增人物

创建 `data/character/<人物名>.toml`。文件名就是人物名：

```toml
#:schema ../../schema/character.schema.json

[images]
default = [{ url = "https://example.com/default.png" }]
female = [{ url = "https://example.com/female.png" }]
special = [{ url = "https://example.com/special.png", comment = "心动立绘" }]
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
map = [{ url = "https://example.com/map.png" }]
```

宗门目前只支持 `map`。没有地图的宗门不需要创建文件。

## 新增主题

主题用于给多个人物添加同一类图片。创建 `data/themes/<主题名>.toml`，文件名就是最终写入图片的 `theme`。

例如 `data/themes/tarot.toml`：

```toml
#:schema ../../schema/theme.schema.json

description = "塔罗主题立绘"

[characters."瑶汐"]
images = [
  { url = "https://example.com/tarot-1.png" },
  { url = "https://example.com/tarot-2.png", comment = "塔罗牌·魔术师", tags = ["card"] },
]

[characters."叶焚渊"]
images = [{ url = "https://example.com/tarot-3.png" }]
```

注意：

- 主题名不能使用 `default`、`female` 或 `special`；
- 中文人物名需要加引号，例如 `[characters."瑶汐"]`；
- `description` 是可选的维护说明；
- 一个主题文件可以包含多个人物，一个人物也可以出现在多个主题中。

主题会自动写入 `images.json`。如果 `portraits.json` 也需要这个主题，请在 `scripts/build_images.py` 中补充对应分区：

```python
LEGACY_THEME_SECTIONS = {
    "wedding": "weddingPortraits",
    "tarot": "TarotPortraits",
    "mytheme": "MyThemePortraits",
}

LEGACY_PORTRAIT_SECTIONS = (
    ...,
    "MyThemePortraits",
)
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
# 校验 TOML 并生成所有 JSON 文件
uv run python scripts/build_images.py

# 只检查已提交的 JSON 是否需要更新
uv run python scripts/build_images.py --check

# 运行测试
uv run python -m unittest discover -s tests -v
```

`scripts/images/models.py` 中的 Pydantic 类型是数据契约的唯一来源。构建命令会把类型转换为 Draft 2020-12 schema：`schema/` 下三份文件供 TOML 编辑器使用，根目录的 `images.schema.json` 用于校验最终产物。生成的 schema 不要直接编辑。

## 自动构建

GitHub Actions 会在 push 或 pull request 时安装依赖并运行构建检查：

- pull request 中的 JSON 没有及时更新时，检查会失败；
- push 到 `v2` 或 `main` 后，脚本会把生成文件和 `notice.json` 同步到两个分支；
- 没有文件变化时不会创建提交。

## 编辑器支持

仓库已为 `data/character/`、`data/sect/` 和 `data/themes/` 配置 TOML schema。VS Code 推荐安装 **Even Better TOML**，即可在编辑时看到字段提示和格式错误。

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
├── scripts/
│   ├── build_images.py     # 命令行入口
│   └── images/
│       ├── models.py       # 权威 Pydantic 契约
│       ├── catalog.py      # TOML 读取与跨文件聚合
│       └── artifacts.py    # 产物与 schema 生成
├── tests/                  # 构建脚本测试
├── images.json             # 图片数据
├── images.schema.json      # images.json 校验规则
├── portraits.json          # 人物兼容文件
├── sect-maps.json          # 宗门兼容文件
└── notice.json             # 游戏公告
```

## 许可证

[MIT](LICENSE)

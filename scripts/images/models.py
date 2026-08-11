"""Pydantic 数据契约。JSON Schema 和构建器共享这一份权威定义。"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from typing import Annotated, Literal, NotRequired

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
    with_config,
)
from pydantic.json_schema import SkipJsonSchema
from typing_extensions import TypedDict

SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
SCHEMA_VERSION = 2

CHARACTER_POOLS = ("default", "female", "special")
SECT_POOL = "map"
EntityKind = Literal["character", "sect"]

URL_PATTERN = r"^https://[^\s|]+$"
TEXT_PATTERN = r"^\S(?:[\s\S]*\S)?$"
STRICT = ConfigDict(extra="forbid")

Name = Annotated[
    str,
    Field(min_length=1, max_length=100, pattern=TEXT_PATTERN),
]
Text = Annotated[
    str,
    Field(
        min_length=1,
        max_length=500,
        pattern=TEXT_PATTERN,
        description="不能为空或以空白开头、结尾。",
    ),
]
OptionalText = Text | SkipJsonSchema[None]
Tag = Annotated[
    str,
    Field(min_length=1, max_length=100, pattern=TEXT_PATTERN),
]


class Model(BaseModel):
    model_config = STRICT


def validate_unique_tags(tags: list[str]) -> list[str]:
    if len(tags) != len(set(tags)):
        raise ValueError("tags 不能包含重复值")
    return tags


class SourceImage(Model):
    """TOML 中的一张图片。"""

    url: str = Field(
        pattern=URL_PATTERN,
        description="必须以 https:// 开头，且不能包含空白或 |。",
    )
    comment: OptionalText = None
    tags: list[Tag] = Field(
        default_factory=list,
        json_schema_extra={"uniqueItems": True},
    )
    _validate_tags = field_validator("tags")(validate_unique_tags)

    def resolve(
        self,
        *,
        comment: str | None = None,
        tags: Sequence[Tag] = (),
    ) -> SourceImage:
        """应用主题根级默认值：comment 缺省回退，tags 取并集去重（根级在前）。"""
        merged_tags = list(dict.fromkeys((*tags, *self.tags)))
        return SourceImage(
            url=self.url,
            comment=self.comment if self.comment is not None else comment,
            tags=merged_tags,
        )


SourceImages = Annotated[list[SourceImage], Field(min_length=1)]


@with_config(STRICT)
class CharacterImagePools(TypedDict):
    default: NotRequired[SourceImages]
    female: NotRequired[SourceImages]
    special: NotRequired[SourceImages]


class CharacterSource(Model):
    """`data/character/<name>.toml` 的根类型。"""

    images: CharacterImagePools = Field(json_schema_extra={"minProperties": 1})

    @model_validator(mode="after")
    def require_pool(self) -> CharacterSource:
        if not self.images:
            raise ValueError("至少需要一个图片分类")
        return self

    def pools(self) -> Iterator[tuple[str, list[SourceImage]]]:
        values = (
            ("default", self.images.get("default")),
            ("female", self.images.get("female")),
            ("special", self.images.get("special")),
        )
        for pool, images in values:
            if images:
                yield pool, images


class SectSource(Model):
    """`data/sect/<name>.toml` 的根类型。"""

    images: Annotated[
        dict[Literal["map"], SourceImages],
        Field(min_length=1),
    ]


class ThemeSource(Model):
    """`data/themes/<theme>.toml` 的根类型。"""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"minProperties": 1})

    description: OptionalText = None
    comment: OptionalText = None
    tags: list[Tag] = Field(
        default_factory=list,
        json_schema_extra={"uniqueItems": True},
    )
    _validate_tags = field_validator("tags")(validate_unique_tags)
    characters: (
        Annotated[
            dict[
                Name,
                Annotated[
                    dict[Literal["images"], SourceImages],
                    Field(min_length=1),
                ],
            ],
            Field(min_length=1),
        ]
        | SkipJsonSchema[None]
    ) = None

    @model_validator(mode="after")
    def require_content(self) -> ThemeSource:
        if not (self.description or self.comment or self.characters):
            raise ValueError("至少需要 description、comment 或 characters 之一")
        return self


class Image(Model):
    """`images.json` 中的一张图片。"""

    url: str = Field(pattern=URL_PATTERN)
    theme: Name
    tags: list[Tag] = Field(json_schema_extra={"uniqueItems": True})
    comment: OptionalText = None
    _validate_tags = field_validator("tags")(validate_unique_tags)

    @classmethod
    def from_source(cls, source: SourceImage, theme: str) -> Image:
        return cls(
            url=source.url,
            theme=theme,
            tags=list(source.tags),
            comment=source.comment,
        )


@with_config(STRICT)
class Entity(TypedDict):
    type: EntityKind
    images: Annotated[list[Image], Field(min_length=1)]


class ImageIndex(Model):
    """`images.json` 的根类型。"""

    schema_version: Literal[2] = Field(default=SCHEMA_VERSION, alias="schemaVersion")
    data: Annotated[
        dict[
            Literal["entities"],
            Annotated[dict[Name, Entity], Field(min_length=1)],
        ],
        Field(min_length=1),
    ]

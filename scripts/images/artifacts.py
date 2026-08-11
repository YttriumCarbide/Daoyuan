"""从已校验的目录生成现代、legacy 和 JSON Schema 产物。"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from .catalog import BuildError, Catalog
from .models import (
    CHARACTER_POOLS,
    SCHEMA_DIALECT,
    CharacterSource,
    Entity,
    Image,
    ImageIndex,
    SectSource,
    ThemeSource,
)

LEGACY_SECTIONS = {
    "default": "charPortraits",
    "female": "charPortraitsFemale",
    "special": "specialPortraits",
    "wedding": "weddingPortraits",
    "tarot": "TarotPortraits",
}
LEGACY_THEME_ORDER = ("wedding", "tarot")
LEGACY_SECT_GROUPS: dict[str, tuple[str, ...]] = {
    "玄天界": (
        "大周仙朝",
        "南梁古国",
        "蜀山剑门",
        "昆仑道门",
        "桃花宗",
        "万法宗",
        "合欢宗",
        "天机阁",
        "星道宗",
        "湮丹宗",
        "灵墟宗",
        "青玉宗",
        "符韵门",
        "阵天宗",
        "广寒宫",
        "蛟龙一族",
        "太阳神宫",
        "尸魔宗",
        "黑金阁",
        "万魂殿",
        "神猿族",
        "九尾天狐族",
        "五色孔雀族",
        "柳蛇族",
        "大雷音寺",
        "冥煞玄蛇",
        "嗜血鬼藤",
        "残缺剑傀",
        "霜骨冰蛟",
        "亚种虚空兽",
        "蜃灵皇残魂",
        "怨念尸魔",
        "渡魂诡灵",
        "天道灾兽化身",
        "血神宫",
    ),
    "九天仙界": (
        "天庭",
        "云上瑶池",
        "阴煞宗",
        "散仙秘境",
        "地府入口",
        "太古王族",
        "极乐宗",
        "玉灵宫",
        "万妖古界",
        "先天仙灵域",
        "剑修联盟",
        "真灵世家",
        "天庭前线",
    ),
}


@dataclass(frozen=True)
class SchemaSpec:
    model: type[BaseModel]
    schema_id: str
    title: str


SCHEMAS = {
    "character": SchemaSpec(
        CharacterSource,
        "urn:daoyuan:schema:images:character:v2",
        "Daoyuan Character Image Sources",
    ),
    "sect": SchemaSpec(
        SectSource,
        "urn:daoyuan:schema:images:sect:v2",
        "Daoyuan Sect Image Sources",
    ),
    "theme": SchemaSpec(
        ThemeSource,
        "urn:daoyuan:schema:images:theme:v2",
        "Daoyuan Theme Image Sources",
    ),
    "output": SchemaSpec(
        ImageIndex,
        "urn:daoyuan:schema:images:v2",
        "Daoyuan Images",
    ),
}


@dataclass(frozen=True)
class ProjectPaths:
    root: Path

    @property
    def schemas(self) -> dict[str, Path]:
        return {
            "character": self.root / "schema" / "character.schema.json",
            "sect": self.root / "schema" / "sect.schema.json",
            "theme": self.root / "schema" / "theme.schema.json",
            "output": self.root / "images.schema.json",
        }

    @property
    def images(self) -> Path:
        return self.root / "images.json"

    @property
    def portraits(self) -> Path:
        return self.root / "portraits.json"

    @property
    def sect_maps(self) -> Path:
        return self.root / "sect-maps.json"


@dataclass(frozen=True)
class Build:
    artifacts: dict[Path, str]
    entity_count: int
    warnings: tuple[str, ...]


def json_schema(kind: str) -> dict[str, Any]:
    spec = SCHEMAS[kind]
    schema = spec.model.model_json_schema(mode="validation", by_alias=True)
    return {
        "$schema": SCHEMA_DIALECT,
        "$id": spec.schema_id,
        **schema,
        "title": spec.title,
    }


def build_index(catalog: Catalog) -> ImageIndex:
    entities: dict[str, Entity] = {}
    for name, source in sorted(catalog.entities.items()):
        pool_order = (
            (*CHARACTER_POOLS, *catalog.themes)
            if source.kind == "character"
            else ("map",)
        )
        images = [
            Image.from_source(image, pool)
            for pool in pool_order
            for image in source.pools.get(pool, ())
        ]
        entities[name] = Entity(type=source.kind, images=images)
    return ImageIndex(data={"entities": entities})


def build_legacy_portraits(
    catalog: Catalog,
) -> tuple[dict[str, dict[str, str]], tuple[str, ...]]:
    portraits: dict[str, dict[str, str]] = {
        section: {} for section in LEGACY_SECTIONS.values()
    }
    unsupported_themes: set[str] = set()

    for name, entity in sorted(catalog.entities.items()):
        if entity.kind != "character":
            continue
        pool_order = (
            *CHARACTER_POOLS,
            *LEGACY_THEME_ORDER,
            *(theme for theme in catalog.themes if theme not in LEGACY_THEME_ORDER),
        )
        for pool in pool_order:
            images = entity.pools.get(pool)
            if not images:
                continue
            section = LEGACY_SECTIONS.get(pool)
            if section is None:
                if pool not in CHARACTER_POOLS:
                    unsupported_themes.add(pool)
                continue
            urls = "|".join(image.url for image in images)
            portraits[section][name] = urls
            if pool in {"wedding", "tarot"}:
                default = portraits["charPortraits"].get(name)
                portraits["charPortraits"][name] = (
                    f"{default}|{urls}" if default else urls
                )

    warnings = tuple(
        f"主题池 [{theme}] 无对应 legacy 分区，已跳过"
        for theme in sorted(unsupported_themes)
    )
    return portraits, warnings


def build_legacy_sect_maps(catalog: Catalog) -> dict[str, dict[str, str]]:
    sects = {
        name: entity
        for name, entity in catalog.entities.items()
        if entity.kind == "sect"
    }
    grouped_names = {
        name for names in LEGACY_SECT_GROUPS.values() for name in names
    }
    if unmapped := sorted(sects.keys() - grouped_names):
        names = "、".join(unmapped)
        raise BuildError(f"legacy sect-maps 类别未配置：{names}")

    return {
        group: {
            name: (
                "|".join(image.url for image in sects[name].pools["map"])
                if name in sects
                else ""
            )
            for name in names
        }
        for group, names in LEGACY_SECT_GROUPS.items()
    }


def serialize(value: BaseModel | dict[str, Any]) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json", by_alias=True, exclude_none=True)
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def build_artifacts(paths: ProjectPaths, catalog: Catalog) -> Build:
    index = build_index(catalog)
    portraits, warnings = build_legacy_portraits(catalog)
    artifacts = {
        paths.images: serialize(index),
        paths.portraits: serialize(portraits),
        paths.sect_maps: serialize(build_legacy_sect_maps(catalog)),
        **{path: serialize(json_schema(kind)) for kind, path in paths.schemas.items()},
    }
    return Build(
        artifacts=artifacts,
        entity_count=len(index.data["entities"]),
        warnings=warnings,
    )


def stale_artifacts(build: Build) -> list[Path]:
    return [
        path
        for path, expected in build.artifacts.items()
        if not path.is_file() or path.read_text(encoding="utf-8") != expected
    ]


def write_artifacts(build: Build) -> None:
    for path, content in build.artifacts.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

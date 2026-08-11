"""TOML 读取与跨文件聚合。"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, TypeAdapter, ValidationError

from .models import (
    CHARACTER_POOLS,
    SECT_POOL,
    CharacterSource,
    EntityKind,
    Name,
    SectSource,
    SourceImage,
    ThemeSource,
)

SourceModel = TypeVar("SourceModel", bound=BaseModel)
NAME_ADAPTER = TypeAdapter(Name)


class BuildError(Exception):
    """包含源文件上下文的构建错误。"""


def _location(parts: tuple[str | int, ...]) -> str:
    return "$" + "".join(
        f"[{part}]" if isinstance(part, int) else f".{part}" for part in parts
    )


def _validation_details(error: ValidationError) -> str:
    return "; ".join(
        f"{_location(item['loc'])}: {item['msg']}"
        for item in error.errors(include_url=False)
    )


def load_source(path: Path, model: type[SourceModel]) -> SourceModel:
    try:
        with path.open("rb") as file:
            data = tomllib.load(file)
        return model.model_validate(data)
    except tomllib.TOMLDecodeError as error:
        raise BuildError(f"{path}: 非法 TOML: {error}") from error
    except ValidationError as error:
        raise BuildError(
            f"{path}: TOML 格式错误: {_validation_details(error)}"
        ) from error


def source_name(path: Path) -> str:
    try:
        return NAME_ADAPTER.validate_python(path.stem)
    except ValidationError as error:
        raise BuildError(f"{path}: 非法文件名: {_validation_details(error)}") from error


def _first_duplicate(values: list[str]) -> str | None:
    seen: set[str] = set()
    for value in values:
        if value in seen:
            return value
        seen.add(value)
    return None


def source_files(root: Path, directory: str) -> list[Path]:
    source_dir = root / "data" / directory
    if not source_dir.is_dir():
        raise BuildError(f"缺少数据目录: {source_dir}")
    return sorted(source_dir.glob("*.toml"))


@dataclass
class CatalogEntity:
    kind: EntityKind
    pools: dict[str, tuple[SourceImage, ...]] = field(default_factory=dict)
    origins: dict[str, Path] = field(default_factory=dict)


@dataclass
class Catalog:
    entities: dict[str, CatalogEntity] = field(default_factory=dict)
    themes: list[str] = field(default_factory=list)

    def add(
        self,
        *,
        name: str,
        kind: EntityKind,
        pool: str,
        images: list[SourceImage],
        source: Path,
    ) -> None:
        duplicate = _first_duplicate([image.url for image in images])
        if duplicate:
            raise BuildError(
                f"{source}: 实体 [{name}] 的池 [{pool}] 存在重复 URL: {duplicate}"
            )

        entity = self.entities.setdefault(name, CatalogEntity(kind=kind))
        if entity.kind != kind:
            raise BuildError(
                f"实体 [{name}] 被同时声明为 {entity.kind} 与 {kind}，命名冲突"
            )
        if previous := entity.origins.get(pool):
            raise BuildError(
                f"{source} 与 {previous} 重复定义了 [{name}] 的池 [{pool}]"
            )
        entity.pools[pool] = tuple(images)
        entity.origins[pool] = source


def load_catalog(root: Path) -> Catalog:
    catalog = Catalog()

    for path in source_files(root, "character"):
        source = load_source(path, CharacterSource)
        name = source_name(path)
        for pool, images in source.pools():
            catalog.add(
                name=name,
                kind="character",
                pool=pool,
                images=images,
                source=path,
            )

    for path in source_files(root, "sect"):
        source = load_source(path, SectSource)
        catalog.add(
            name=source_name(path),
            kind="sect",
            pool=SECT_POOL,
            images=source.images["map"],
            source=path,
        )

    for path in source_files(root, "themes"):
        theme = source_name(path)
        if theme in CHARACTER_POOLS:
            raise BuildError(f"{path}: 主题名 [{theme}] 与固定图片分类重名")
        source = load_source(path, ThemeSource)
        catalog.themes.append(theme)
        if not source.characters:
            continue
        for name, character in source.characters.items():
            images = [
                image.resolve(comment=source.comment, tags=source.tags)
                for image in character["images"]
            ]
            catalog.add(
                name=name,
                kind="character",
                pool=theme,
                images=images,
                source=path,
            )

    if not catalog.entities:
        raise BuildError("未找到任何图片数据")
    return catalog

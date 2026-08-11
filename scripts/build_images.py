#!/usr/bin/env python3
"""Build and verify all image data artifacts from TOML sources."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__:
    from .images.artifacts import (
        ProjectPaths,
        build_artifacts,
        stale_artifacts,
        write_artifacts,
    )
    from .images.catalog import BuildError, load_catalog
else:
    from images.artifacts import (  # type: ignore[no-redef]
        ProjectPaths,
        build_artifacts,
        stale_artifacts,
        write_artifacts,
    )
    from images.catalog import BuildError, load_catalog  # type: ignore[no-redef]

ROOT = Path(__file__).resolve().parent.parent


def run(*, root: Path = ROOT, check: bool = False) -> int:
    paths = ProjectPaths(root)
    build = build_artifacts(paths, load_catalog(root))

    for warning in build.warnings:
        print(f"警告: {warning}", file=sys.stderr)

    if check:
        if stale := stale_artifacts(build):
            paths_text = "、".join(str(path) for path in stale)
            print(f"{paths_text} 与 TOML 源不一致或缺失，需要重新构建", file=sys.stderr)
            return 1
        print("所有数据与 schema 产物均为最新")
        return 0

    write_artifacts(build)
    print(f"已构建 {len(build.artifacts)} 份产物（{build.entity_count} 个实体）")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="不写文件；产物过期或缺失时退出码为 1",
    )
    args = parser.parse_args(argv)
    return run(check=args.check)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BuildError as error:
        print(f"错误: {error}", file=sys.stderr)
        raise SystemExit(1) from error

from __future__ import annotations

import json
import tempfile
import unittest
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path

from pydantic import ValidationError

from scripts import build_images
from scripts.images.artifacts import (
    ProjectPaths,
    build_artifacts,
    build_index,
    json_schema,
    stale_artifacts,
    write_artifacts,
)
from scripts.images.catalog import BuildError, load_catalog
from scripts.images.models import CharacterSource, ImageIndex


class ProjectFixture:
    def __init__(self, root: Path) -> None:
        self.root = root

    def write(self, relative: str, content: str) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content.strip() + "\n", encoding="utf-8")

    def populate(self) -> None:
        self.write(
            "data/character/测试角色.toml",
            """
            [images]
            default = [{ url = "https://example.com/default.png" }]
            special = [{ url = "https://example.com/special.png", tags = ["event"] }]
            """,
        )
        self.write(
            "data/sect/万法宗.toml",
            """
            [images]
            map = [{ url = "https://example.com/map.png" }]
            """,
        )
        self.write(
            "data/themes/tarot.toml",
            """
            description = "塔罗主题"
            [characters."测试角色"]
            images = [{ url = "https://example.com/tarot.png", comment = "魔术师" }]
            """,
        )


class ImagePipelineTests(unittest.TestCase):
    def test_source_model_is_an_object_list_with_optional_metadata(self) -> None:
        source = CharacterSource.model_validate(
            {
                "images": {
                    "default": [
                        {
                            "url": "https://example.com/image.webp",
                            "tags": ["v53"],
                        }
                    ]
                }
            }
        )
        images = source.images.get("default")
        self.assertIsNotNone(images)
        assert images is not None
        self.assertEqual(images[0].tags, ["v53"])
        self.assertIsNone(images[0].comment)

        with self.assertRaises(ValidationError):
            CharacterSource.model_validate(
                {"images": {"default": [{"url": "https://example.com/a.webp "}]}}
            )
        with self.assertRaises(ValidationError):
            CharacterSource.model_validate(
                {"images": {"default": ["https://example.com/a.webp"]}}
            )
        with self.assertRaises(ValidationError):
            CharacterSource.model_validate(
                {"images": {"map": [{"url": "https://example.com/map.webp"}]}}
            )

    def test_source_schemas_have_no_union_dispatch(self) -> None:
        for kind in ("character", "sect", "theme"):
            with self.subTest(kind=kind):
                schema = json_schema(kind)
                encoded = json.dumps(schema)
                self.assertNotIn('"anyOf"', encoded)
                self.assertNotIn('"oneOf"', encoded)
                self.assertNotIn('"if"', encoded)

    def test_catalog_builds_typed_index_in_stable_pool_order(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ProjectFixture(root).populate()

            index = build_index(load_catalog(root))
            entity = index.data["entities"]["测试角色"]

            self.assertEqual(entity["type"], "character")
            self.assertEqual(
                [(image.theme, image.url) for image in entity["images"]],
                [
                    ("default", "https://example.com/default.png"),
                    ("special", "https://example.com/special.png"),
                    ("tarot", "https://example.com/tarot.png"),
                ],
            )
            self.assertEqual(entity["images"][1].tags, ["event"])
            self.assertEqual(entity["images"][2].comment, "魔术师")

    def test_build_writes_and_checks_every_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ProjectFixture(root).populate()
            paths = ProjectPaths(root)
            build = build_artifacts(paths, load_catalog(root))

            self.assertEqual(len(build.artifacts), 7)
            self.assertEqual(stale_artifacts(build), list(build.artifacts))
            write_artifacts(build)
            self.assertEqual(stale_artifacts(build), [])
            self.assertEqual(build_images.run(root=root, check=True), 0)

            document = ImageIndex.model_validate_json(paths.images.read_text())
            self.assertEqual(len(document.data["entities"]), 2)
            portraits = json.loads(paths.portraits.read_text())
            self.assertEqual(
                portraits["charPortraits"]["测试角色"],
                "https://example.com/default.png|https://example.com/tarot.png",
            )
            sect_maps = json.loads(paths.sect_maps.read_text())
            self.assertEqual(
                sect_maps["玄天界"]["万法宗"],
                "https://example.com/map.png",
            )
            self.assertEqual(sect_maps["玄天界"]["黑金阁"], "")
            self.assertIn("九天仙界", sect_maps)

    def test_legacy_sect_maps_rejects_unmapped_sects(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture = ProjectFixture(root)
            fixture.populate()
            fixture.write(
                "data/sect/测试宗门.toml",
                '[images]\nmap = [{ url = "https://example.com/map.png" }]',
            )

            with self.assertRaisesRegex(BuildError, "类别未配置：测试宗门"):
                build_artifacts(ProjectPaths(root), load_catalog(root))

    def test_check_reports_drift_without_writing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ProjectFixture(root).populate()
            paths = ProjectPaths(root)
            build = build_artifacts(paths, load_catalog(root))
            write_artifacts(build)
            paths.images.write_text("{}\n", encoding="utf-8")

            with redirect_stderr(StringIO()):
                self.assertEqual(build_images.run(root=root, check=True), 1)
            self.assertEqual(paths.images.read_text(), "{}\n")

    def test_catalog_rejects_duplicate_urls_with_source_context(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ProjectFixture(root).write(
                "data/character/测试角色.toml",
                """
                [images]
                default = [
                  { url = "https://example.com/a.png" },
                  { url = "https://example.com/a.png", comment = "重复" },
                ]
                """,
            )

            with self.assertRaisesRegex(
                BuildError, r"测试角色\.toml.*\[default\].*重复 URL"
            ):
                load_catalog(root)

    def test_catalog_rejects_cross_kind_name_collisions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture = ProjectFixture(root)
            fixture.write(
                "data/character/同名.toml",
                '[images]\ndefault = [{ url = "https://example.com/a.png" }]',
            )
            fixture.write(
                "data/sect/同名.toml",
                '[images]\nmap = [{ url = "https://example.com/map.png" }]',
            )

            with self.assertRaisesRegex(BuildError, "同时声明"):
                load_catalog(root)

    def test_new_themes_stay_in_modern_output_without_expanding_legacy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture = ProjectFixture(root)
            fixture.populate()
            fixture.write(
                "data/themes/festival.toml",
                """
                [characters."测试角色"]
                images = [{ url = "https://example.com/festival.png" }]
                """,
            )

            build = build_artifacts(ProjectPaths(root), load_catalog(root))
            document = json.loads(build.artifacts[ProjectPaths(root).images])
            themes = [
                image["theme"]
                for image in document["data"]["entities"]["测试角色"]["images"]
            ]

            self.assertIn("festival", themes)
            self.assertEqual(
                build.warnings,
                ("主题池 [festival] 无对应 legacy 分区，已跳过",),
            )

    def test_committed_schemas_match_models(self) -> None:
        paths = ProjectPaths(build_images.ROOT)
        for kind, path in paths.schemas.items():
            with self.subTest(kind=kind):
                self.assertEqual(
                    json.loads(path.read_text(encoding="utf-8")),
                    json_schema(kind),
                )


if __name__ == "__main__":
    unittest.main()

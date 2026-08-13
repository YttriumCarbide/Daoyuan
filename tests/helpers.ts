import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export class ProjectFixture {
  readonly root: string;

  constructor() {
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), "daoyuan-images-"));
  }

  write(relative: string, content: string): void {
    const filePath = path.join(this.root, relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content.trim() + "\n", "utf8");
  }

  populate(): void {
    this.write(
      "data/character/测试角色.toml",
      `
      [images]
      default = [{ url = "https://example.com/default.png" }]
      special = [{ url = "https://example.com/special.png", tags = ["event"] }]
      `,
    );
    this.write(
      "data/sect/万法宗.toml",
      `
      [images]
      map = [{ url = "https://example.com/map.png" }]
      `,
    );
    this.write(
      "data/themes/tarot.toml",
      `
      description = "塔罗主题"
      [characters."测试角色"]
      images = [{ url = "https://example.com/tarot.png", comment = "魔术师" }]
      `,
    );
  }

  cleanup(): void {
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}

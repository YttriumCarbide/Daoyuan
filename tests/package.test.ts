import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT } from "./helpers.js";

interface PackageManifest {
  files: string[];
  dependencies: Record<string, string>;
  exports: Record<string, unknown>;
}

describe("package boundary", () => {
  it("publishes only the SDK with Zod as its sole runtime dependency", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    ) as PackageManifest;

    expect(manifest.files).toEqual(["dist/sdk"]);
    expect(Object.keys(manifest.dependencies)).toEqual(["zod"]);
    expect(JSON.stringify(manifest.exports)).not.toContain("cli");
  });

  it("keeps SDK sources independent from CLI sources", () => {
    const sdkDirectory = path.join(ROOT, "src", "sdk");
    for (const name of fs.readdirSync(sdkDirectory).filter((file) => file.endsWith(".ts"))) {
      const source = fs.readFileSync(path.join(sdkDirectory, name), "utf8");
      expect(source).not.toMatch(/from ["']\.\.\/cli(?:\/|["'])/);
    }
  });
});

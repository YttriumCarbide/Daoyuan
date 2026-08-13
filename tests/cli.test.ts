import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../src/cli/options.js";

describe("cli options", () => {
  it("parses --check and rejects unknown arguments", () => {
    expect(parseCliArgs([])).toEqual({ check: false });
    expect(parseCliArgs(["--check"])).toEqual({ check: true });
    expect(() => parseCliArgs(["--cehck"])).toThrow(/Unknown option/);
  });
});

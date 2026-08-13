#!/usr/bin/env node
import * as path from "node:path";

import { BuildError } from "./catalog.js";
import { parseCliArgs } from "./options.js";
import { run } from "./run.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

try {
  const options = parseCliArgs(process.argv.slice(2));
  process.exitCode = run(ROOT, options.check);
} catch (error) {
  if (error instanceof BuildError || isParseArgsError(error)) {
    console.error(`错误: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

function isParseArgsError(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("ERR_PARSE_ARGS_")
  );
}

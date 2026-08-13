#!/usr/bin/env node
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { BuildError } from "./catalog.js";
import { run } from "./run.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.exitCode = run(ROOT, process.argv.slice(2).includes("--check"));
} catch (error) {
  if (error instanceof BuildError) {
    console.error(`错误: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

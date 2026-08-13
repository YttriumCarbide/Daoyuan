import { parseArgs } from "node:util";

export interface CliOptions {
  check: boolean;
}

/** 严格解析仓库内部构建命令参数，避免拼写错误退化为写入模式。 */
export function parseCliArgs(args: string[]): CliOptions {
  const { values } = parseArgs({
    args,
    options: {
      check: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  return { check: values.check };
}

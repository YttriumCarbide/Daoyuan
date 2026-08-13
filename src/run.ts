import { loadCatalog } from "./catalog.js";
import {
  ProjectPaths,
  buildArtifacts,
  staleArtifacts,
  writeArtifacts,
} from "./artifacts.js";

/** 构建全部产物；`check` 为 true 时不写文件，任一产物过期或缺失返回 1。 */
export function run(root: string, check = false): number {
  const paths = new ProjectPaths(root);
  const build = buildArtifacts(paths, loadCatalog(root));

  for (const warning of build.warnings) {
    console.error(`警告: ${warning}`);
  }

  if (check) {
    const stale = staleArtifacts(build);
    if (stale.length > 0) {
      console.error(`${stale.join("、")} 与 TOML 源不一致或缺失，需要重新构建`);
      return 1;
    }
    console.log("所有数据与 schema 产物均为最新");
    return 0;
  }

  writeArtifacts(build);
  console.log(`已构建 ${Object.keys(build.artifacts).length} 份产物（${build.entityCount} 个实体）`);
  return 0;
}

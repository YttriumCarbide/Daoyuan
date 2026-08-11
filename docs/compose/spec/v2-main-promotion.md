---
feature: v2-main-promotion
status: in-progress
updated: 2026-08-11
branch: v2
commits:
---

# V2 Main Promotion

## Report

## [S1] Problem

仓库当前由 `v2` 和 `main` 两个分支分别触发构建，并把触发分支的产物双向写回两个分支。两个分支一旦分叉，较晚完成的任务可能覆盖较新的产物；删除 `v2` 后，固定遍历两个分支的脚本又会失败。日常维护还要求人工格式化 TOML、生成 JSON，再决定如何同步主线，步骤多且容易遗漏。

需要把分支职责收敛为单向维护流程：维护者只向 `v2` 推送，CI 自动整理并验证完整仓库状态，验证成功后将同一个提交晋级为 `main` 的发布状态。客户端直接读取 `main`，不额外创建 GitHub Release。

## [S2] Design

### 分支职责

- `v2` 是唯一维护分支，接受人工 push；`main` 是只读发布镜像，只接受晋级工作流写入。
- 工作流只由 `v2` push 或手工 dispatch 触发；`main` push 不再触发构建或反向同步。
- 仓库规则应禁止人工直接更新 `main`，同时允许本仓库 GitHub Actions 晋级。规则属于 GitHub 仓库设置，不由工作流自行修改。
- 首次启用前把当前 `origin/main` 历史合入 `v2`，保证 `main` 是 `v2` 的祖先；之后始终使用 fast-forward，禁止 force push 和自动冲突合并。

### 自动维护与验证

每次任务固定执行以下步骤：

1. 从 `v2` 完整历史检出触发提交并安装锁定依赖；
2. 自动格式化受 Tombi 管理的 TOML；
3. 从 TOML 生成全部现代、schema 和 legacy JSON 产物；
4. 运行完整单元测试与空白错误检查；
5. 只暂存允许自动维护的 TOML 与生成产物；有变化时创建带 `[skip ci]` 的机器人提交，避免机器人 push 递归触发晋级；
6. 推送前重新获取远端，若 `v2` 已不再是本次触发 SHA，则退出并由较新的任务接手；
7. 确认远端 `main` 是最终提交的祖先，然后使用一次 atomic push 将最终提交同时更新到 `v2` 和 `main`。

固定并发组只允许一条晋级任务有效运行，新 push 可取消旧任务。任何格式、构建、测试、分叉或 push 失败都不得更新 `main`。`notice.json` 和其他手工文件随普通 `v2` 提交自然晋级，不被当成生成产物复制。

### 兼容文件

恢复主线客户端使用的准确路径 `portrait-drawers.json`。错误命名的 `portraits-drawer.json` 不作为新契约保留，避免两个近似文件继续分叉。

### 发布语义

`main` 成功更新即完成发布。仓库不创建 tag 或 GitHub Release；一次晋级只产生一次 `main` 更新，客户端始终从 `main`/raw 地址读取同一提交中的源数据和生成产物。

## [S3] Out of Scope

- 不创建 GitHub Release、版本 tag 或额外部署环境。
- 不支持 `main` 向 `v2` 反向同步，也不自动解决分支冲突。
- 不为外部 fork PR 提供自动写回；本流程以维护者直接 push `v2` 为准。
- 不改变图片数据契约、生成器业务规则或现有图片内容。

## Tasks

- [ ] T1: 重构构建工作流为 `v2` 单向晋级 `main` — acceptance: 仅 `v2` push/dispatch 触发；自动格式化、构建和测试通过后，带陈旧提交与祖先检查的 atomic fast-forward 同步同一 SHA；失败路径不更新 `main` (covers: S2)
- [ ] T2: 恢复准确命名的抽屉兼容文件并更新维护文档 — acceptance: 仓库只保留 `portrait-drawers.json`，README 描述 `v2` 单向维护、自动生成和 `main` 发布语义 (covers: S2)
- [ ] T3: 建立首次晋级基线并验证完整流程 — acceptance: `v2` 包含当前 `origin/main` 历史；TOML 格式、构建检查、单元测试、工作流静态检查与合并祖先关系全部通过 (covers: S2; depends: T1, T2)

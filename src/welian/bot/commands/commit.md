---
command: commit
description: 分析当前改动并提交（commit-push-pr 一体化）
permission: lax
---
## 上下文

- 当前 git 状态：!`git status`
- 当前 git diff（已暂存和未暂存）：!`git diff HEAD`
- 当前分支：!`git branch --show-current`
- 最近提交：!`git log --oneline -5`

## 任务

基于以上改动：
1. 如果在 main 分支上，创建一个新分支
2. 创建一个有意义的 commit message（中文，描述"为什么"而非"做了什么"）
3. 暂存并提交
4. 推送到 origin
5. 如果需要 PR，用 `gh pr create` 创建

在一个消息里完成所有步骤。不要做其他操作。

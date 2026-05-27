---
name: github-repo
description: 创建 GitHub 私有/公开仓库、推送已有代码、配置 CI。用户说"创建仓库"、"新建 repo"、"push 到 GitHub"、"初始化仓库"时触发。
---

# github-repo — GitHub 仓库创建 & 初始化

## 前置条件

需要 `gh` CLI 已登录：

```pwsh
gh auth status
# 未登录则：gh auth login
```

## Workflow

### Step 1 — 创建仓库

```pwsh
# 私有仓库（默认）
gh repo create <name> --private --source=. --push --remote origin

# 公开仓库
gh repo create <name> --public --source=. --push --remote origin

# 仅创建（不推代码）
gh repo create <name> --private
```

参数说明：

| 参数 | 作用 |
|------|------|
| `--private` / `--public` | 仓库可见性 |
| `--source=.` | 以当前目录内容初始化 |
| `--push` | 自动 push |
| `--remote origin` | remote 名 |
| `--description "..."` | 仓库描述 |

### Step 2 — 已有仓库但无 remote

```pwsh
gh repo create <name> --private
git remote add origin https://github.com/<user>/<name>.git
git push -u origin main
```

### Step 3 — 可选：添加 CI

```pwsh
mkdir -p .github/workflows
# Node.js CI 示例
@'
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - run: npm test
'@ > .github/workflows/ci.yml
git add .github/ && git commit -m "chore: add CI" && git push
```

### Step 4 — 可选：分支保护

```pwsh
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --input '{"required_status_checks": null, "enforce_admins": true, "required_pull_request_reviews": {"required_approving_review_count": 1}}'
```

## 常见场景

### 已有项目推送到私有仓库

```pwsh
cd my-project
git init && git add . && git commit -m "init"
gh repo create my-project --private --source=. --push
```

### 从零创建

```pwsh
gh repo create my-project --private --clone
cd my-project
# 开发...
git add . && git commit -m "init" && git push
```

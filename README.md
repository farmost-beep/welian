# Welian

> 关系的质量，决定人生的质量。

Welian（维联）是一个社交垂直应用——帮你用心对待两类关系：为目标联结的合作网络，和值得陪伴的情感纽带。

## 使命

让每个人成为更好的社会角色——更好的朋友、更好的家人、更好的合作者——最终成为更好的自己。

## 双关系模型

| 类型 | 隐喻 | 本质 |
|:----|:----|:----|
| 撬动型 | 果园 | 为目标联结，用心栽培，静候收获 |
| 维系型 | 浇一盆花 | 关系本身就是意义，在场就是全部 |

## 官网

[welian.app](https://welian.app)

## 部署

```bash
# 前端（Cloudflare Pages）
node /opt/homebrew/lib/node_modules/wrangler/wrangler-dist/cli.js \
  pages deploy public/ --project-name=welian

# 后端 Worker
cd cloud-worker && npx wrangler deploy
```

## License

MIT

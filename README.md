# 私域落地页一键延展工具

这是独立部署包，不影响之前的“聚合 KV 工具”。

## 运行

```bash
npm start
```

默认端口：

```text
4174
```

## 环境变量

部署到云端时在平台后台配置：

```text
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_IMAGE_MODEL=gpt-image-2-1K
ACCESS_PASSWORD=change-me
DAILY_LIMIT=10
PORT=4174
HOST=0.0.0.0
```

不要把真实 `.env` 提交到仓库。

## Render / Node 服务部署

- Runtime: Node
- Build Command: 留空或 `npm install`
- Start Command: `npm start`
- Environment: 按上面的环境变量填写

生成图会临时保存到 `outputs/`，上传切片会临时保存到 `uploads/`。

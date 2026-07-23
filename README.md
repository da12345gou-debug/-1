# GTM运营工作台1.0版本

公网部署版包含四个独立工具：

- 产品海报一键生成
- DEMO一键生成
- 落地页延展
- GTM全渠道一键延展工具

第四个工具通过 `GPT-image-2` 图片编辑 API 生成天猫、京东、小度商城、私域及自定义尺寸物料。普通用户每天最多发起一次完整延展任务；同一任务中的中间图和多个尺寸不重复计数。使用管理员密码登录不受该限制。

运行：

```bash
npm start
```

主要环境变量：

- `WORKBENCH_ACCESS_PASSWORD`
- `WORKBENCH_OWNER_PASSWORD`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_IMAGE_MODEL`
- `EXTEND_DAILY_LIMIT`，默认 `1`
- `GENERATED_OUTPUT_ROOT`

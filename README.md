# 运营聚合海报生成器

一个本地运行、也可部署到服务器上的网页版小工具。填写运营变量，上传产品六面图，然后通过内置小度机器人参考图和 OpenAI Image API 生成 3:4 商业广告海报。

## 运行

```powershell
& 'C:\Users\panyan05\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

打开：

```text
http://127.0.0.1:4173
```

页面里可以填写 OpenAI API Key；如果不填，则使用服务端 `.env` 里的 key。在项目根目录创建 `.env`：

```text
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.chatshare.hk/v1
OPENAI_IMAGE_MODEL=gpt-image-2-1K
ACCESS_PASSWORD=DUUE123
DAILY_LIMIT=10
```

如果使用第三方 OpenAI 兼容服务，需要把 `OPENAI_BASE_URL` 改成第三方提供的 Base URL，或在页面里填写“API 接口地址”。

## 默认设置

- 默认模型：`gpt-image-1.5`
- 默认尺寸：`auto`
- 默认质量：`medium`
- 生成结果会保存到本地 `outputs/` 文件夹，并在页面右侧显示预览

## 文件结构

- `server.js`：本地服务和 OpenAI API 转发
- `public/index.html`：页面结构
- `public/styles.css`：界面样式
- `public/app.js`：表单、上传预览、提示词生成和请求逻辑
- `public/assets/robot-reference.png`：内置机器人参考图

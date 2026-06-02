import http from "node:http";
import { readFile } from "node:fs/promises";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const outputDir = path.join(__dirname, "outputs");
const uploadDir = path.join(__dirname, "uploads");
const rulesPath = path.join(__dirname, "LANDING_PAGE_TYPE_RULES.md");
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "0.0.0.0";
const maxBodyBytes = 60 * 1024 * 1024;
const styleRefs = [
  path.join(publicDir, "assets", "style-1.jpg"),
  path.join(publicDir, "assets", "style-2.png"),
  path.join(publicDir, "assets", "style-3.png")
];
const defaultPrototypePath = path.join(publicDir, "assets", "prototype-default.png");
const defaultHeroPath = path.join(publicDir, "assets", "hero-default.png");
const defaultRobotRefPaths = [
  path.join(publicDir, "assets", "robot-ref-1.png"),
  path.join(publicDir, "assets", "robot-ref-2.png")
];

let accessPassword = "";
let dailyLimit = 30;
const sessions = new Map();
const usageBySession = new Map();
const generationJobs = new Map();
const uploadedImages = new Map();

await loadDotEnv();
accessPassword = String(process.env.ACCESS_PASSWORD || "").trim();
dailyLimit = Number(process.env.DAILY_LIMIT || 30);
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const content = await readFile(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*\uFEFF?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function getSessionId(req) {
  return parseCookies(req).landing_session || "";
}

function isAuthorized(req) {
  if (!accessPassword) return true;
  const sessionId = getSessionId(req);
  return sessionId && sessions.has(sessionId);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function checkUsage(req, count) {
  const sessionId = getSessionId(req) || "anonymous";
  const key = `${todayKey()}:${sessionId}`;
  const used = usageBySession.get(key) || 0;
  if (used + count > dailyLimit) return false;
  usageBySession.set(key, used + count);
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("上传内容太大，请压缩参考图后重试。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function normalizeBaseUrl(value) {
  const baseUrl = String(value || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
  return baseUrl.replace(/\/+$/, "");
}

function dataUrlToBlob(dataUrl, fallbackName) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error(`${fallbackName} 不是有效图片。`);
  const mime = match[1];
  const extension = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const bytes = Buffer.from(match[2], "base64");
  return {
    blob: new Blob([bytes], { type: mime }),
    filename: `${fallbackName}.${extension}`
  };
}

function dataUrlToUpload(dataUrl, fallbackName) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error(`${fallbackName} 不是有效图片。`);
  const mime = match[1];
  const extension = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return {
    bytes: Buffer.from(match[2], "base64"),
    mime,
    extension,
    filename: `${fallbackName}.${extension}`
  };
}

async function fileToBlob(filePath, mime, filename) {
  const bytes = await readFile(filePath);
  return {
    blob: new Blob([bytes], { type: mime }),
    filename
  };
}

async function uploadedRefToBlob(refId, sessionId, fallbackName) {
  const item = uploadedImages.get(refId);
  if (!item || item.sessionId !== sessionId) throw new Error(`${fallbackName} 上传引用已过期，请刷新后重试。`);
  return await fileToBlob(item.filePath, item.mime, item.filename);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function inferSegmentCount(body) {
  if (Array.isArray(body.prototypeSegmentRefs) && body.prototypeSegmentRefs.length) {
    return clamp(body.prototypeSegmentRefs.length, 1, 10);
  }
  if (Array.isArray(body.prototypeSegments) && body.prototypeSegments.length) {
    return clamp(body.prototypeSegments.length, 1, 10);
  }
  if (body.segmentMode === "single") return 1;
  if (body.segmentMode === "manual") return clamp(Number(body.segmentCount || 1), 1, 10);
  const width = Number(body.prototypeMeta?.width || 750);
  const height = Number(body.prototypeMeta?.height || 1600);
  const ratio = height / Math.max(width, 1);
  return clamp(Math.ceil(ratio / 2.1), 1, 10);
}

function getField(fields, key, fallback) {
  return String(fields?.[key] || fallback || "").trim();
}

function buildRunStyleGuide(fields) {
  const tone = getField(fields, "tone", "绿");
  const mood = getField(fields, "mood", "春日露营");
  return `# 本次落地页一次性精细规范

本规范只服务于当前这一套落地页分段生成。第一段生成后即视为本次页面的视觉基准，后续所有分段必须严格沿用，不允许重新发明标题、卡片、图标、文字框或背景样式。

## 统一标题组件

- 所有模块小标题的文字规格和胶囊尺寸是同一个组件，不是相似组件，必须像复制粘贴出来一样。
- 标题文字：46px，字重 850，行高 1.15，字间距 0，颜色统一。
- 标题框：高度固定 78px，圆角 28px，左右内边距 50px，上下内边距 15px。
- 标题框宽度策略：短标题使用统一最小宽度 360px；长标题可加宽到 520px，但所有同字数级别标题框宽度一致。
- 标题框视觉皮肤不写死：颜色、风格、材质感和内部装饰元素必须跟随本次页面色调【${tone}】与主题变化，可以灵活设计；严禁固定使用绿色，除非页面色调本身明确包含绿色。
- 标题框被写死的只有结构尺寸：高度、圆角、左右内边距、上下内边距、文字字号、字重、行高、居中方式必须全页一致。
- 标题文字在标题框内部严格水平居中、垂直居中；标题框中心线必须与页面中心线重合。
- 所有文字都必须干净平面化，禁止任何文字投影、文字阴影、描边、外发光、浮雕或立体字效果；标题胶囊的层次只能来自色块、描边、留白和装饰元素，不能靠文字阴影。
- 所有文字必须保持正常字体比例和正常字宽，字形宽高比为 100% 正常比例；禁止上下拉伸、横向拉长、横向压扁、纵向压扁、倾斜变形、使用加宽字体/压缩字体，或为了塞进胶囊而改变字形比例；文字放不下时只能加宽标题框或换行，不能拉伸/压缩/加宽字体。
- 禁止副标题或后续标题变大、变粗、变高、偏左、偏右；禁止每段重新设计标题框。
- 标题框内部允许小花、小星、叶片等主题装饰，但装饰内容和风格不写死，只需与本次主题协调；装饰必须在框内，不要跑到页面背景上。

## 统一内容框组件

- 大内容卡片：宽度约 670px，圆角 28px，左右内边距 30px，上下内边距 28px。
- 小信息框：圆角 18px，内边距 18-22px，描边 1-2px，同级框高度和宽度尽量一致。
- 正文主信息：26px，字重 600，行高 1.5；说明文字：22px，行高 1.55；注释：18px，行高 1.45。
- 同级文字框、图标、按钮、列表项必须严格对齐，左右边缘一致，中心线一致。
- 图标统一 3D 简约风，普通图标 42-54px，重点图标 60-72px；同级图标大小一致。
- 小标题胶囊与它自己的内容卡片保持贴近，标题胶囊可以轻微压在内容卡片上，但不要为了贴合而拉伸文字或扭曲胶囊形状。
- 上一个模块的内容卡片底部到下一个模块小标题胶囊顶部的垂直间距固定为 96px。这个间距专指“上一个完整内容卡片结束后，到下一个模块标题胶囊开始前”的留白，不得压缩到 48px 或更小。
- 二维码模块必须严格左右居中：二维码图片本身、二维码标题、说明文字、底部提示都必须以页面中心线为轴居中，不允许偏左或偏右。
- 二维码模块必须强制上下留白：二维码模块顶部到上一个模块底部至少 300px，二维码模块底部到下一个模块顶部至少 300px；如果二维码是页面最后一个模块，二维码底部到页面装饰性收尾区域也至少 300px。
- 二维码区域无条件禁止左右分栏。二维码必须独占整行整块，二维码左右两侧不得放插画、文字、图标、按钮或装饰主体；二维码外层容器、二维码图片本身、标题和说明文字都必须以页面中心线为轴严格居中。
- 同一组小模块之间的垂直间距必须统一，按内容密度保持在 36-64px；同级模块不得忽大忽小，但不再按标题胶囊高度强行换算固定数值。

## 统一背景与拼接

- 本次主题为【${mood}】，页面主色调为【${tone}】。
- 所有标题框、按钮、徽标和重点图标必须与页面主色调【${tone}】协调；如果页面色调是红蓝紫，则标题框应使用红/蓝/紫体系或其柔和过渡色，不得突然使用绿色。
- 页面总背景必须是统一、非常干净的纯色背景，不使用渐变，不要在大背景上散落额外装饰。
- 背景装饰全部收进标题框、内容卡片或局部插画内部；页面大背景只保留同一个纯色色块，不出现满屏花瓣、叶片、星星、光斑等独立装饰。
- 标准跨模块间距 A = 96px。分段拼接处按 A 计算：上一段最后一个模块到底部留 64px，下一段顶部到第一个模块留 64px，工具会重叠融合约 32px，视觉结果接近 96px。
- 除最后一段外，每一段的顶部 64px 和底部 64px 必须保持干净：只允许同一个纯色背景，不放标题、正文、按钮、二维码、卡片边缘或关键图标。
- 最后一段的底部填充只允许由“分段生成硬规则”在最后一段单独指定；非最后一段不得使用主题场景、插画、地台、植物、道具等元素填充底部，不得因为画布有空余而改变原型切片中的模块比例。
- 所有分段看起来必须来自同一张连续长图，标题样式、文字框样式、圆角、色彩、留白、图标风格和对齐方式完全一致。`;
}

function buildPrompt(fields, rules, runStyleGuide, segmentIndex, totalSegments, safeMode = false) {
  const tone = getField(fields, "tone", "绿");
  const heroRatio = getField(fields, "heroRatio", "3:4");
  const mood = getField(fields, "mood", "春日露营");
  const isLastSegment = segmentIndex === totalSegments - 1;
  const segmentGuide = totalSegments > 1
    ? `\n\n分段生成硬规则：这是第 ${segmentIndex + 1}/${totalSegments} 段“头图以下内容区”的生成任务。只生成当前上传原型小段对应的内容，不要生成整页，不要压缩字号，不要压缩模块高度，不要为了塞进画布缩小文字。${segmentIndex === 0 ? "本段负责确立本次落地页的一次性视觉规范；本段的小标题文字字号、字重、行高、标题框高度、标题框宽度、圆角、内边距会成为后续所有分段的固定标准；标题框颜色、视觉风格和内部装饰元素不写死，只需跟随本次主题和页面色调协调统一。" : "本段必须严格复用第一段实际生成结果中的小标题结构组件。你会收到一张 FIRST_SEGMENT_STYLE_LOCK_VISUAL_ONLY_IGNORE_TEXT 参考图，它只用于锁定第一段的小标题文字字号、字重、标题框尺寸、圆角、内边距、卡片圆角、文字框间距和整体对齐方式；不得把颜色、装饰元素或主题风格理解为不可变化的死模板，但必须与本次页面色调协调统一。必须完全忽略这张图中的所有文字、模块内容、模块数量、信息结构和任何角色数量，严禁复制或续写该参考图中的任何内容或角色。本段内容仍必须完全来自当前原型切片。"}文字字形硬规则：所有中文、数字、英文都使用正常字宽和正常宽高比，禁止横向拉长、横向加宽、上下拉长、压扁、倾斜、变窄或变形；不要使用 extended/expanded/condensed 字体效果。模块间距规则：同一组小模块之间的垂直间距必须统一，按内容密度保持在 36-64px；同级模块不得忽大忽小。小标题胶囊与它自己的内容卡片保持贴近，可以轻微压在内容卡片上，但禁止为了贴合而拉伸文字或扭曲胶囊形状。上一个模块的内容卡片底部到下一个模块小标题胶囊顶部的垂直间距固定为 96px，不得压缩到 48px 或更小。内容去重硬规则：每个模块只能出现一次；如果当前原型切片里没有出现某个模块，不要补充；如果某个模块已经在上一段原型切片中完成，不要在本段重复生成。${isLastSegment ? `最后一段尤其禁止在底部重复生成已经出现过的两个模块，也禁止补充原型切片之外的收尾模块；原型最后一个真实模块结束后，如果画布还有剩余高度，必须使用与主题【${mood}】相关的纯视觉元素填满底部，例如主题场景、局部插画、地台、植物、道具、柔和背景形状或氛围装饰。严禁拉伸已有文字、标题、胶囊、卡片或二维码；严禁再出现新的标题胶囊、卡片、列表、按钮、二维码、规则文字或权益内容。` : ""}标准跨模块间距 A = 96px。分段拼接处必须按半间距处理：上一段最后一个模块到底部留 64px，下一段顶部到第一个模块留 64px，工具会重叠融合约 32px，视觉上合并为约 96px 的正常跨模块间距。尤其注意：每段顶部约 64px ${isLastSegment ? "保持干净用于承接上一段；" : "和底部约 64px 必须保持干净；"}只放统一纯色背景，不放渐变、不放小标题、正文、按钮、二维码、关键图标、卡片边缘或额外装饰。${isLastSegment ? "最后一段最底部必须用主题相关的纯视觉收尾填充剩余高度，但只允许加入与主题匹配的场景、插画、装饰、柔和底托或少量小元素；不得新增或重复任何信息模块，不得抢占二维码/规则信息，不要突然截断。" : "非最后一段的底部不要做复杂装饰，必须是简洁纯色背景，便于后续衔接。"}最终工具会对相邻内容段做 32px 左右的融合，因此边缘处必须自然连续，不能出现硬边、断层、横线、重复标题、突然截断的卡片或异常加高的留白。`
    : "\n\n生成硬规则：只生成顶部头图以下的内容区。不要生成顶部头图，不要压缩字号，不要压缩模块高度。";

  const brandSafetyGuide = safeMode
    ? `\n\n品牌安全重试模式：上一轮图片生成可能触发了安全策略。本轮必须更保守：不要生成或复刻任何真实品牌 logo、商标、产品 UI 截图、产品细节外观或可识别品牌标识。参考图只用于理解移动端落地页的排版密度、字号层级、圆角、留白和现代运营设计气质。若原型文字中出现品牌名，可作为普通文字信息保留，但不要把品牌 logo 或专有产品外观画出来。`
    : `\n\n品牌安全规则：不要复刻真实品牌 logo、商标、产品 UI 截图或高度可识别的品牌产品外观。参考图和原型图中的其他品牌元素只用于理解版式、信息层级和视觉氛围。`;

  return `最高优先级：当前上传的原型切片是唯一的内容来源、唯一的模块来源、唯一的信息结构来源。必须逐项保留原型切片中的模块顺序、模块数量、文字信息、段落含义和信息层级。

参考图1、图2、图3只能用于观察字体气质、字号层级、字间距、行间距、圆角、按钮/卡片质感、图标风格和整体UI规范。严禁复制、挪用、改写或借用参考图1、图2、图3中的任何具体模块、文字、标题、课程内容、商品权益、人物头像、二维码区域、产品陈列、活动结构或页面段落。参考图里的内容全部视为无效内容，不得出现在结果中。

为上传的落地页原型图设计同样风格和规范的移动端落地页。要求文字完全符合原型图，视觉简洁现代，字体字号、字间距、行间距、图标风格严格按照参考图1、图2、图3和下方固定规则执行；如果原型切片中有与参考页面视觉类型类似的模块，只允许借鉴外观样式，内容、结构、模块数量和信息顺序必须严格按照原型切片。

固定字号与字距规则如下：
${rules}

本次页面一次性精细MD如下，必须优先遵守：
${runStyleGuide}

小标题硬规则：全页所有模块小标题必须全部使用同一套标题结构组件。每一个小标题的字体字号、字重、行高、字间距、圆角背景框高度、背景框圆角、背景框左右内边距、背景框上下内边距必须完全一致。小标题背景框必须严格左右居中，背景框中心线与页面中心线重合；小标题文字必须在背景框内部水平居中、垂直居中。禁止出现某些小标题更大、某些更小、某些偏左或偏右的情况。若标题文字较长，只能加宽背景框或合理换行，不得缩小字号，不得破坏居中，不得拉伸、压缩或加宽字形。注意：小标题的颜色、胶囊视觉风格、内部装饰元素不写死，必须跟随用户填写的页面色调和视觉氛围灵活变化；写死的只有字号和胶囊结构尺寸。所有小标题以居中为主，内容以居中排布为主，多用圆角矩形，严格对齐，左右对称，每个小标题都统一且突出。所有文字必须干净平面化，禁止文字投影、文字阴影、描边、外发光、浮雕或立体字效果；所有文字必须保持正常字体比例和正常字宽，字形宽高比为 100% 正常比例，禁止上下拉伸、横向拉长、横向加宽、横向压扁、纵向压扁、倾斜变形、使用加宽字体/压缩字体或为了塞进容器而改变字形比例；色块和卡片也不要使用明确阴影，呈现简约干净的效果。

内容还原硬规则：不得把参考图1、图2、图3里的任何板块、文字或信息结构搬进当前页面。当前原型切片里明确出现什么模块，就生成什么模块；当前原型切片里没有出现的模块，一律不要补充。若当前原型中确实出现了与参考图同名或相似的模块，也必须以当前原型的文字、顺序和信息层级为准，只借鉴参考图的视觉样式。

二维码硬规则：如果当前原型切片出现二维码，二维码必须严格左右居中，二维码图片本身的中心点必须与页面中心线重合；二维码外层容器、二维码标题、说明文字、提示语也全部以页面中心线为轴居中排列。二维码区域无条件禁止左右分栏，不得把二维码放到左侧、右侧、卡片偏侧、插画旁边、文字旁边或装饰主体旁边；二维码必须独占整行整块，左右两侧保持空白或纯背景。二维码模块必须强制上下留白：二维码模块顶部到上一个模块底部至少 300px，二维码模块底部到下一个模块顶部至少 300px；如果二维码是页面最后一个模块，二维码底部到页面装饰性收尾区域也至少 300px。

重复模块禁止规则：严格按照上传原型图的模块顺序和模块数量生成。不得因为分段、样式锁参考图或参考图1/2/3而重复生成任何模块；不得在最后一段底部额外补出已经出现过的板块；不得凭空添加原型切片之外的收尾模块。若模型想让底部更丰富，只能增加非信息性装饰，不能增加标题、卡片、列表、按钮、二维码或文字模块。

顶部头图硬规则：顶部头图不由模型生成。工具会在生成完成后，把用户上传的顶部头图原图逐像素拼到最上方。因此你绝对不要重绘、复刻、改写、裁剪、压缩、变形或生成任何顶部头图内容；当前输出只能从头图下方的正文/模块区域开始。头图比例为【${heroRatio}】。整个页面色调为【${tone}】，页面视觉氛围为【${mood}】，画面丰富生动，3D渲染的简约运营落地页风格。页面适配移动端，页面比较长，内容比较宽松。背景必须是统一、非常干净的纯色背景，不使用渐变，不增加独立散落装饰；装饰只允许出现在标题框内部、内容框内部或局部插画内部，不能破坏大背景的干净衔接。

字体字号、字间距、行间距、图标风格统一，整体简约透气，色彩和谐，色彩比较鲜艳。简洁中融入主题元素【${mood}】，元素生动细腻。

注意画面中可融入很小的图4的白色机器人形象元素（注意严格按照图4的形象，注意该形象为悬浮，无手无脚无腿，请严格参考，并参考画面的主题和需求给该形象赋予职业和行为，要求每一个出现的机器角色的造型都严格参考参考图，但是装束和行为不同。注意该形象可以出现至多3个，大小要有明确区分，可以产生互动，也可以不出现）
严格按照图4的造型和细节。新增的 ROBOT_SHAPE_REFERENCE_ONLY 图片与图4并列，仅用于锁定白色机器人造型和细节，不作为页面内容模块，不参考其背景。${brandSafetyGuide}${segmentGuide}`;
}

async function fetchOpenAI(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1400));
    }
  }
  throw lastError;
}

async function appendReferenceImages(form, body, segmentIndex, firstSegmentStyleLock, safeMode = false) {
  const sessionId = body.uploadSessionId || "";
  const prototypeRef = Array.isArray(body.prototypeSegmentRefs) ? body.prototypeSegmentRefs[segmentIndex] : "";
  const prototypeSegment = Array.isArray(body.prototypeSegments) ? body.prototypeSegments[segmentIndex] : "";
  const prototype = prototypeRef
    ? await uploadedRefToBlob(prototypeRef, sessionId, `ONLY_CONTENT_PROTOTYPE_SEGMENT_${segmentIndex + 1}`)
    : prototypeSegment
    ? dataUrlToBlob(prototypeSegment, `ONLY_CONTENT_PROTOTYPE_SEGMENT_${segmentIndex + 1}`)
    : body.prototypeImage
    ? dataUrlToBlob(body.prototypeImage, "ONLY_CONTENT_PROTOTYPE_REFERENCE")
    : await fileToBlob(defaultPrototypePath, "image/png", "ONLY_CONTENT_PROTOTYPE_REFERENCE.png");
  form.append("image[]", prototype.blob, prototype.filename);

  if (segmentIndex > 0 && firstSegmentStyleLock) {
    form.append(
      "image[]",
      new Blob([firstSegmentStyleLock.bytes], { type: firstSegmentStyleLock.mime }),
      firstSegmentStyleLock.filename
    );
  }

  const robotReferenceImages = Array.isArray(body.robotReferenceImages) ? body.robotReferenceImages.slice(0, 6) : [];
  if (robotReferenceImages.length) {
    for (const [index, image] of robotReferenceImages.entries()) {
      const robotRef = dataUrlToBlob(image, `ROBOT_SHAPE_REFERENCE_ONLY_${index + 1}`);
      form.append("image[]", robotRef.blob, robotRef.filename);
    }
  } else {
    for (const [index, refPath] of defaultRobotRefPaths.entries()) {
      if (!existsSync(refPath)) continue;
      form.append(
        "image[]",
        (await fileToBlob(refPath, "image/png", `ROBOT_SHAPE_REFERENCE_ONLY_${index + 1}.png`)).blob,
        `ROBOT_SHAPE_REFERENCE_ONLY_${index + 1}.png`
      );
    }
  }

  if (safeMode) return;

  for (const [index, refPath] of styleRefs.entries()) {
    if (!existsSync(refPath)) throw new Error(`固定参考图 ${index + 1} 缺失。`);
    const extension = path.extname(refPath).toLowerCase();
    const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
    form.append(
      "image[]",
      (await fileToBlob(refPath, mime, `STYLE_ONLY_DO_NOT_COPY_CONTENT_${index + 1}${extension}`)).blob,
      `STYLE_ONLY_DO_NOT_COPY_CONTENT_${index + 1}${extension}`
    );
  }
}

function isPolicyError(status, result) {
  const message = String(result?.error?.message || result?.error || "").toLowerCase();
  const code = String(result?.error?.code || result?.error?.type || "").toLowerCase();
  return status === 400 && (
    message.includes("policy") ||
    message.includes("safety") ||
    message.includes("violat") ||
    code.includes("policy") ||
    code.includes("safety")
  );
}

function isImageUrlError(result) {
  const message = String(result?.error?.message || result?.error || "").toLowerCase();
  return message.includes("get image url failed") || message.includes("image url failed");
}

function isGatewayTimeoutError(status, result) {
  const message = String(result?.error?.message || result?.error || "").toLowerCase();
  const type = String(result?.error?.type || result?.error?.code || "").toLowerCase();
  return [502, 503, 504].includes(Number(status)) ||
    type.includes("non_json_upstream_response") ||
    message.includes("gateway time-out") ||
    message.includes("gateway timeout") ||
    message.includes("nginx") ||
    message.includes("504");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readUpstreamJson(response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const preview = trimmed.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 180);
    return {
      error: {
        message: `图片 API 返回了非 JSON 内容。请检查 API 接口地址是否正确，Base URL 应类似 https://api.openai.com/v1；返回预览：${preview || "空内容"}`,
        type: "non_json_upstream_response"
      }
    };
  }
}

async function requestImageEdit({
  apiBaseUrl,
  apiKey,
  model,
  prompt,
  size,
  quality,
  outputFormat,
  body,
  segmentIndex,
  firstSegmentStyleLock,
  safeMode,
  preferBase64 = false
}) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("output_format", outputFormat);
  if (preferBase64) form.append("response_format", "b64_json");
  await appendReferenceImages(form, body, segmentIndex, firstSegmentStyleLock, safeMode);

  const upstream = await fetchOpenAI(`${apiBaseUrl}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const result = await readUpstreamJson(upstream);
  return { upstream, result };
}

function makeHttpError(status, payload) {
  const error = new Error(payload?.error || "生成失败。");
  error.status = status;
  error.payload = payload;
  return error;
}

async function handleUploadImage(req, res) {
  try {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: "请先输入访问密码。" });
    const body = JSON.parse(await readBody(req));
    const sessionId = getSessionId(req) || "anonymous";
    const upload = dataUrlToUpload(body.dataUrl, body.kind || "upload");
    const refId = crypto.randomUUID();
    const filename = `${refId}.${upload.extension}`;
    const filePath = path.join(uploadDir, filename);
    await new Promise((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.on("finish", resolve);
      stream.on("error", reject);
      stream.end(upload.bytes);
    });
    uploadedImages.set(refId, {
      sessionId,
      filePath,
      mime: upload.mime,
      filename: upload.filename,
      createdAt: Date.now()
    });
    setTimeout(() => {
      uploadedImages.delete(refId);
    }, 2 * 60 * 60 * 1000);
    sendJson(res, 200, { refId, bytes: upload.bytes.length });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "上传失败。" });
  }
}

async function runGenerateJob(body, onProgress = () => {}) {
  const segmentCount = inferSegmentCount(body);
  const apiKey = String(body.apiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw makeHttpError(400, { error: "请填写 OpenAI API Key，或在服务端配置 OPENAI_API_KEY。" });

  const apiBaseUrl = normalizeBaseUrl(body.apiBaseUrl);
  const rules = await readFile(rulesPath, "utf8");
  const model = body.model || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2-1K";
  const size = body.size || "1024x1536";
  const quality = body.quality || "medium";
  const outputFormat = body.outputFormat || "png";
  const images = [];
  const runStyleGuide = buildRunStyleGuide(body.fields || {});
  let firstSegmentStyleLock = null;

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    onProgress(segmentIndex, segmentCount, `正在生成第 ${segmentIndex + 1}/${segmentCount} 段。`);
    let prompt = buildPrompt(body.fields || {}, rules, runStyleGuide, segmentIndex, segmentCount, false);
    let activeSafeMode = false;
    let { upstream, result } = await requestImageEdit({
      apiBaseUrl,
      apiKey,
      model,
      prompt,
      size,
      quality,
      outputFormat,
      body,
      segmentIndex,
      firstSegmentStyleLock,
      safeMode: false
    });
    if (!upstream.ok && isPolicyError(upstream.status, result)) {
      prompt = buildPrompt(body.fields || {}, rules, runStyleGuide, segmentIndex, segmentCount, true);
      activeSafeMode = true;
      ({ upstream, result } = await requestImageEdit({
        apiBaseUrl,
        apiKey,
        model,
        prompt,
        size,
        quality,
        outputFormat,
        body,
        segmentIndex,
        firstSegmentStyleLock,
        safeMode: true
      }));
    }
    if (!upstream.ok && isImageUrlError(result)) {
      ({ upstream, result } = await requestImageEdit({
        apiBaseUrl,
        apiKey,
        model,
        prompt,
        size,
        quality,
        outputFormat,
        body,
        segmentIndex,
        firstSegmentStyleLock,
        safeMode: activeSafeMode,
        preferBase64: true
      }));
    }
    for (let retry = 1; !upstream.ok && isGatewayTimeoutError(upstream.status, result) && retry <= 2; retry += 1) {
      onProgress(
        segmentIndex,
        segmentCount,
        `第 ${segmentIndex + 1}/${segmentCount} 段图片接口超时，正在自动重试 ${retry}/2。`
      );
      await delay(2500 * retry);
      ({ upstream, result } = await requestImageEdit({
        apiBaseUrl,
        apiKey,
        model,
        prompt,
        size,
        quality,
        outputFormat,
        body,
        segmentIndex,
        firstSegmentStyleLock,
        safeMode: activeSafeMode,
        preferBase64: true
      }));
    }
    if (!upstream.ok) {
      throw makeHttpError(upstream.status, {
        error: isGatewayTimeoutError(upstream.status, result)
          ? "图片接口网关超时，已自动重试但仍失败。请稍后再试，或改用更稳定的官方 OpenAI Base URL。"
          : result?.error?.message || "OpenAI 图片生成失败。",
        raw: result
      });
    }

    const firstImage = result?.data?.[0] || {};
    const imageBase64 = firstImage.b64_json || firstImage.base64 || firstImage.image_base64;
    const imageUrl = firstImage.url || firstImage.image_url;
    if (!imageBase64 && imageUrl) {
      try {
        const imageResponse = await fetchOpenAI(imageUrl, { method: "GET" }, 2);
        if (!imageResponse.ok) throw new Error(`下载远程结果图失败：${imageResponse.status}`);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const id = crypto.randomUUID();
        const filename = `${id}-part-${segmentIndex + 1}.${outputFormat}`;
        const filePath = path.join(outputDir, filename);
        const bytes = Buffer.from(arrayBuffer);
        await new Promise((resolve, reject) => {
          const stream = createWriteStream(filePath);
          stream.on("finish", resolve);
          stream.on("error", reject);
          stream.end(bytes);
        });
        const localBase64 = bytes.toString("base64");
        if (segmentIndex === 0) {
          firstSegmentStyleLock = {
            bytes,
            mime: `image/${outputFormat}`,
            filename: `FIRST_SEGMENT_STYLE_LOCK_VISUAL_ONLY_IGNORE_TEXT.${outputFormat}`
          };
        }
        images.push({
          image: `data:image/${outputFormat};base64,${localBase64}`,
          downloadUrl: `/outputs/${filename}`,
          segment: segmentIndex + 1
        });
      } catch {
        images.push({ image: imageUrl, downloadUrl: imageUrl, segment: segmentIndex + 1 });
      }
      onProgress(segmentIndex + 1, segmentCount, `第 ${segmentIndex + 1}/${segmentCount} 段完成。`);
      continue;
    }
    if (!imageBase64) {
      throw makeHttpError(502, {
        error: `接口没有返回可识别的图片数据。返回字段：${Object.keys(firstImage).join(", ") || "无"}`,
        raw: result
      });
    }

    const id = crypto.randomUUID();
    const filename = `${id}-part-${segmentIndex + 1}.${outputFormat}`;
    const filePath = path.join(outputDir, filename);
    const bytes = Buffer.from(imageBase64, "base64");
    await new Promise((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.on("finish", resolve);
      stream.on("error", reject);
      stream.end(bytes);
    });
    if (segmentIndex === 0) {
      firstSegmentStyleLock = {
        bytes,
        mime: `image/${outputFormat}`,
        filename: `FIRST_SEGMENT_STYLE_LOCK_VISUAL_ONLY_IGNORE_TEXT.${outputFormat}`
      };
    }
    images.push({
      image: `data:image/${outputFormat};base64,${imageBase64}`,
      downloadUrl: `/outputs/${filename}`,
      segment: segmentIndex + 1
    });
    onProgress(segmentIndex + 1, segmentCount, `第 ${segmentIndex + 1}/${segmentCount} 段完成。`);
  }

  return { images, segmentCount, model };
}

async function handleGenerate(req, res) {
  try {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: "请先输入访问密码。" });
    const body = JSON.parse(await readBody(req));
    const segmentCount = inferSegmentCount(body);
    if (!checkUsage(req, segmentCount)) {
      return sendJson(res, 429, { error: `今日生成次数不足。本次需要 ${segmentCount} 次额度，单日上限为 ${dailyLimit} 次。` });
    }
    body.uploadSessionId = getSessionId(req) || "anonymous";

    const jobId = crypto.randomUUID();
    const sessionId = getSessionId(req) || "anonymous";
    const job = {
      id: jobId,
      sessionId,
      status: "queued",
      progress: 0,
      total: segmentCount,
      message: "任务已创建，正在排队生成。",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    generationJobs.set(jobId, job);
    setTimeout(() => generationJobs.delete(jobId), 2 * 60 * 60 * 1000);

    runGenerateJob(body, (progress, total, message) => {
      Object.assign(job, {
        status: "running",
        progress,
        total,
        message,
        updatedAt: Date.now()
      });
    }).then((result) => {
      Object.assign(job, {
        status: "done",
        progress: result.segmentCount,
        total: result.segmentCount,
        message: "生成完成。",
        result,
        updatedAt: Date.now()
      });
    }).catch((error) => {
      const cause = error.cause?.code || error.cause?.message;
      const detail = cause ? `${error.message}（${cause}）` : error.message;
      Object.assign(job, {
        status: "error",
        message: detail || "服务器处理失败。",
        error: detail || "服务器处理失败。",
        errorStatus: error.status || 500,
        raw: error.payload?.raw,
        updatedAt: Date.now()
      });
    });

    sendJson(res, 202, { jobId, segmentCount, status: job.status, message: job.message });
  } catch (error) {
    const cause = error.cause?.code || error.cause?.message;
    const detail = cause ? `${error.message}（${cause}）` : error.message;
    sendJson(res, 500, { error: detail || "服务器处理失败。" });
  }
}

function handleGenerateStatus(req, res, jobId) {
  if (!isAuthorized(req)) return sendJson(res, 401, { error: "请先输入访问密码。" });
  const job = generationJobs.get(jobId);
  if (!job) return sendJson(res, 404, { error: "生成任务不存在或已过期。" });
  const sessionId = getSessionId(req) || "anonymous";
  if (job.sessionId !== sessionId) return sendJson(res, 403, { error: "无权查看该生成任务。" });
  if (job.status === "done") {
    return sendJson(res, 200, { status: job.status, ...job.result });
  }
  if (job.status === "error") {
    return sendJson(res, job.errorStatus || 500, {
      status: job.status,
      error: job.error || job.message || "生成失败。",
      raw: job.raw
    });
  }
  sendJson(res, 200, {
    status: job.status,
    progress: job.progress,
    total: job.total,
    message: job.message
  });
}

async function handleUnlock(req, res) {
  try {
    if (!accessPassword) return sendJson(res, 200, { ok: true });
    const body = JSON.parse(await readBody(req));
    if (String(body.password || "") !== accessPassword) return sendJson(res, 401, { error: "访问密码不正确。" });
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { createdAt: Date.now() });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `landing_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    sendJson(res, 500, { error: error.message || "解锁失败。" });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  let filePath;
  if (pathname.startsWith("/outputs/")) {
    filePath = path.join(outputDir, pathname.replace("/outputs/", ""));
  } else if (pathname === "/LANDING_PAGE_TYPE_RULES.md") {
    filePath = rulesPath;
  } else {
    const safePath = pathname === "/" ? "/index.html" : pathname;
    filePath = path.join(publicDir, safePath);
  }
  if (!filePath.startsWith(publicDir) && !filePath.startsWith(outputDir) && filePath !== rulesPath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": [".html", ".js", ".css"].includes(extension) ? "no-store" : "public, max-age=300"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/unlock") {
    await handleUnlock(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/upload-image") {
    await handleUploadImage(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/auth-status") {
    sendJson(res, 200, { locked: Boolean(accessPassword), authorized: isAuthorized(req) });
    return;
  }
  if (req.method === "POST" && req.url === "/api/generate") {
    await handleGenerate(req, res);
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/generate/")) {
    handleGenerateStatus(req, res, decodeURIComponent(req.url.replace("/api/generate/", "")));
    return;
  }
  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, host, () => {
  if (process.stdout?.writable) {
    process.stdout.write(`Landing page generator running at http://127.0.0.1:${port}\n`);
  }
});

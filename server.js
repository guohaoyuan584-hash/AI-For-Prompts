const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = __dirname;
const PORT = process.env.PORT || 3000;
const ENTRY_FILE = path.join(ROOT_DIR, "flysmallpig-prompt-ai.html");
const OPENAI_MODEL = "gpt-5-nano";
const DEFAULT_RESULT = {
  summary:
    "Start a new session and describe an image idea. The AI will point out what is missing before building a fuller prompt.",
  finalPrompt: "No final prompt yet.",
  negativePrompt: "No negative prompt yet.",
  why: "The final explanation will appear here after the prompt is refined.",
};
const FIELD_DEFINITIONS = [
  {
    key: "subject",
    labelEn: "subject",
    labelZh: "主体",
    questionEn: "What is the main subject or character in the image?",
    questionZh: "这张图的主体到底是什么，或者是谁？",
  },
  {
    key: "style",
    labelEn: "style",
    labelZh: "风格",
    questionEn: "What style should it follow: anime, realistic, painterly, 3D, or something else?",
    questionZh: "你想要什么风格，比如二次元、写实、插画感、3D，还是别的风格？",
  },
  {
    key: "shotType",
    labelEn: "shot type",
    labelZh: "景别或构图",
    questionEn: "Should the image be a close-up, half-body, full-body, or a wide scene?",
    questionZh: "你想要特写、半身、全身，还是更大的场景构图？",
  },
  {
    key: "scene",
    labelEn: "scene or background",
    labelZh: "场景或背景",
    questionEn: "What kind of background should it have: simple, street, indoor, nature, beach, or something else?",
    questionZh: "背景想放在什么地方，比如纯背景、街道、室内、自然、海边，还是别的场景？",
  },
  {
    key: "lighting",
    labelEn: "lighting",
    labelZh: "光线",
    questionEn: "What lighting should it have: soft daylight, sunset glow, neon, dramatic shadow, or something else?",
    questionZh: "光线想要什么感觉，比如柔和白天、夕阳逆光、霓虹灯、强烈阴影，还是别的效果？",
  },
  {
    key: "mood",
    labelEn: "mood",
    labelZh: "氛围",
    questionEn: "What overall feeling should it have: dreamy, soft, cool, dramatic, cute, calm, or realistic?",
    questionZh: "整体氛围想要什么感觉，比如梦幻、柔和、冷感、戏剧化、可爱、平静，还是更真实？",
  },
];
const STYLE_RECOMMENDATION_GROUPS = [
  {
    key: "anime",
    triggers: ["anime", "manga", "二次元", "动漫", "动画", "美少女", "少女", "立绘", "gal"],
    options: [
      "日系动画风 / Japanese anime style",
      "梦幻唯美二次元 / dreamy anime illustration",
      "清新校园动画风 / soft school anime illustration",
      "电影感动画分镜 / cinematic anime frame",
      "90年代复古动画感 / 90s anime aesthetic",
      "赛璐璐上色风格 / cel-shaded anime",
    ],
  },
  {
    key: "illustration",
    triggers: ["插画", "illustration", "绘本", "平面", "vector", "海报插画", "扁平"],
    options: [
      "平面插画风 / flat illustration",
      "编辑插画风 / editorial illustration",
      "矢量插画风 / vector illustration",
      "厚涂数字插画 / painterly digital illustration",
      "水彩插画风 / watercolor illustration",
      "剪纸拼贴风 / cut-paper collage illustration",
    ],
  },
  {
    key: "photography",
    triggers: ["photo", "photography", "写实", "摄影", "人像", "portrait", "realistic"],
    options: [
      "写实摄影风 / photorealistic photography",
      "电影剧照风 / cinematic still",
      "时尚杂志摄影 / editorial fashion photography",
      "生活方式摄影 / lifestyle photography",
      "胶片摄影风 / analog film photography",
      "棚拍人像风 / studio portrait photography",
    ],
  },
  {
    key: "sci-fi",
    triggers: ["赛博", "cyberpunk", "未来", "科技", "科幻", "neon", "robot", "太空"],
    options: [
      "赛博朋克风 / cyberpunk",
      "未来科技感 / futuristic sci-fi",
      "霓虹都市风 / neon cityscape",
      "太空歌剧风 / space opera visual",
      "机械设定感 / mech concept art",
      "复古未来主义 / retrofuturism",
    ],
  },
  {
    key: "fantasy",
    triggers: ["奇幻", "梦境", "魔法", "神话", "fantasy", "magic", "fairytale"],
    options: [
      "史诗奇幻风 / epic fantasy illustration",
      "黑暗奇幻风 / dark fantasy art",
      "童话梦境风 / fairytale dreamscape",
      "超现实梦境风 / surreal dreamlike art",
      "魔法森林氛围 / magical forest illustration",
      "神话史诗感 / mythic fantasy visual",
    ],
  },
  {
    key: "interior",
    triggers: ["室内", "客厅", "卧室", "厨房", "空间", "interior", "living room", "room design"],
    options: [
      "现代极简风 / modern minimalist interior",
      "北欧风 / scandinavian interior",
      "侘寂风 / wabi-sabi interior",
      "日式北欧融合 / japandi interior",
      "工业风 / industrial loft interior",
      "中古现代风 / mid-century modern interior",
    ],
  },
  {
    key: "product",
    triggers: ["产品", "包装", "香水", "手机", "瓶子", "product", "cosmetic", "watch"],
    options: [
      "白底产品棚拍 / clean studio product shot",
      "悬浮海报感 / floating product hero shot",
      "生活方式产品图 / lifestyle product photography",
      "平铺展示图 / flat-lay product shot",
      "微距细节图 / macro product detail",
      "高端商业广告感 / premium commercial ad",
    ],
  },
  {
    key: "poster",
    triggers: ["海报", "poster", "封面", "宣传", "视觉设计", "banner"],
    options: [
      "电影海报感 / cinematic poster art",
      "极简品牌视觉 / minimalist brand visual",
      "复古旅行海报 / retro travel poster",
      "瑞士平面风 / swiss design poster",
      "装饰艺术海报 / art deco poster",
      "未来感宣传海报 / futuristic promo poster",
    ],
  },
];
const GENERIC_STYLE_OPTIONS = [
  "电影感插画 / cinematic illustration",
  "柔和梦幻风 / dreamy soft illustration",
  "写实摄影风 / photorealistic photography",
  "平面插画风 / flat illustration",
  "现代极简风 / modern minimalist style",
  "高质感商业视觉 / premium commercial visual",
];
const STYLE_EXPANSION_RULES = [
  {
    triggers: ["素写", "速写", "sketch", "line art", "线稿", "线条", "drawing"],
    options: [
      "手绘线稿风 / hand-drawn line art",
      "铅笔素描风 / pencil sketch",
      "炭笔速写风 / charcoal sketch",
      "黑白线描插画 / monochrome line illustration",
      "速写本手稿感 / sketchbook style",
      "轻水彩线稿风 / ink-and-wash sketch",
    ],
  },
  {
    triggers: ["水彩", "watercolor", "水粉", "gouache"],
    options: [
      "透明水彩风 / transparent watercolor",
      "柔和彩绘风 / soft watercolor illustration",
      "纸张纹理水彩 / textured watercolor paper look",
      "清新绘本水彩 / storybook watercolor style",
      "水彩线稿融合 / watercolor with ink outlines",
      "淡彩手绘风 / light wash painting style",
    ],
  },
  {
    triggers: ["油画", "oil painting", "厚涂", "impasto", "painterly"],
    options: [
      "油画笔触风 / oil-painting brushwork",
      "厚涂数字绘画 / painterly digital illustration",
      "古典油画感 / classical oil painting feel",
      "印象派色块风 / impressionist color blocks",
      "高质感笔触插画 / richly textured painterly art",
      "博物馆画布质感 / museum canvas texture look",
    ],
  },
  {
    triggers: ["二次元", "动漫", "anime", "manga", "动画", "美少女"],
    options: [
      "日系动画风 / Japanese anime style",
      "梦幻唯美二次元 / dreamy anime illustration",
      "清新校园动画风 / soft school anime illustration",
      "电影感动画分镜 / cinematic anime frame",
      "90年代复古动画感 / 90s anime aesthetic",
      "赛璐璐上色风格 / cel-shaded anime",
    ],
  },
  {
    triggers: ["写实", "photography", "photo", "摄影", "realistic", "portrait"],
    options: [
      "写实摄影风 / photorealistic photography",
      "电影剧照风 / cinematic still",
      "时尚杂志摄影 / editorial fashion photography",
      "胶片摄影风 / analog film photography",
      "自然纪实感 / documentary-style realism",
      "棚拍人像风 / studio portrait photography",
    ],
  },
  {
    triggers: ["室内", "interior", "空间", "客厅", "room design"],
    options: [
      "现代极简风 / modern minimalist interior",
      "北欧风 / scandinavian interior",
      "侘寂风 / wabi-sabi interior",
      "日式北欧融合 / japandi interior",
      "工业风 / industrial loft interior",
      "中古现代风 / mid-century modern interior",
    ],
  },
  {
    triggers: ["赛博", "cyberpunk", "未来", "科技", "科幻", "sci-fi"],
    options: [
      "赛博朋克风 / cyberpunk",
      "未来科技感 / futuristic sci-fi",
      "霓虹都市风 / neon cityscape",
      "复古未来主义 / retrofuturism",
      "太空歌剧视觉 / space-opera visual",
      "机械设定感 / mech concept art",
    ],
  },
  {
    triggers: ["废土", "末日", "post-apocalyptic", "wasteland", "dystopian", "survival", "荒原"],
    options: [
      "废土末日风 / post-apocalyptic wasteland",
      "生存主义视觉 / survivalist dystopian visual",
      "核后荒原感 / nuclear wasteland aesthetic",
      "锈蚀工业残骸风 / rusted industrial ruins",
      "破败未来废墟风 / ruined future dystopia",
      "公路废土电影感 / wasteland road-movie cinematic style",
    ],
  },
];

loadDotEnv();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/refine") {
      return await handleRefine(req, res);
    }

    return serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Unexpected server error." });
  }
});

server.listen(PORT, () => {
  console.log(`AI for Prompts running at http://localhost:${PORT}`);
});

function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(text);
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/flysmallpig-prompt-ai.html" : req.url;
  const safePath = path.normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT_DIR, safePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    return sendText(res, 403, "Forbidden");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendText(res, 404, "Not Found");
  }

  const data = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": mimeTypeFor(filePath) });
  res.end(data);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildTranscript(messages) {
  return messages
    .map((message) => {
      const speaker = message.role === "user" ? "User" : "Assistant";
      const imageNote =
        Array.isArray(message.attachments) && message.attachments.length
          ? ` [attached ${message.attachments.length} reference image(s)]`
          : "";
      return `${speaker}: ${message.text}${imageNote}`;
    })
    .join("\n");
}

function collectImageInputs(messages) {
  return messages.flatMap((message) => {
    if (!Array.isArray(message.attachments)) return [];
    return message.attachments
      .filter(
        (attachment) =>
          attachment &&
          typeof attachment.dataUrl === "string"
      )
      .map((attachment) => ({
        type: "image_url",
        image_url: {
          url: attachment.dataUrl,
          detail: "low",
        },
      }));
  });
}

function buildOpenAIInput(messages, promptText) {
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: promptText,
        },
        ...collectImageInputs(messages),
      ],
    },
  ];
}

function buildFinalPromptRequest({
  messages,
  mode,
  refinementCount,
  language,
  firstFields,
  allFields,
  missingAfterFollowup,
}) {
  const firstProvided = getFilledFieldKeys(firstFields);
  const afterFollowupProvided = getFilledFieldKeys(allFields);
  const followupAdded = afterFollowupProvided.filter(
    (key) => !firstProvided.includes(key)
  );
  const autoFillKeys = [...missingAfterFollowup];
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.text || "";
  const languageInstruction =
    language === "zh"
      ? "Use Simplified Chinese for assistantMessage, result.summary, and result.why."
      : "Use English for assistantMessage, result.summary, and result.why.";

  return `
You are "AI for Prompts", a prompt-refining assistant for people who are not prompt experts.

Your job:
- Help the user turn a rough image idea into a stable image prompt.
- Support illustrations, anime art, photography-style images, cinematic stills, posters, and other visual images with little or no text.
- Always write result.finalPrompt and result.negativePrompt in English because they are meant for image models.
- ${languageInstruction}

Current conversation phase:
- This is the finalization phase.
- Do not ask more questions.
- If some details are still missing, auto-fill them based on context and say so clearly in the summary.
- If mode is "refine_again", keep the same concept but make the final prompt a little stronger and more polished.

Preferred prompt structure:
1. scene or background
2. main subject
3. subject traits
4. action or state
5. style or medium
6. framing, shot, or angle
7. lighting, color, or mood
8. detail boosters
9. constraints

Output rules:
- Return JSON only.
- The JSON schema must be:
{
  "assistantMessage": "string",
  "status": "waiting_followup" | "complete",
  "result": {
    "summary": "string",
    "finalPrompt": "string",
    "negativePrompt": "string",
    "why": "string"
  }
}
- Set status to "complete".
- Keep negativePrompt concise and comma-separated.
- In result.summary, explicitly mention:
  - which key elements were already given in the first message,
  - which details were added in the follow-up,
  - which details were still missing and were auto-filled.
- In assistantMessage, explicitly tell the user:
  - which details they added in the second round,
  - which details were still missing,
  - that you auto-filled the remaining gaps.
- In result.why, explain the final prompt using this order:
  scene/background -> subject and subject traits -> action/state -> style/medium -> framing/shot/angle -> lighting/mood -> detail boosters -> constraints.

Current mode: ${mode}
Current refinement count: ${refinementCount}
Latest user message:
${latestUserMessage}

Detected fields from first message:
${JSON.stringify(firstFields, null, 2)}

Detected fields after follow-up:
${JSON.stringify(allFields, null, 2)}

Fields already present in the first message:
${JSON.stringify(firstProvided)}

Fields added by the user after the follow-up:
${JSON.stringify(followupAdded)}

Fields still missing after the follow-up and should be auto-filled:
${JSON.stringify(autoFillKeys)}

Conversation transcript:
${buildTranscript(messages)}
`.trim();
}

function buildQuestionAnswerRequest({
  messages,
  language,
  knownFields,
  missingKeys,
}) {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.text || "";
  const languageInstruction =
    language === "zh"
      ? "Use Simplified Chinese for assistantMessage, result.summary, and result.why."
      : "Use English for assistantMessage, result.summary, and result.why.";

  return `
You are "AI for Prompts", a prompt-refining assistant for beginners.

Your job in this turn:
- The user is asking a prompt-related question or wants clarification.
- Answer the user's question directly and helpfully.
- Do not finalize the prompt yet.
- Stay inside the refinement flow and keep the conversation open.
- If useful, end with 1 short sentence telling the user what kind of detail they can send next.
- ${languageInstruction}
- Always keep result.finalPrompt as "No final prompt yet."
- Always keep result.negativePrompt as "No negative prompt yet."
- Always keep result.why as "The final explanation will appear here after the prompt is refined."

Context:
- Known fields so far: ${JSON.stringify(knownFields, null, 2)}
- Missing fields so far: ${JSON.stringify(missingKeys)}

Output JSON only in this schema:
{
  "assistantMessage": "string",
  "status": "waiting_followup",
  "result": {
    "summary": "string",
    "finalPrompt": "No final prompt yet.",
    "negativePrompt": "No negative prompt yet.",
    "why": "The final explanation will appear here after the prompt is refined."
  }
}

Conversation transcript:
${buildTranscript(messages)}

Latest user message:
${latestUserMessage}
`.trim();
}

function buildAnalysisRequest({
  messages,
  language,
  detectedFields,
  missingKeys,
}) {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.text || "";
  const languageInstruction =
    language === "zh"
      ? "Use Simplified Chinese for assistantMessage and result.summary."
      : "Use English for assistantMessage and result.summary.";

  return `
You are "AI for Prompts", a prompt-refining assistant for beginners.

This is the first analysis turn.

Your job:
- Read the user's first image idea carefully.
- Keep the answer concise and natural.
- Briefly say that a stable image prompt usually includes: scene, subject, style, framing, lighting, details, and constraints.
- Briefly mention what the user already provided.
- Briefly mention what is still missing.
- Most importantly, recommend 4 to 6 style directions that are very close to the user's wording, theme, and visual intent.
- The style suggestions must stay near the user's phrase, not drift into broad unrelated categories.
- Do not provide large lighting or framing recommendation lists.
- End by inviting the user to continue with style, framing, or lighting details.
- ${languageInstruction}

Important output rules:
- Keep status as "waiting_followup".
- Keep result.finalPrompt as "No final prompt yet."
- Keep result.negativePrompt as "No negative prompt yet."
- Keep result.why as "The final explanation will appear here after the prompt is refined."
- Style suggestions should be bilingual when possible: Chinese / English.

Detected fields so far:
${JSON.stringify(detectedFields, null, 2)}

Missing fields so far:
${JSON.stringify(missingKeys)}

Return JSON only in this schema:
{
  "assistantMessage": "string",
  "status": "waiting_followup",
  "result": {
    "summary": "string",
    "finalPrompt": "No final prompt yet.",
    "negativePrompt": "No negative prompt yet.",
    "why": "The final explanation will appear here after the prompt is refined."
  }
}

Conversation transcript:
${buildTranscript(messages)}

Latest user message:
${latestUserMessage}
`.trim();
}

function inferStyleGroup(text) {
  const lowered = text.toLowerCase();
  const matched = STYLE_RECOMMENDATION_GROUPS.find((group) =>
    group.triggers.some((trigger) => lowered.includes(trigger))
  );
  return matched || null;
}

function looksLikeQuestion(text) {
  const lowered = text.toLowerCase().trim();
  if (!lowered) return false;
  if (/[?？]$/.test(lowered) || /[?？]/.test(lowered)) return true;
  const patterns = [
    "什么",
    "怎么",
    "如何",
    "为什么",
    "哪些",
    "哪个",
    "是不是",
    "吗",
    "呢",
    "可不可以",
    "能不能",
    "what",
    "how",
    "why",
    "which",
    "can i",
    "could you",
    "should i",
    "do i need",
  ];
  return patterns.some((pattern) => lowered.includes(pattern));
}

function recommendationListToText(options, language, limit = 5) {
  return options
    .slice(0, limit)
    .map((option, index) =>
      language === "zh" ? `${index + 1}. ${option}` : `${index + 1}. ${option}`
    )
    .join("\n");
}

function getStyleRecommendations(text) {
  const lowered = text.toLowerCase();
  const directMatch = STYLE_EXPANSION_RULES.find((rule) =>
    rule.triggers.some((trigger) => lowered.includes(trigger))
  );
  if (directMatch) return directMatch.options;
  return inferStyleGroup(text)?.options || GENERIC_STYLE_OPTIONS;
}

function detectLanguage(messages) {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.text || "";
  return /[\u4e00-\u9fff]/.test(latestUserMessage) ? "zh" : "en";
}

function cleanIdea(text) {
  return text
    .trim()
    .replace(
      /^i\s+(want|need|would like)\s+(to\s+create|to\s+make|to\s+generate)?\s*/i,
      ""
    )
    .replace(/^make\s+me\s+/i, "")
    .replace(/^create\s+/i, "")
    .replace(/^generate\s+/i, "")
    .trim();
}

function detectByKeywords(text, mapping) {
  const lowered = text.toLowerCase();
  const matched = mapping.find((item) =>
    item.keywords.some((keyword) => lowered.includes(keyword))
  );
  return matched ? matched.value : "";
}

function extractFieldsFromText(text, existingFields = emptyFields()) {
  const lowered = text.toLowerCase();
  const next = { ...existingFields };
  const cleaned = cleanIdea(text);

  if (cleaned) {
    if (!next.subject) {
      next.subject = cleaned;
    } else if (!next.subject.toLowerCase().includes(cleaned.toLowerCase())) {
      next.subject = `${next.subject}, ${cleaned}`;
    }
  }

  if (!next.style) {
    next.style = detectByKeywords(text, [
      { value: "hand-drawn sketch illustration", keywords: ["素写", "速写", "sketch", "line art", "线稿", "线条", "drawing"] },
      { value: "anime illustration", keywords: ["anime", "manga", "2d", "anime-style", "二次元", "动漫"] },
      { value: "photorealistic photography", keywords: ["photo", "photography", "photorealistic", "realistic photo", "摄影", "写实"] },
      { value: "digital illustration", keywords: ["illustration", "digital art", "poster", "插画", "海报"] },
      { value: "cinematic illustration", keywords: ["cinematic", "film still", "电影感"] },
      { value: "3d render", keywords: ["3d", "render", "cgi"] },
      { value: "watercolor illustration", keywords: ["watercolor", "水彩"] },
    ]);
  }

  if (!next.shotType) {
    next.shotType = detectByKeywords(text, [
      { value: "close-up portrait", keywords: ["close-up", "close up", "portrait", "headshot", "特写"] },
      { value: "half-body shot", keywords: ["half-body", "half body", "medium shot", "waist up", "半身"] },
      { value: "full-body shot", keywords: ["full-body", "full body", "全身"] },
      { value: "wide scene", keywords: ["wide shot", "wide view", "landscape view", "远景", "大全景"] },
      { value: "top-down view", keywords: ["top-down", "top down", "bird's-eye", "birds-eye", "俯视"] },
    ]);
  }

  if (!next.scene) {
    next.scene = detectByKeywords(text, [
      { value: "a beach setting", keywords: ["beach", "sea", "ocean", "coast", "海边", "海滩"] },
      { value: "a quiet city street", keywords: ["street", "city", "urban", "街道", "城市"] },
      { value: "an indoor room", keywords: ["room", "indoor", "bedroom", "cafe", "studio", "室内", "房间"] },
      { value: "a natural outdoor setting", keywords: ["forest", "nature", "garden", "field", "mountain", "自然", "森林"] },
      { value: "a classroom setting", keywords: ["classroom", "school", "教室", "校园"] },
      { value: "a simple clean background", keywords: ["simple background", "plain background", "clean background", "纯背景"] },
    ]);
  }

  if (!next.lighting) {
    next.lighting = detectByKeywords(text, [
      { value: "soft daylight", keywords: ["daylight", "soft light", "soft lighting", "白天", "柔光"] },
      { value: "sunset backlighting", keywords: ["sunset", "golden hour", "backlight", "backlighting", "夕阳", "逆光"] },
      { value: "neon lighting", keywords: ["neon", "霓虹"] },
      { value: "dramatic shadows", keywords: ["dramatic", "high contrast", "shadow", "戏剧化", "强对比"] },
      { value: "moonlit night lighting", keywords: ["moonlight", "night", "夜晚", "月光"] },
    ]);
  }

  if (!next.mood) {
    next.mood = detectByKeywords(text, [
      { value: "dreamy", keywords: ["dreamy", "magical", "梦幻"] },
      { value: "soft", keywords: ["soft", "gentle", "柔和"] },
      { value: "cool", keywords: ["cool", "cold", "冷感"] },
      { value: "dramatic", keywords: ["dramatic", "intense", "戏剧"] },
      { value: "cute", keywords: ["cute", "adorable", "可爱"] },
      { value: "calm", keywords: ["calm", "peaceful", "平静"] },
      { value: "realistic", keywords: ["realistic", "natural", "真实"] },
    ]);
  }

  if ((lowered.includes("white-haired") || lowered.includes("white hair") || lowered.includes("白发")) && next.subject) {
    if (!next.subject.toLowerCase().includes("white-haired") && !next.subject.includes("白发")) {
      next.subject = `${next.subject}, white-haired`;
    }
  }

  return next;
}

function emptyFields() {
  return {
    subject: "",
    style: "",
    shotType: "",
    scene: "",
    lighting: "",
    mood: "",
  };
}

function getMissingFields(fields) {
  return FIELD_DEFINITIONS.filter((field) => !fields[field.key]).map(
    (field) => field.key
  );
}

function getFilledFieldKeys(fields) {
  return FIELD_DEFINITIONS.filter((field) => fields[field.key]).map(
    (field) => field.key
  );
}

function labelFor(fieldKey, language) {
  const field = FIELD_DEFINITIONS.find((item) => item.key === fieldKey);
  return language === "zh" ? field?.labelZh || fieldKey : field?.labelEn || fieldKey;
}

function questionFor(fieldKey, language) {
  const field = FIELD_DEFINITIONS.find((item) => item.key === fieldKey);
  return language === "zh"
    ? field?.questionZh || fieldKey
    : field?.questionEn || fieldKey;
}

function humanJoin(list, language) {
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (language === "zh") {
    return `${list.slice(0, -1).join("、")} 和 ${list[list.length - 1]}`;
  }
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function buildAnalysisResponseFallback(messages) {
  const language = detectLanguage(messages);
  const firstUserMessage = messages.find((message) => message.role === "user")?.text || "";
  const firstFields = extractFieldsFromText(firstUserMessage, emptyFields());
  const presentKeys = getFilledFieldKeys(firstFields);
  const missingKeys = getMissingFields(firstFields);
  const topMissing = missingKeys.slice(0, 3);
  const styleRecommendations = getStyleRecommendations(firstUserMessage);

  const keyElements =
    language === "zh"
      ? "一个更稳定的图片 prompt，通常会包含：场景、主体、风格、构图、光线、细节、约束。"
      : "A more stable image prompt usually includes: scene, subject, style, framing, lighting, details, and constraints.";
  const presentLine =
    presentKeys.length > 0
      ? language === "zh"
        ? `从你刚刚这句话里，我已经识别到：${humanJoin(
            presentKeys.map((key) => labelFor(key, language)),
            language
          )}。`
        : `From your first message, I can already identify: ${humanJoin(
            presentKeys.map((key) => labelFor(key, language)),
            language
          )}.`
      : language === "zh"
        ? "你刚刚这句话还没有把主体和关键画面信息说清楚。"
        : "Your first message is still too broad to lock down the main image direction.";
  const missingLine =
    missingKeys.length > 0
      ? language === "zh"
        ? `目前还缺少：${humanJoin(
            missingKeys.map((key) => labelFor(key, language)),
            language
          )}。`
        : `The main missing pieces are: ${humanJoin(
            missingKeys.map((key) => labelFor(key, language)),
            language
          )}.`
      : language === "zh"
        ? "你的第一句话已经包含了主要信息，但我还是会做一次二次确认。"
        : "Your first message already contains most of the core details, but I will still do one confirmation round.";
  const questions = topMissing.length
    ? topMissing
        .map(
          (fieldKey, index) =>
            `${index + 1}. ${questionFor(fieldKey, language)}`
        )
        .join("\n")
    : language === "zh"
      ? "1. 你最想强调的细节是什么？\n2. 有没有一定不要出现的内容？"
      : "1. Which detail do you want the image to emphasize the most?\n2. Is there anything that must not appear?";
  const styleBlock =
    language === "zh"
      ? `你这句里已经带了一些风格方向，我建议你可以从这些相近风格里再挑一种继续细化：\n${recommendationListToText(
          styleRecommendations,
          language,
          5
        )}`
      : `Your message already points to a style direction. You can refine it further with one of these nearby style options:\n${recommendationListToText(
          styleRecommendations,
          language,
          5
        )}`;
  const detailHint =
    language === "zh"
      ? "细节强化、约束和 negative prompt 如果你没有特别说明，我会在后面自动补。"
      : "If you do not specify detail enhancement, constraints, or negative prompt, I will auto-fill them later.";

  const closing =
    language === "zh"
      ? "你可以这一轮继续补充风格、构图或光线，我会先理解你的意思，再决定是继续解释还是生成最终 prompt。"
      : "After your next reply, I will tell you what you added, what is still missing, and what I auto-filled for you.";

  return {
    assistantMessage: `${keyElements}\n\n${presentLine}\n${missingLine}\n\n${styleBlock}\n\n${questions}\n\n${detailHint}\n\n${closing}`,
    status: "waiting_followup",
    result: {
      summary:
        language === "zh"
          ? `首轮分析完成。你已经提供了${presentKeys.length ? humanJoin(
              presentKeys.map((key) => labelFor(key, language)),
              language
            ) : "少量基础信息"}，还缺少${missingKeys.length ? humanJoin(
              missingKeys.map((key) => labelFor(key, language)),
              language
            ) : "进一步确认信息"}。我已经根据你原句给了相近风格的推荐词。`
          : `First-pass analysis complete. You already provided ${
              presentKeys.length
                ? humanJoin(
                    presentKeys.map((key) => labelFor(key, language)),
                    language
                  )
                : "a small amount of starting information"
            }, and you are still missing ${
              missingKeys.length
                ? humanJoin(
                    missingKeys.map((key) => labelFor(key, language)),
                    language
                  )
                : "a final confirmation"
            }. I also suggested nearby style directions based on your original phrasing.`,
      finalPrompt: "No final prompt yet.",
      negativePrompt: "No negative prompt yet.",
      why: "The final explanation will appear here after the prompt is refined.",
    },
  };
}

async function callOpenAIForAnalysis({
  messages,
  language,
  detectedFields,
  missingKeys,
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Create a .env file with OPENAI_API_KEY=your_key and restart the server."
    );
  }

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: buildOpenAIInput(
          messages,
          buildAnalysisRequest({
            messages,
            language,
            detectedFields,
            missingKeys,
          })
        ),
        response_format: {
          type: "json_object",
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "OpenAI API request failed.";
    throw new Error(message);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return normalizeModelPayload(text);
}

async function callOpenAI({ messages, mode, refinementCount }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Create a .env file with OPENAI_API_KEY=your_key and restart the server."
    );
  }

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: buildOpenAIInput(
          messages,
          buildFinalPromptRequest({
            messages,
            mode,
            refinementCount,
            language: detectLanguage(messages),
            firstFields: extractFieldsFromText(
              messages.find((message) => message.role === "user")?.text || "",
              emptyFields()
            ),
            allFields: messages
              .filter((message) => message.role === "user")
              .reduce(
                (acc, message) => extractFieldsFromText(message.text, acc),
                emptyFields()
              ),
            missingAfterFollowup: (() => {
              const merged = messages
                .filter((message) => message.role === "user")
                .reduce(
                  (acc, message) => extractFieldsFromText(message.text, acc),
                  emptyFields()
                );
              return getMissingFields(merged);
            })(),
          })
        ),
        response_format: {
          type: "json_object",
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "OpenAI API request failed.";
    throw new Error(message);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return normalizeModelPayload(text);
}

async function callOpenAIForQuestion({ messages, language, knownFields, missingKeys }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Create a .env file with OPENAI_API_KEY=your_key and restart the server."
    );
  }

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: buildOpenAIInput(
          messages,
          buildQuestionAnswerRequest({
            messages,
            language,
            knownFields,
            missingKeys,
          })
        ),
        response_format: {
          type: "json_object",
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "OpenAI API request failed.";
    throw new Error(message);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return normalizeModelPayload(text);
}

function normalizeModelPayload(rawText) {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error("OpenAI returned JSON in an unexpected format.");
  }

  const status = parsed.status === "waiting_followup" ? "waiting_followup" : "complete";
  const result = {
    ...DEFAULT_RESULT,
    ...(parsed.result || {}),
  };

  if (status === "waiting_followup") {
    result.finalPrompt = "No final prompt yet.";
    result.negativePrompt = "No negative prompt yet.";
    result.why = "The final explanation will appear here after the prompt is refined.";
  }

  return {
    assistantMessage:
      parsed.assistantMessage ||
      (status === "waiting_followup"
        ? "I need a bit more detail before finalizing the prompt."
        : "I refined the prompt for you."),
    status,
    result,
  };
}

async function handleRefine(req, res) {
  try {
    const body = await readJsonBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const mode = body.mode === "refine_again" ? "refine_again" : "continue";
    const refinementCount = Number.isFinite(body.refinementCount)
      ? body.refinementCount
      : 0;

    if (!messages.length) {
      return sendJson(res, 400, { error: "No conversation messages were provided." });
    }

    const normalizedMessages = messages
      .filter((message) => message && typeof message.text === "string")
      .map((message) => ({
        role: message.role === "user" ? "user" : "assistant",
        text: message.text.trim(),
        attachments: Array.isArray(message.attachments)
          ? message.attachments
              .filter(
                (attachment) =>
                  attachment &&
                  typeof attachment.mimeType === "string" &&
                  typeof attachment.base64 === "string"
              )
              .slice(0, 4)
          : [],
      }))
      .filter(
        (message) => message.text || (message.attachments && message.attachments.length)
      );

    if (!normalizedMessages.length) {
      return sendJson(res, 400, { error: "No usable conversation messages were provided." });
    }

    const userMessages = normalizedMessages.filter((message) => message.role === "user");
    const latestUserMessage = [...userMessages].reverse()[0]?.text || "";
    const firstFields = extractFieldsFromText(userMessages[0]?.text || "", emptyFields());
    const allFields = userMessages.reduce(
      (acc, message) => extractFieldsFromText(message.text, acc),
      emptyFields()
    );
    const missingKeys = getMissingFields(allFields);
    const language = detectLanguage(normalizedMessages);

    if (mode === "continue" && userMessages.length === 1) {
      try {
        const analysisPayload = await callOpenAIForAnalysis({
          messages: normalizedMessages,
          language,
          detectedFields: firstFields,
          missingKeys: getMissingFields(firstFields),
        });
        return sendJson(res, 200, analysisPayload);
      } catch (error) {
        return sendJson(res, 200, buildAnalysisResponseFallback(normalizedMessages));
      }
    }

    if (mode === "continue" && looksLikeQuestion(latestUserMessage)) {
      const questionPayload = await callOpenAIForQuestion({
        messages: normalizedMessages,
        language,
        knownFields: allFields,
        missingKeys,
      });
      return sendJson(res, 200, questionPayload);
    }

    const modelPayload = await callOpenAI({
      messages: normalizedMessages,
      mode,
      refinementCount,
    });

    sendJson(res, 200, modelPayload);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "The refine request failed." });
  }
}

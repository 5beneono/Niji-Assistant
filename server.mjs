import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const ENV = await loadEnv(join(ROOT, ".env"));
const PORT = Number(process.env.PORT || ENV.PORT || 3000);
const HOST = process.env.HOST || ENV.HOST || "0.0.0.0";
const GEMINI_MODEL = process.env.GEMINI_MODEL || ENV.GEMINI_MODEL || "gemini-3.5-flash";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const LABELS = ["原文対応", "翻訳補完", "表現強化", "解釈追加", "分岐語", "要確認"];

function getAiClient(customKey) {
  const key = customKey || process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Gemini APIキーが設定されていません。画面上部からAPIキーを設定するか、サーバー環境にGEMINI_API_KEYを設定してください。");
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "POST" && url.pathname === "/api/generate-prompt") {
      await handleGeneratePrompt(request, response);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(url.pathname, response, request.method === "HEAD");
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Prompt Sketchbook: http://${HOST}:${PORT}/`);
});

async function handleGeneratePrompt(request, response) {
  try {
    const customKey = request.headers["x-gemini-api-key"];
    const ai = getAiClient(customKey);
    const payload = await readJsonBody(request);
    const schema = createResponseSchema(payload.task === "niji_prompt_revision");

    const geminiResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: JSON.stringify(payload, null, 2),
      config: {
        systemInstruction: createSystemInstruction(payload),
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const outputText = geminiResponse.text;
    if (!outputText) {
      sendJson(response, 502, { error: "Gemini response did not include output text" });
      return;
    }

    sendJson(response, 200, JSON.parse(outputText));
  } catch (error) {
    console.error("Gemini API Error:", error);
    sendJson(response, 500, {
      error: error.message || "Gemini API request failed",
    });
  }
}

function createSystemInstruction(payload) {
  const joined = Array.isArray(payload.instructions) ? payload.instructions.join("\n") : "";
  const baseInstructions = [
    joined,
    "必ずJSON Schemaに合致するJSONだけを返してください。",
    "labelsは指定された分類ラベル（'原文対応', '翻訳補完', '表現強化', '解釈追加', '分岐語', '要確認'）だけを使ってください。",
    "表現強化と解釈追加では、抽象的な高品質ワードではなく、温度、湿度、身体の接地、肌、髪、まつ毛、布、床、壁、光、素材感、象徴性などの具体的な視覚語を優先してください。",
    "ユーザーは後から削れるため、追加候補は控えめにしすぎず、世界を想像して多めに出してください。",
  ];

  if (payload.intention && payload.intention.trim()) {
    baseInstructions.push(
      `【絵全体の最優先基準（見たいもの）】`,
      `絵の核となる意図（ユーザーが最大化したい瞬間や感覚）: "${payload.intention}"`,
      "1. 各句がこの「見たいもの（意図）」にどう貢献しているか、または貢献していないかを評価し、`contribution_note`（一行：目安10〜30字）と、貢献度を表す `contribution_level`（\"high\" / \"medium\" / \"low\"）を決定してください。",
      "2. 新しいプロンプト・句の作成にあたっては、この意図を強化する方向で構成し、無関係な装飾は控えてください。",
      "3. `contribution_note` の記述例:「[見たいもののキーワード]に貢献: [理由]」や「貢献度低: [不要な理由]」のように明記してください。",
      "4. もし修正指示を伴う場合、この「見たいもの」を最優先の基準として修正・取捨選択してください。ただし、ユーザーの具体的な修正指示と「見たいもの」が矛盾する場合、ユーザーの具体的な指示を優先してください。その際、矛盾していることに対する評価や補足をその句の `contribution_note` に書き残しても構いません。"
    );
  } else {
    baseInstructions.push(
      "現在、絵の最優先基準である「見たいもの（intention）」は指定されていません（空文字列）。そのため、各句の `contribution_note` は空文字列（\"\"）とし、`contribution_level` は \"high\" として出力してください。"
    );
  }

  return baseInstructions.join("\n");
}

function createResponseSchema(includeDiff) {
  const phraseSchema = {
    type: Type.OBJECT,
    required: ["phrase", "ja", "labels", "effect", "note", "alternatives", "adopted", "contribution_note", "contribution_level"],
    properties: {
      phrase: { type: Type.STRING },
      ja: { type: Type.STRING },
      labels: {
        type: Type.ARRAY,
        items: { type: Type.STRING, enum: LABELS },
      },
      effect: { type: Type.STRING },
      note: { type: Type.STRING },
      alternatives: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      adopted: { type: Type.BOOLEAN },
      contribution_note: { type: Type.STRING },
      contribution_level: { type: Type.STRING, enum: ["high", "medium", "low"] },
    },
  };

  const properties = {
    prompt_en: { type: Type.STRING },
    phrases: {
      type: Type.ARRAY,
      items: phraseSchema,
    },
    summary: { type: Type.STRING },
  };
  const required = ["prompt_en", "phrases", "summary"];

  if (includeDiff) {
    properties.diff = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["type", "text"],
        properties: {
          type: { type: Type.STRING, enum: ["remove", "add"] },
          text: { type: Type.STRING },
        },
      },
    };
    required.push("diff");
  }

  return {
    type: Type.OBJECT,
    required,
    properties,
  };
}

async function serveStatic(pathname, response, headOnly) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = join(ROOT, safePath);

  if (!absolutePath.startsWith(ROOT)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const content = await readFile(absolutePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(absolutePath)] || "application/octet-stream",
    });
    if (!headOnly) response.end(content);
    else response.end();
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large");
  }
  return JSON.parse(body || "{}");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function extractOutputText(data) {
  for (const candidate of data?.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (typeof part.text === "string") return part.text;
    }
  }
  return "";
}

async function loadEnv(path) {
  try {
    const raw = await readFile(path, "utf-8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
}

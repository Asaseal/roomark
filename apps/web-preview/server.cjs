const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5190);
const host = process.env.HOST || "0.0.0.0";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  return (payload?.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || part.output_text || "")
    .filter(Boolean)
    .join("\n");
}

function parsePlanJson(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

function createGeneratedRoomModel(spec = {}, requestBody = {}, source = "fallback") {
  const height = clamp(numberOr(requestBody.height, 3), 2.2, 4.5);
  const width = clamp(numberOr(spec.widthMeters, 6.8), 3.2, 12);
  const depth = clamp(numberOr(spec.depthMeters, 5.4), 3.2, 12);
  const area = Math.round(numberOr(spec.areaSquareMeters, width * depth));
  const roomSummary = spec.roomSummary || "2 室 1 厅 1 厨 1 卫";
  const title = spec.title || "AI 平面图生成房型";
  const style = spec.layoutStyle || "由平面图解析的可交互空白 3D 空间";
  const halfW = width / 2;
  const halfD = depth / 2;
  const partitionX = clamp(width * 0.16, 0.8, 1.8);
  const partitionZ = clamp(depth * 0.16, 0.8, 1.8);

  return {
    id: "H05",
    title,
    category: "AI 生成",
    area: `约 ${area} m²`,
    rooms: roomSummary,
    style: `${style} · 层高 ${height.toFixed(1)}m · ${source === "openai" ? "GPT 解析" : "本地兜底"}`,
    camera: { position: [width * 0.86, 8.2, depth * 0.92], target: [0, 0, 0] },
    floors: [
      { x: 0, z: 0, w: width, d: depth, material: "warmFloor" },
      { x: halfW - width * 0.22, z: halfD - depth * 0.24, w: width * 0.3, d: depth * 0.32, material: "tileFloor" },
      { x: -halfW + width * 0.24, z: halfD - depth * 0.24, w: width * 0.32, d: depth * 0.34, material: "carpetFloor" }
    ],
    walls: [
      [0, -halfD, width, 0.18],
      [-halfW, 0, 0.18, depth],
      [halfW, 0, 0.18, depth],
      [0, halfD, width, 0.18],
      [-partitionX, partitionZ, 0.18, depth * 0.58],
      [partitionX, partitionZ, 0.18, depth * 0.54],
      [0, -depth * 0.12, width * 0.66, 0.18],
      [-halfW + width * 0.3, depth * 0.22, width * 0.28, 0.18],
      [halfW - width * 0.28, depth * 0.2, width * 0.3, 0.18]
    ],
    windows: [
      { x: -width * 0.24, z: -halfD - 0.02, w: width * 0.22, d: 0.08 },
      { x: width * 0.24, z: -halfD - 0.02, w: width * 0.22, d: 0.08 },
      { x: -halfW - 0.02, z: depth * 0.2, w: 0.08, d: depth * 0.24 },
      { x: halfW + 0.02, z: depth * 0.18, w: 0.08, d: depth * 0.24 }
    ],
    doors: [
      { x: 0, z: -halfD + 0.08, r: 0 },
      { x: -partitionX, z: -depth * 0.02, r: 1.57 },
      { x: partitionX, z: -depth * 0.04, r: 1.57 },
      { x: -halfW + width * 0.3, z: depth * 0.22, r: 0 },
      { x: halfW - width * 0.28, z: depth * 0.2, r: 0 }
    ],
    furniture: []
  };
}

function createFallbackPlanModel(requestBody = {}) {
  const fileHint = requestBody.fileName ? `，参考 ${requestBody.fileName}` : "";
  const spec = {
    title: "AI 平面图生成房型",
    areaSquareMeters: 68,
    roomSummary: "2 室 1 厅 1 厨 1 卫",
    layoutStyle: `本地稳定模式生成的两居室空白空间${fileHint}`,
    widthMeters: 7.2,
    depthMeters: 6.1
  };

  return {
    ok: true,
    source: "fallback",
    model: "local-room-generator",
    summary: "未检测到可用 OPENAI_API_KEY，已使用本地兜底生成可交互 3D 房型。",
    room: createGeneratedRoomModel(spec, requestBody, "fallback")
  };
}

async function callOpenAIPlanParser(requestBody) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return createFallbackPlanModel(requestBody);

  const model = process.env.ROOMARK_OPENAI_MODEL || "gpt-5.5";
  const content = [
    {
      type: "input_text",
      text: [
        "你是 Roomark 的室内平面图解析助手。",
        "请根据用户上传的租房平面图和层高，推断一个适合移动端查看的简化 3D 房型。",
        "只返回 JSON，不要 Markdown。",
        "字段必须包含：title, areaSquareMeters, roomSummary, layoutStyle, widthMeters, depthMeters。",
        `层高：${numberOr(requestBody.height, 3).toFixed(1)}m。`,
        `文件名：${requestBody.fileName || "未提供"}。`,
        "如果图像信息不足，请给出稳妥的两居室一卫布局。"
      ].join("\n")
    }
  ];

  if (typeof requestBody.dataUrl === "string" && requestBody.dataUrl.startsWith("data:image/")) {
    content.push({ type: "input_image", image_url: requestBody.dataUrl });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content }],
        max_output_tokens: 700
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return { ...createFallbackPlanModel(requestBody), summary: `GPT 解析暂不可用，已使用本地兜底。${errorText.slice(0, 120)}` };
    }

    const payload = await apiResponse.json();
    const planSpec = parsePlanJson(extractResponseText(payload));
    return {
      ok: true,
      source: "openai",
      model,
      summary: "已根据平面图解析生成可交互 3D 房型。",
      room: createGeneratedRoomModel(planSpec, requestBody, "openai")
    };
  } catch (error) {
    return { ...createFallbackPlanModel(requestBody), summary: `GPT 解析超时或失败，已使用本地兜底。${error.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);

  if (url.pathname === "/api/plan-to-3d") {
    if (request.method !== "POST") {
      sendJson(response, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    try {
      const requestBody = await readJsonBody(request);
      sendJson(response, 200, await callOpenAIPlanParser(requestBody));
    } catch (error) {
      sendJson(response, 200, { ...createFallbackPlanModel({}), summary: `平面图解析失败，已使用本地兜底。${error.message}` });
    }
    return;
  }

  const safePath = path.normalize(url.pathname === "/" ? "/web-preview/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Roomark browser product local: http://127.0.0.1:${port}/`);
  console.log(`Roomark browser product LAN: http://<your-computer-ip>:${port}/`);
});

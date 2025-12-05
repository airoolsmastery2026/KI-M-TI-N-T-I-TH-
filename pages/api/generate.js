// pages/api/generate.js
// Backend orchestration: Gemini -> OpenAI, rate-limit simple, parse safe

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // max requests per IP per window

// In-memory store for rate limiting (note: resets when server restarts)
const rateStore = global.__rate_store__ || (global.__rate_store__ = {});

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateStore[ip]) {
    rateStore[ip] = { ts: now, count: 1 };
    return false;
  }
  const rec = rateStore[ip];
  if (now - rec.ts > RATE_LIMIT_WINDOW_MS) {
    // reset window
    rateStore[ip] = { ts: now, count: 1 };
    return false;
  }
  rec.count += 1;
  if (rec.count > RATE_LIMIT_MAX) return true;
  return false;
}

const GEMINI_ANALYZE_PROMPT_TEMPLATE = `
Vai trò: Bạn là chuyên gia phân tích nội dung marketing (video & bài viết). 
Trả về CHỈ JSON theo schema sau:

{
  "summary":"string",
  "structure": { "hook":"string", "body_points":["string"], "closing_cta":"string" },
  "attraction_factors": ["string"],
  "tone_of_voice": "string",
  "insights": { "pains":["string"], "desires":["string"], "false_beliefs":["string"] },
  "ideas": [
    { "id":"idea_1", "title":"string", "short_description":"string", "video_type":"review|story|tips|other" }
  ]
}

Nội dung đối thủ:
"""
{{RAW_TEXT}}
"""
Niche: {{NICHE}}
`;

const OPENAI_GENERATE_PROMPT_TEMPLATE = `
Vai trò: Bạn là chuyên gia sáng tạo nội dung video ngắn và copywriter.

Dưới đây là phân tích (JSON) từ Gemini:
{{GEMINI_JSON}}

Niche: {{NICHE}}
Platforms: {{PLATFORMS}}

NHIỆM VỤ:
1) Chọn ít nhất 3 ý tưởng phù hợp từ "ideas".
2) Với mỗi platform, tạo ít nhất 2 variant nội dung cho mỗi ý tưởng.

Trả về CHỈ JSON theo cấu trúc:
{
 "platform_contents":[
   {
     "platform":"tiktok|youtube_shorts|facebook_reels",
     "items":[
       {
         "idea_id":"idea_1",
         "variant_index":1,
         "title":"string",
         "script":"string",
         "caption":"string",
         "hashtags":["string"]
       }
     ]
   }
 ]
}

Yêu cầu:
- Hook phải rõ trong 3 giây đầu.
- Không copy câu chữ từ nội dung gốc.
- CTA dùng placeholder [LINK_AFFILIATE].
`;

function buildGeminiPrompt(rawText, niche) {
  return GEMINI_ANALYZE_PROMPT_TEMPLATE
    .replace("{{RAW_TEXT}}", rawText)
    .replace(/{{NICHE}}/g, niche || "general");
}

function buildOpenAIPrompt(geminiJson, niche, platforms) {
  return OPENAI_GENERATE_PROMPT_TEMPLATE
    .replace("{{GEMINI_JSON}}", JSON.stringify(geminiJson))
    .replace(/{{NICHE}}/g, niche || "general")
    .replace("{{PLATFORMS}}", JSON.stringify(platforms || []));
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
  }

  const { rawText, niche, platforms } = req.body || {};
  if (!rawText || typeof rawText !== "string") {
    return res.status(400).json({ error: "Missing rawText input" });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "Missing GEMINI_API_KEY in environment" });
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY in environment" });

  try {
    // 1) Call Gemini
    const geminiPrompt = buildGeminiPrompt(rawText, niche);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResp = await fetchWithTimeout(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: geminiPrompt }] }] }),
    }, 45000);

    const geminiData = await geminiResp.text();
    // geminiData expected to be JSON string inside response structure
    let geminiParsedText = null;
    try {
      const geminiJsonWrap = JSON.parse(geminiData);
      // try to find generated text
      geminiParsedText =
        geminiJsonWrap?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    } catch (e) {
      // If top-level parse fails, we keep geminiData raw for debug
      console.error("Gemini raw response parse failed:", e);
    }

    if (!geminiParsedText) {
      console.error("Gemini response (raw):", geminiData);
      return res.status(500).json({ error: "Gemini API error", detail: geminiData });
    }

    let geminiJSON;
    try {
      geminiJSON = JSON.parse(geminiParsedText);
    } catch (e) {
      console.error("Cannot parse Gemini JSON:", geminiParsedText);
      return res.status(500).json({ error: "Cannot parse Gemini JSON", detail: geminiParsedText });
    }

    // 2) Call OpenAI
    const openaiPrompt = buildOpenAIPrompt(geminiJSON, niche, platforms);
    const openaiUrl = "https://api.openai.com/v1/chat/completions";
    const openaiResp = await fetchWithTimeout(openaiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: "You are an expert short-form video copywriter." },
          { role: "user", content: openaiPrompt },
        ],
        temperature: 0.7,
        max_tokens: 3000
      }),
    }, 60000);

    const openaiText = await openaiResp.text();
    let openaiDataWrap;
    try {
      openaiDataWrap = JSON.parse(openaiText);
    } catch (e) {
      console.error("OpenAI top-level parse failed:", openaiText);
      return res.status(500).json({ error: "OpenAI response not JSON", detail: openaiText });
    }

    const openaiRaw = openaiDataWrap?.choices?.[0]?.message?.content ?? null;
    if (!openaiRaw) {
      console.error("OpenAI missing content:", openaiDataWrap);
      return res.status(500).json({ error: "OpenAI API error", detail: openaiDataWrap });
    }

    let openaiJSON;
    try {
      openaiJSON = JSON.parse(openaiRaw);
    } catch (e) {
      console.error("Cannot parse OpenAI JSON:", openaiRaw);
      return res.status(500).json({ error: "Cannot parse OpenAI JSON", detail: openaiRaw });
    }

    // 3) Return combined result
    return res.status(200).json({ analysis: geminiJSON, generated: openaiJSON });
  } catch (err) {
    console.error("Server failure:", err);
    return res.status(500).json({ error: "Server failure", detail: String(err) });
  }
}

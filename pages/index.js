// pages/index.js
import { useState } from "react";

export default function Home() {
  const [rawText, setRawText] = useState("");
  const [niche, setNiche] = useState("");
  const [platforms, setPlatforms] = useState({
    tiktok: true,
    youtube_shorts: false,
    facebook_reels: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function handlePlatformToggle(key) {
    setPlatforms((p) => ({ ...p, [key]: !p[key] }));
  }

  function getSelectedPlatforms() {
    return Object.entries(platforms).filter(([, v]) => v).map(([k]) => k);
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    setError("");
    setResult(null);

    if (!rawText.trim()) {
      setError("Vui lòng dán nội dung đối thủ (rawText).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          niche: niche || "general",
          platforms: getSelectedPlatforms(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Lỗi server. Kiểm tra logs.");
      } else {
        setResult(data);
      }
    } catch (err) {
      console.error(err);
      setError("Lỗi kết nối hoặc mạng. Thử lại.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopyJSON() {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    alert("Đã copy JSON vào clipboard.");
  }

  return (
    <div style={{ maxWidth: 960, margin: "28px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Affiliate Content Factory — V1</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>
        Dán nội dung đối thủ → chọn niche & nền tảng → Generate để nhận phân tích và nội dung.
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Nội dung đối thủ (rawText)</label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            style={{ width: "100%", padding: 8, fontFamily: "monospace" }}
            placeholder="Dán transcript hoặc nội dung đối thủ..."
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Niche (ngách)</label>
          <input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="VD: công cụ AI, giảm cân, bất động sản..."
            style={{ width: "100%", padding: 8 }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Nền tảng</div>
          <label style={{ marginRight: 12 }}>
            <input type="checkbox" checked={platforms.tiktok} onChange={() => handlePlatformToggle("tiktok")} /> TikTok
          </label>
          <label style={{ marginRight: 12 }}>
            <input type="checkbox" checked={platforms.youtube_shorts} onChange={() => handlePlatformToggle("youtube_shorts")} /> YouTube Shorts
          </label>
          <label>
            <input type="checkbox" checked={platforms.facebook_reels} onChange={() => handlePlatformToggle("facebook_reels")} /> Facebook Reels
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            background: "#111827",
            color: "#fff",
            padding: "10px 18px",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {loading ? "Đang xử lý..." : "Generate"}
        </button>
      </form>

      {error && <div style={{ color: "red", marginBottom: 12 }}>Lỗi: {error}</div>}

      {result && (
        <>
          <div style={{ marginBottom: 10 }}>
            <button onClick={handleCopyJSON} style={{ marginRight: 8 }}>Copy JSON</button>
            <button onClick={() => window.location.reload()}>Làm mới</button>
          </div>

          <div style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
            <h2 style={{ fontSize: 18 }}>Kết quả</h2>

            <h3 style={{ fontSize: 14, marginTop: 10 }}>Analysis (Gemini)</h3>
            <pre style={{ background: "#fbfbfb", padding: 12, borderRadius: 6, overflowX: "auto" }}>
              {JSON.stringify(result.analysis, null, 2)}
            </pre>

            <h3 style={{ fontSize: 14, marginTop: 12 }}>Generated (OpenAI)</h3>
            <pre style={{ background: "#fbfbfb", padding: 12, borderRadius: 6, overflowX: "auto" }}>
              {JSON.stringify(result.generated, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}

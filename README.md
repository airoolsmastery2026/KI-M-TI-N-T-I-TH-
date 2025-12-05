# Affiliate Content Factory — V1

Ứng dụng: dán nội dung đối thủ → phân tích bằng Gemini → sinh nội dung gốc bằng OpenAI → hiển thị kết quả.

## Yêu cầu
- Node 18+
- Tài khoản Google AI Studio (Gemini) và OpenAI (API key)
- Vercel account (deploy)

## Các file chính
- `pages/index.js` — giao diện
- `pages/api/generate.js` — backend orchestration (Gemini + OpenAI)
- `package.json`, `next.config.mjs`

## Hướng dẫn cài & chạy local
1. Clone repo:
```bash
git clone <repo-url>
cd affiliate-content-factory

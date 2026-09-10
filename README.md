# HaruNeko — HakuNeko Remake (PWA + Sync + AI + OCR + Tiếng Việt)

> Prototype HakuNeko dựa trên Electron/NW.js + TypeScript + Vite, đã việt hóa và thêm hàng loạt tính năng mới. Bản gốc: [manga-download/haruneko](https://github.com/manga-download/haruneko)

[![Build EXE](https://github.com/khanhdocnope/haruneko-remake/actions/workflows/build-exe.yml/badge.svg)](https://github.com/khanhdocnope/haruneko-remake/actions)
[![Crowdin](https://badges.crowdin.net/hakuneko/localized.svg)](https://crowdin.com/project/hakuneko)

---

## ✨ Tính năng mới so với gốc

| Nhóm | Chi tiết |
|------|----------|
| **🇻🇳 Việt hóa** | `vi_VN` đầy đủ 357 keys, mặc định auto khi `navigator.language=vi`. `Settings → Language → Tiếng Việt` |
| **PWA Offline** | `manifest.json`, Service Worker versioned (`precache/runtime/images`), `CacheFirst/StaleWhileRevalidate/NetworkFirst`, đọc manga đã tải khi offline, cài đặt như app |
| **Đồng bộ Cloud** | `Gist` (GitHub) / `WebDAV` (Nextcloud), mã hóa AES-GCM, `Watch` + debounce 2s, xử lý xung đột bookmark |
| **AI Dịch** | List chọn provider `OpenAI/Gemini/DeepL/Google` (user tự nhập `API Key`), target `vi` mặc định, auto/manual toggle, cache 30 ngày |
| **OCR/Vision** | Nhận diện chữ trong ảnh manga: `Tesseract (offline)` → `OpenAI Vision / Gemini Vision / Google Vision`, **nút “Dịch ảnh” thủ công từng trang**, bong bóng trắng che chữ gốc, ngôn ngữ OCR `auto` |
| **Browser Fallback** | Chạy trực tiếp trên Chrome/Firefox/Safari (PWA) không cần Electron/NW.js |

---

## 🚀 Chạy nhanh

### Yêu cầu
- Node `>=24`, npm `>=11.3`

### 1) Cài đặt
```bash
git clone https://github.com/khanhdocnope/haruneko-remake.git
cd haruneko-remake
npm run npm:clean-install   # hoặc npm install
```

### 2) Chạy web (khuyến nghị để test)
```bash
npm --workspace=web run serve:dev   # https://localhost:3000  (self-signed, bấm Advanced → Proceed)
# hoặc build production
npm run build --workspace=web
npm --workspace=web run serve:prod  # https://localhost:5000
```
Mở `https://localhost:3000` trên Chrome → `Ctrl+Shift+R` nếu trước đó có lỗi HMR `tesseract.js`.

### 3) Chạy desktop (Electron)
```bash
# Dev với web local:
npx electron ./app/electron/build --origin=https://localhost:3000 --ignore-certificate-errors

# Bundle ra .zip portable (Windows):
npm run bundle --workspace=app/electron
# → app/electron/bundle/haruneko-electron-*.zip (chứa hakuneko.exe + userdata)
```
Hoặc tải artifact **Build EXE** từ tab **Actions** → workflow **Build EXE (Windows)** → `hakuneko-windows-exe`.

---

## ⚙️ Cấu hình

### Ngôn ngữ
`Welcome → Language` hoặc `Settings → Language`. Đã có migration tự động: nếu DB cũ thiếu `vi_VN` sẽ tự thêm vào options. Mặc định `vi` khi trình duyệt là tiếng Việt.

### AI Dịch (UI + tên truyện)
`Settings → AI Provider`:
- **Provider:** `None / OpenAI / Gemini / DeepL / Google`
- **AI Model:** `gpt-4o-mini`, `gemini-1.5-flash`, …
- **AI API Key:** `Secret` (lưu AES-GCM `v1:`), tự nhập
- **AI Target:** `vi` / `en`
- **Auto Translate:** `OFF` (khuyến nghị) = chỉ dịch khi bấm nút, `ON` = tự dịch chuỗi thiếu

Dùng trong code: `window.HakuNeko.TranslationOrchestrator.Translate('Hello','vi')` hoặc `TranslateBatch([...])`

### OCR / Dịch ảnh
`Settings → OCR Provider`:
- `None / Tesseract (offline) / OpenAI Vision / Gemini Vision / Google Vision`
- `OCR Language: auto` (tự nhận diện ja/ko/zh/en)
- `OCR Overlay: bubble` (bong bóng trắng che chữ gốc)

Trong viewer (`Image`):
- Mỗi ảnh có nút **“Dịch ảnh”** (góc phải dưới) + menu chuột phải **“Dịch ảnh (VI)”**
- Chỉ chạy khi bấm (không auto), kết quả cache `ImageOCRCache` 30 ngày theo hash ảnh
- Tọa độ Vision `0-1000` relative, Tesseract pixel sẽ tự chuẩn hóa theo `naturalWidth/Height`

### Đồng bộ
`Settings → Sync Provider`:
- `None / GitHub Gist / WebDAV`
- `GitHub Token` (cần scope `gist`) hoặc `WebDAV URL/User/Pass`
- `Auto Sync: ON` (debounce 2s), `Sync Interval`, `Encrypt Sync Data` (AES-GCM với `Sync Passphrase`)
- Gist ID lưu `localStorage: hakuneko:sync:gistId`

### PWA
- `static/manifest.json` (`standalone`, `theme #ff1c5c`), cài đặt qua Chrome “Install”
- Offline đọc được ảnh đã cache (`images-*` cache, `CacheFirst`)

---

## 📁 Cấu trúc chính

```
web/src/
  i18n/locales/vi_VN.ts          # Việt hóa full
  engine/StorageController*        # + DownloadedMedia/TranslationCache/ImageOCRCache
  engine/platform/AI/              # AITranslationProvider, TranslationOrchestrator, OpenAI/Gemini/DeepL/Google, OCR/Vision providers
  engine/platform/Sync/            # Gist/WebDAV SyncManager
  engine/platform/browser/         # Fallback cho Chrome/Gecko/WebKit (AppWindow, Fetch, BloatGuard…)
  frontend/classic/components/viewer/Image.svelte  # overlay bong bóng + nút Dịch ảnh
web/static/manifest.json
web/src/service-worker.ts          # versioned cache 3 layers
app/electron / app/nw              # desktop shells
.github/workflows/build-exe.yml    # build Windows .exe trên Actions
```

---

## 🔧 Lệnh thường dùng

```bash
npm run check --workspaces          # tsc + eslint + svelte-check + vue-tsc + coding-rules
npm run build --workspaces
npm run test --workspaces
npm run bundle --workspace=app/electron
npm run bundle --workspace=app/nw
```

---

## ❓ Troubleshooting

| Lỗi | Cách fix |
|-----|----------|
| `Language` không thấy `Tiếng Việt` | Đã fix migration `SettingsManager.UpdateOptions` (`3317bf01`). Tải bản mới từ Actions hoặc `git pull` + `Ctrl+Shift+R` |
| `Failed to create instance for platform 'chromium'` | Đã fix browser fallback (`cacaa452`). `git pull` + rebuild `npm run build --workspace=web` |
| `Failed to resolve import "tesseract.js"` HMR overlay | Đã fix `/* @vite-ignore */` dynamic spec (`294cd7db`). Refresh `https://localhost:3000` |
| `ERR_CONNECTION_REFUSED` localhost:3000 | Server chưa chạy. `npm --workspace=web run serve:dev` (https, port 3000) |
| `check:rules` báo `vi_VN.ts` | Đã allow `vi_VN` trong `web/scripts/coding-rules.mjs` (`306505c2`) |
| Cloudflare deploy `CLOUDFLARE_API_TOKEN` | Deploy giờ conditional (`e173e0c`), fork không có secrets sẽ skip |
| `btoa` lỗi Unicode / stack overflow ảnh lớn | Đã fix chunked `TextEncoder` + `FileReader.readAsDataURL` (`84771de6`) |

---

## 📝 Giấy phép
Unlicense — xem `UNLICENSE`

## 🙏 Ghi chú
Việt hóa `vi_VN.ts` dịch bằng AI từ `en_US.ts` (giữ tên riêng). OCR Vision tốn token (OpenAI/Gemini) — đã cache 30 ngày + chỉ nút thủ công để tiết kiệm quota. Tesseract offline cần `npm i tesseract.js` nếu muốn dùng.

PR / Issue chào mừng tại `khanhdocnope/haruneko-remake`!

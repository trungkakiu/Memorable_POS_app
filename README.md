# Memorable Desktop

Ứng dụng máy tính (Windows) cho **Memorable API** – kho tri thức & vận hành nhóm. Chỉ có giao diện; toàn bộ dữ liệu lấy từ backend qua `https://memorable.clearlink.io.vn` (đổi được ở màn đăng nhập hoặc mục *Kết nối & tài khoản*).

**Cấu hình ở một chỗ:** địa chỉ máy chủ mặc định, địa chỉ cũ cần tự chuyển, thời gian chờ, giới hạn dung lượng tệp… nằm trong tệp `.env` ở thư mục gốc (chép từ `.env.example`). Đổi giá trị rồi chạy lại `npm run dev` hoặc `npm run dist`; thiếu tệp `.env` thì dùng mặc định trong `electron/appConfig.cjs`. Máy đang lưu địa chỉ cũ (ví dụ Radmin `http://26.118.183.122:3001`) tự chuyển sang địa chỉ mới khi mở ứng dụng.

Stack: Electron + Vite + React 19 + TypeScript + Tailwind CSS 4 + SCSS (design tokens) + Recharts + Zustand.

## Chạy / đóng gói
```bash
npm install
npm run dev        # phát triển (Vite + Electron)
npm run build      # kiểm tra kiểu + build giao diện vào dist/
npm run dist       # tạo installer + bản portable trong release/
```
Kết quả: `release/Memorable Desktop-Setup-1.0.0.exe` (cài đặt) và `release/Memorable Desktop-Portable-1.0.0.exe`.

## Hai giao diện theo vai trò
- **Người đọc** (`src/reader/*`): thư viện tri thức thân thiện — tìm bài, làm theo từng bước, hỏi trợ lý (có nói thành chữ), **hỏi về tệp của tôi** (gửi ảnh/PDF/Word/Excel cho trợ lý đọc và đối chiếu, hoặc chỉ đọc trên máy), so sánh bài, trợ lý ghi nhớ.
- **Đóng góp / kiểm duyệt / quản trị / bảo trợ** (`src/pages/*`): quản lý mục, duyệt, nguồn tri thức, thẻ & bản đồ liên kết, Agent & trí nhớ, báo cáo, cấu hình máy chủ.

## Chạy ngoại tuyến trên máy (không cần mạng)
- **Đọc chữ trong ảnh / PDF quét**: tesseract.js, dữ liệu tiếng Việt + Anh trong `public/ocr` (`scripts/copy-ocr.cjs`).
- **Nói thành chữ và chép lời ghi âm**: ghi âm micro trong ứng dụng (WebM/Opus) hoặc chọn file ghi âm (mp3, m4a, wav, ogg, webm, amr...), AI trên máy chủ chép lời bằng `POST /ai/transcribe` (mô hình speech-to-text, cắt đoạn ở khoảng lặng, có mốc thời gian). Trang "Chép lời ghi âm" cho người đọc và quản trị.

## Theo dõi thay đổi API backend
```bash
npm run api:check    # so spec sinh từ mã nguồn backend (BACKEND_DIR, mặc định ../Memorable) với mốc api/openapi.baseline.json
npm run api:accept   # sau khi đã cập nhật giao diện: lấy spec hiện tại làm mốc mới
```
Đề xuất sửa phía backend nằm trong `backend-fixes/`.

## Cấu trúc
- `electron/main.cjs` – cửa sổ + cầu nối HTTP tới API (tránh CORS), tải/lên tệp (multipart), lưu cấu hình. Không có CSDL/backend riêng.
- `src/lib/api.ts` – client `{ RD, RC, RM }`, xử lý 401 (token sống 1 giờ), lỗi 422 theo từng trường.
- `src/lib/permissions.ts` – ma trận quyền theo mục "Ai gọi được" trong Swagger.
- `src/lib/localDoc.ts`, `src/lib/ocr.ts`, `src/lib/stt.ts` – đọc tệp, OCR và nhận dạng giọng nói chạy ngay trên máy.
- `src/pages/*` – màn hình quản trị; `src/reader/*` – giao diện người đọc; `src/components/*` – UI dùng chung; `src/styles/*` – SCSS tokens + thành phần.

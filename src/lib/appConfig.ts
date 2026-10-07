// Cấu hình chung của giao diện, lấy từ tệp .env ở thư mục gốc dự án lúc build (vite.config.ts -> __APP_CONFIG__).
// Đổi giá trị trong .env rồi build lại; không sửa rải rác trong mã.
declare const __APP_CONFIG__: Record<string, string> | undefined
const raw: Record<string, string> = typeof __APP_CONFIG__ === 'object' && __APP_CONFIG__ ? __APP_CONFIG__ : {}

const url = (v: string | undefined, d: string) => (v || d).trim().replace(/\/+$/, '')
const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d }

export const APP_CONFIG = {
  /** Địa chỉ máy chủ Memorable API mặc định */
  server: url(raw.MEMORABLE_SERVER, 'https://memorable.clearlink.io.vn'),
  /** Máy chủ dùng khi chạy giao diện trong trình duyệt lúc phát triển (npm run dev không có Electron) */
  devServer: url(raw.MEMORABLE_DEV_SERVER, 'http://localhost:3001'),
  /** Giới hạn dung lượng tệp gửi lên (phải khớp với máy chủ) */
  maxUploadMb: num(raw.MEMORABLE_MAX_UPLOAD_MB, 10),
  maxAudioMb: num(raw.MEMORABLE_MAX_AUDIO_MB, 25),
}

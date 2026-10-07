'use strict'
// Cấu hình chung của ứng dụng, đọc từ một chỗ: tệp .env ở thư mục gốc dự án (xem .env.example).
// Thứ tự ưu tiên: biến môi trường của hệ điều hành > .env (khi chạy dev) > dist/app-config.json (bản cài, sinh lúc build) > mặc định dưới đây.
// Chỉ dùng Node thuần (không cần Electron) để các script build cũng dùng chung được.
const path = require('node:path')
const fs = require('node:fs')

const ROOT = path.join(__dirname, '..')

const DEFAULTS = {
  MEMORABLE_SERVER: 'https://memorable.clearlink.io.vn',
  MEMORABLE_LEGACY_SERVERS: 'http://26.118.183.122:3001',
  MEMORABLE_DEV_SERVER: 'http://localhost:3001',
  MEMORABLE_TIMEOUT_SEC: '30',
  MEMORABLE_DOWNLOAD_TIMEOUT_SEC: '120',
  MEMORABLE_UPLOAD_TIMEOUT_SEC: '900',
  MEMORABLE_MAX_UPLOAD_MB: '10',
  MEMORABLE_MAX_AUDIO_MB: '25',
}

/** Đọc tệp dạng KEY=giá trị (bỏ dòng trống, dòng #, dấu nháy bao quanh) */
function parseEnvFile(file) {
  const out = {}
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return out }
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    let v = m[2].trim()
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1)
    else v = v.replace(/\s+#.*$/, '')
    out[m[1]] = v
  }
  return out
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} } }

/** Toàn bộ giá trị (chuỗi) sau khi gộp các nguồn */
function loadRaw() {
  const baked = readJson(path.join(ROOT, 'dist', 'app-config.json'))
  const fromFile = parseEnvFile(path.join(ROOT, '.env'))
  const fromProcess = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('MEMORABLE_') || k === 'BACKEND_DIR'))
  return { ...DEFAULTS, ...baked, ...fromFile, ...fromProcess }
}

const trimUrl = (u) => String(u || '').trim().replace(/\/+$/, '')
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d }

function loadConfig() {
  const r = loadRaw()
  return {
    raw: r,
    server: trimUrl(r.MEMORABLE_SERVER) || DEFAULTS.MEMORABLE_SERVER,
    legacyServers: String(r.MEMORABLE_LEGACY_SERVERS || '').split(/[,\s]+/).map(trimUrl).filter(Boolean),
    devServer: trimUrl(r.MEMORABLE_DEV_SERVER),
    timeoutMs: num(r.MEMORABLE_TIMEOUT_SEC, 30) * 1000,
    downloadTimeoutMs: num(r.MEMORABLE_DOWNLOAD_TIMEOUT_SEC, 120) * 1000,
    uploadTimeoutMs: num(r.MEMORABLE_UPLOAD_TIMEOUT_SEC, 900) * 1000,
    maxUploadBytes: num(r.MEMORABLE_MAX_UPLOAD_MB, 10) * 1024 * 1024,
    maxAudioBytes: num(r.MEMORABLE_MAX_AUDIO_MB, 25) * 1024 * 1024,
  }
}

/** Các giá trị MEMORABLE_* đưa vào bản build (không có bí mật) */
function publicValues() {
  const r = loadRaw()
  return Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith('MEMORABLE_')))
}

module.exports = { loadConfig, publicValues, parseEnvFile, DEFAULTS, ROOT }

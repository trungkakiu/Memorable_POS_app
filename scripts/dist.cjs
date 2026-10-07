// Đóng gói bản cài Windows (electron-builder) và không để build hỏng vì thư mục `release/` bị khóa.
// Trên Windows, chương trình khác (hay gặp nhất: VS Code đang mở/quét thư mục release, hoặc bản app cũ còn chạy)
// giữ tệp release/win-unpacked/resources/app.asar nên electron-builder báo EBUSY khi ghi đè.
// Khi đó script cho biết chương trình nào đang giữ tệp rồi đóng gói sang `release-new/` thay vì dừng lại.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const asar = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar')

/** Thử đổi tên tạm rồi đổi lại: tệp đang bị chương trình khác mở thì Windows từ chối (EBUSY/EPERM). */
function isLocked(file) {
  if (!fs.existsSync(file)) return false
  const tmp = `${file}.lockcheck`
  try { fs.renameSync(file, tmp); fs.renameSync(tmp, file); return false } catch (e) { return ['EBUSY', 'EPERM', 'EACCES'].includes(e.code) }
}

/** Hỏi Windows Restart Manager xem chương trình nào đang giữ tệp (không cần cài thêm công cụ). */
function whoHolds(file) {
  if (process.platform !== 'win32') return []
  const ps = `
$code = @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class RM {
  [StructLayout(LayoutKind.Sequential)] public struct UP { public int pid; public System.Runtime.InteropServices.ComTypes.FILETIME t; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct PI { public UP p; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string app; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string svc; public int type; public uint st; public uint sess; [MarshalAs(UnmanagedType.Bool)] public bool rs; }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint h, int f, string k);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmRegisterResources(uint h, uint n, string[] f, uint a, UP[] p, uint s, string[] v);
  [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint h, out uint need, ref uint n, [In, Out] PI[] i, ref uint r);
  public static string Who(string f) { var o = new List<string>(); uint h; RmStartSession(out h, 0, Guid.NewGuid().ToString());
    try { RmRegisterResources(h, 1, new[] { f }, 0, null, 0, null); uint need = 0, n = 0, r = 0; RmGetList(h, out need, ref n, null, ref r);
      if (need > 0) { var i = new PI[need]; n = need; RmGetList(h, out need, ref n, i, ref r); for (int k = 0; k < n; k++) o.Add(i[k].app + " (PID " + i[k].p.pid + ")"); } }
    finally { RmEndSession(h); } return string.Join("; ", o); } }
"@
Add-Type -TypeDefinition $code
[RM]::Who($env:LOCKED_FILE)`
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: { ...process.env, LOCKED_FILE: file }, encoding: 'utf8' })
  return String(r.stdout || '').trim().split('; ').filter(Boolean)
}

let output = 'release'
if (isLocked(asar)) {
  const who = whoHolds(asar)
  console.warn('\n⚠  Thư mục release/ đang bị khóa' + (who.length ? ` bởi: ${who.join(', ')}` : '') + '.')
  if (who.some((w) => /visual studio code/i.test(w))) console.warn('   Cách gỡ: trong VS Code bấm Ctrl+Shift+P → "Developer: Reload Window" (hoặc đóng VS Code), rồi chạy lại npm run dist.')
  else console.warn('   Cách gỡ: đóng chương trình trên (hoặc bản Memorable Desktop cũ đang chạy), rồi chạy lại npm run dist.')
  output = 'release-new'
  console.warn(`   Lần này đóng gói sang thư mục ${output}/ để không bị dừng.\n`)
}

// Gọi thẳng CLI của electron-builder bằng Node (không qua shell: đường dẫn dự án có dấu cách)
const pkg = require(path.join(root, 'node_modules', 'electron-builder', 'package.json'))
const cli = path.join(root, 'node_modules', 'electron-builder', typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['electron-builder'])
const res = spawnSync(process.execPath, [cli, '--win', '--x64', `--config.directories.output=${output}`], { cwd: root, stdio: 'inherit' })
if (res.status === 0) console.log(`\n✔  Bản cài nằm trong thư mục ${output}/`)
process.exit(res.status ?? 1)

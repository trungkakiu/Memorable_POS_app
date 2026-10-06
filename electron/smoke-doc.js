(async () => {
  const res = { hook: typeof window.__readLocal }
  try {
    const c = document.createElement('canvas'); c.width = 900; c.height = 200
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 200); x.fillStyle = '#000'; x.font = 'bold 56px Arial'
    x.fillText('Hoa don so 12345', 40, 110)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const d = await window.__readLocal({ name: 't.png', size: bytes.length, bytes })
    res.ocr = d.text.slice(0, 80); res.conf = d.ocrConfidence
  } catch (e) { res.ocrErr = String((e && e.message) || e) }
  try {
    // Ảnh JPEG lưu đuôi .jfif (Windows hay làm vậy khi tải ảnh từ web)
    const c = document.createElement('canvas'); c.width = 900; c.height = 200
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 200); x.fillStyle = '#000'; x.font = 'bold 56px Arial'
    x.fillText('Phieu nhap 67890', 40, 110)
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    res.jfif = (await window.__readLocal({ name: 'anh.JFIF', size: bytes.length, bytes })).text.slice(0, 80)
  } catch (e) { res.jfifErr = String((e && e.message) || e) }
  try {
    const bytes = new Uint8Array([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0])
    await window.__readLocal({ name: 'scan.tiff', size: bytes.length, bytes }); res.tiff = 'unexpected-ok'
  } catch (e) { res.tiff = String((e && e.message) || e).slice(0, 90) }
  try {
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 20 50 Td (Hello PDF worker) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF'
    const bytes = new TextEncoder().encode(pdf)
    const d = await window.__readLocal({ name: 't.pdf', size: bytes.length, bytes })
    res.pdf = d.text.slice(0, 60)
  } catch (e) { res.pdfErr = String((e && e.message) || e) }
  try {
    // Ghi âm trong ứng dụng (thay Vosk): trình ghi WebM/Opus có sẵn, file ghi âm mở ở chế độ "đọc trên máy" thì nhắc dùng Chép lời
    res.recorder = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    const ctx = new AudioContext(); const dst = ctx.createMediaStreamDestination(); const osc = ctx.createOscillator(); osc.connect(dst); osc.start()
    const rec = new MediaRecorder(dst.stream, { mimeType: 'audio/webm;codecs=opus' }); const parts = []
    rec.ondataavailable = (e) => parts.push(e.data)
    await new Promise((r) => { rec.onstop = r; rec.start(200); setTimeout(() => rec.stop(), 800) })
    osc.stop(); await ctx.close()
    const blob = new Blob(parts, { type: 'audio/webm' }); res.recordedBytes = blob.size
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer()); res.webmMagic = Array.from(head).map((x) => x.toString(16)).join('')
    try { await window.__readLocal({ name: 'hop.mp3', size: 10, bytes: new Uint8Array(10) }) } catch (e) { res.audioLocal = String(e.message).slice(0, 60) }
  } catch (e) { res.recErr = String((e && e.message) || e) }
  return JSON.stringify(res)
})()

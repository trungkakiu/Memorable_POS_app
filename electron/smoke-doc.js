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
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 20 50 Td (Hello PDF worker) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF'
    const bytes = new TextEncoder().encode(pdf)
    const d = await window.__readLocal({ name: 't.pdf', size: bytes.length, bytes })
    res.pdf = d.text.slice(0, 60)
  } catch (e) { res.pdfErr = String((e && e.message) || e) }
  try {
    const t0 = Date.now(); const model = await window.__stt.loadSttModel(); res.sttLoadMs = Date.now() - t0
    const rec = new model.KaldiRecognizer(16000); rec.acceptWaveformFloat(new Float32Array(16000), 16000); rec.remove(); res.stt = 'ok'
  } catch (e) { res.sttErr = String((e && e.message) || e) }
  return JSON.stringify(res)
})()

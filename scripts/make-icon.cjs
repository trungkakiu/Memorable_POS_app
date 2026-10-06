// Tạo build/icon.png (512x512) từ SVG — chạy: npm run icon
const sharp = require('sharp')
const path = require('node:path')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b45f5"/><stop offset="1" stop-color="#5a1fa8"/></linearGradient></defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <path d="M168 120h176a24 24 0 0 1 24 24v248a8 8 0 0 1-12.6 6.5L256 346l-99.4 52.5A8 8 0 0 1 144 392V144a24 24 0 0 1 24-24z" fill="#fff"/>
  <path d="M206 190h100M206 232h100M206 274h62" stroke="#7a2ee6" stroke-width="20" stroke-linecap="round" fill="none"/>
  <circle cx="372" cy="150" r="46" fill="#f5c542" stroke="#fff" stroke-width="12"/>
  <path d="M356 150l11 11 21-24" stroke="#5a1fa8" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`
sharp(Buffer.from(svg)).png().toFile(path.join(__dirname, '..', 'build', 'icon.png')).then(() => console.log('icon.png ok'))

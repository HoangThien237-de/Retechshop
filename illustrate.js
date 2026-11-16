// Sinh ảnh minh họa SVG (data URI) cho sản phẩm chưa có ảnh thật.
const COLORS = {
  'dien-thoai': ['#7c3aed', '#22d3ee'],
  'may-tinh-bang': ['#2563eb', '#c084fc'],
  laptop: ['#0ea5e9', '#818cf8'],
  cpu: ['#f43f5e', '#fbbf24'],
  'ram-ssd': ['#10b981', '#22d3ee'],
  vga: ['#ec4899', '#8b5cf6'],
  other: ['#f59e0b', '#f43f5e'],
};

const ICONS = {
  'dien-thoai': '<rect x="166" y="38" width="68" height="132" rx="14"/><rect x="175" y="52" width="50" height="96" rx="4" fill-opacity=".3"/><circle cx="200" cy="159" r="4"/>',
  'may-tinh-bang': '<rect x="132" y="46" width="136" height="104" rx="12"/><rect x="146" y="58" width="108" height="80" rx="3" fill-opacity=".3"/><circle cx="139" cy="98" r="2"/>',
  laptop: '<rect x="146" y="52" width="108" height="72" rx="6"/><rect x="156" y="62" width="88" height="52" rx="2" fill-opacity=".3"/><path d="M126 136h148l-10 14H136z"/>',
  cpu: '<rect x="160" y="62" width="80" height="80" rx="8"/><rect x="180" y="82" width="40" height="40" rx="4" fill-opacity=".35"/><path d="M172 62v-14M191 62v-14M210 62v-14M229 62v-14M172 142v14M191 142v14M210 142v14M229 142v14M160 74h-14M160 93h-14M160 112h-14M160 131h-14M240 74h14M240 93h14M240 112h14M240 131h14" fill="none"/>',
  'ram-ssd': '<rect x="112" y="80" width="176" height="52" rx="5"/><rect x="128" y="92" width="26" height="28" rx="2" fill-opacity=".35"/><rect x="162" y="92" width="26" height="28" rx="2" fill-opacity=".35"/><rect x="196" y="92" width="26" height="28" rx="2" fill-opacity=".35"/><rect x="230" y="92" width="26" height="28" rx="2" fill-opacity=".35"/><path d="M122 132v12M140 132v12M158 132v12M176 132v12M224 132v12M242 132v12M260 132v12M278 132v12" fill="none"/>',
  vga: '<rect x="100" y="72" width="200" height="76" rx="9"/><circle cx="152" cy="110" r="25" fill-opacity=".3"/><circle cx="152" cy="110" r="7"/><circle cx="224" cy="110" r="25" fill-opacity=".3"/><circle cx="224" cy="110" r="7"/><path d="M120 148v12h70v-12" fill="none"/>',
  other: '<rect x="130" y="50" width="140" height="110" rx="8"/><rect x="152" y="72" width="36" height="36" rx="3" fill-opacity=".35"/><path d="M210 72h40M210 88h40M210 104h40M152 128h96" fill="none"/><circle cx="160" cy="146" r="3"/>',
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wrap(text, max = 22, lines = 2) {
  const out = [];
  let cur = '';
  for (const w of String(text || '').split(/\s+/).filter(Boolean)) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].slice(0, max - 1) + '…'; }
  return out;
}

function illustrate(name, brand, slug) {
  const key = ICONS[slug] ? slug : 'other';
  const [c1, c2] = COLORS[key];
  const icon = ICONS[key];
  const lines = wrap(name);
  const y0 = lines.length > 1 ? 238 : 250;
  const text = lines.map((l, i) => `<text x="200" y="${y0 + i * 27}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="700" fill="#fff">${esc(l)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
<defs>
<linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<radialGradient id="r" cx=".5" cy=".38" r=".6"><stop offset="0" stop-color="${c1}" stop-opacity=".45"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>
<pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#fff" stroke-opacity=".05"/></pattern>
<filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
</defs>
<rect width="400" height="300" fill="#0b0f24"/><rect width="400" height="300" fill="url(#p)"/><rect width="400" height="300" fill="url(#r)"/>
<g fill="url(#a)" fill-opacity=".14" stroke="url(#a)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
<g filter="url(#b)" opacity=".85">${icon}</g><g>${icon}</g></g>
<text x="200" y="205" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" letter-spacing="3" fill="${c2}">${esc(String(brand || '').toUpperCase())}</text>
${text}
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

module.exports = illustrate;

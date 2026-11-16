'use strict';
/* ReTech – giao diện một trang (hash routing), không cần build */
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = n => Number(n || 0).toLocaleString('vi-VN') + '₫';
const when = s => new Date(s.replace(' ', 'T') + 'Z').toLocaleString('vi-VN');

const state = { user: null, cats: [], config: null };
const ST = {
  new: 'Mới đặt', confirmed: 'Đã xác nhận', shipping: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy',
  paid: 'Đã thanh toán', unpaid: 'Chưa thanh toán', contacted: 'Đã liên hệ', offered: 'Đã báo giá', completed: 'Hoàn tất', rejected: 'Từ chối',
};
const PAY = { cod: 'Thanh toán khi nhận hàng (COD)', bank: 'Chuyển khoản ngân hàng', vnpay: 'VNPay' };
const st = k => `<span class="st ${esc(k)}">${esc(ST[k] || k)}</span>`;

async function api(url, opts = {}) {
  const o = { credentials: 'same-origin', ...opts };
  if (o.body && typeof o.body !== 'string') { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.body); }
  const r = await fetch(url, o);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Có lỗi xảy ra');
  return d;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); }

/* ---------- giỏ hàng (lưu trình duyệt) ---------- */
const cart = {
  get() { try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; } },
  set(c) { try { localStorage.setItem('cart', JSON.stringify(c)); } catch {} cart.badge(); },
  add(p, qty = 1) {
    const c = cart.get(), i = c.find(x => x.id === p.id);
    const have = i ? i.qty : 0;
    if (have + qty > p.stock) return toast(`Chỉ còn ${p.stock} sản phẩm`), false;
    if (i) i.qty += qty; else c.push({ id: p.id, name: p.name, price: p.price, image: p.image, stock: p.stock, qty });
    cart.set(c); return true;
  },
  clear() { cart.set([]); },
  count() { return cart.get().reduce((s, i) => s + i.qty, 0); },
  total() { return cart.get().reduce((s, i) => s + i.qty * i.price, 0); },
  badge() { $('#cartCount').textContent = cart.count(); },
};

/* ---------- thành phần chung ---------- */
const condClass = c => 'c' + String(c).replace(/\D/g, '');
function pcard(p) {
  const off = p.original_price > p.price ? Math.round((1 - p.price / p.original_price) * 100) : 0;
  return `<a class="pcard" href="${productUrl(p)}">
    <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
    <span class="tag chip ${condClass(p.condition)}">${esc(p.condition)}</span>${p.consigned ? '<span class="tag2 chip">Ký gửi</span>' : ''}
    ${p.stock <= 0 ? '<div class="sold">Hết hàng</div>' : ''}
    <div class="in"><div class="name">${esc(p.name)}</div>
      <div class="muted" style="font-size:13px">${esc(p.brand)} · BH ${p.warranty_months} tháng</div>
      <div class="foot"><div><span class="price">${vnd(p.price)}</span>${p.original_price > p.price ? `<span class="old">${vnd(p.original_price)}</span>` : ''}</div>
      ${off ? `<span class="chip hot">-${off}%</span>` : ''}</div></div></a>`;
}
function renderUserNav() {
  const u = state.user;
  $('#userNav').innerHTML = u
    ? `${u.role === 'admin' ? '<a href="/admin">Quản trị</a> · ' : ''}<a href="/tai-khoan">${esc(u.name)}</a> · <button class="linklike" id="logoutBtn">Thoát</button>`
    : '<a href="/dang-nhap">Đăng nhập</a>';
  const lb = $('#logoutBtn');
  if (lb) lb.onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; renderUserNav(); nav('/'); toast('Đã đăng xuất'); };
}
function renderCatBar(active) {
  $('#catBar').innerHTML = `<a href="/cua-hang" class="${!active ? 'on' : ''}">Tất cả</a>` +
    state.cats.map(c => `<a href="/cua-hang?category=${c.slug}" class="${active === c.slug ? 'on' : ''}">${c.icon} ${esc(c.name)}</a>`).join('');
}
const slugify = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const productUrl = p => `/san-pham/${slugify(p.name)}-${p.id}`;
function parsePath() {
  return { parts: location.pathname.split('/').filter(Boolean).map(decodeURIComponent), q: Object.fromEntries(new URLSearchParams(location.search)) };
}
function nav(url, replace) {
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  return route();
}
const setTitle = t => { document.title = (t ? t + ' | ' : '') + (state.config ? state.config.shop.name : 'ReTech'); };
// Đọc ảnh người dùng chọn -> JPEG đã thu nhỏ (data URI)
function readImage(file, max = 900) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src); ok(cv.toDataURL('image/jpeg', .8));
    };
    img.onerror = () => no(new Error('Không đọc được ảnh'));
    img.src = URL.createObjectURL(file);
  });
}
function mdLite(t) {
  return String(t).split(/\n{2,}/).map(block => {
    let out = '', list = [], para = [];
    const fl = () => { if (list.length) { out += '<ul>' + list.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>'; list = []; } };
    const fp = () => { if (para.length) { out += '<p>' + para.map(esc).join('<br>') + '</p>'; para = []; } };
    for (const l of block.split('\n')) {
      if (l.startsWith('## ')) { fl(); fp(); out += `<h2>${esc(l.slice(3))}</h2>`; }
      else if (l.startsWith('- ')) { fp(); list.push(l.slice(2)); }
      else { fl(); para.push(l); }
    }
    fl(); fp(); return out;
  }).join('');
}
const guard = (html) => { app.innerHTML = html; window.scrollTo(0, 0); };

/* ---------- trang chủ ---------- */
async function pageHome() {
  const [prods] = await Promise.all([api('/api/products?sort=newest')]);
  guard(`
  <section class="hero"><div>
    <span class="kicker">LEVEL UP · GIÁ SINH VIÊN</span>
    <h1>Lên đồ xịn.<br><span>Giá không đau ví.</span></h1>
    <p>Điện thoại, tablet, laptop, CPU, VGA, RAM, SSD đã kiểm định 40+ điểm, bảo hành và đổi trả 7 ngày. Build dàn máy mơ ước với giá rẻ hơn đến 40%.</p>
    <a class="btn warn" href="/cua-hang">Săn deal ngay</a> <a class="btn alt" href="/thu-mua">Bán máy cũ lấy tiền</a></div>
    <div class="perks"><div class="perk"><b>Kiểm tra 40+ điểm</b>Mỗi máy đều có báo cáo tình trạng</div>
    <div class="perk"><b>Bảo hành 3–12 tháng</b>Lỗi do nhà sản xuất đổi mới trong 7 ngày</div>
    <div class="perk"><b>Giá tốt hơn máy mới đến 40%</b>So với giá niêm yết ban đầu</div></div></section>
  <h2>Danh mục</h2>
  <div class="tiles">${state.cats.map(c => `<a class="tile" href="/cua-hang?category=${c.slug}"><div class="ic">${c.icon}</div><b>${esc(c.name)}</b><small>${c.count} sản phẩm</small></a>`).join('')}</div>
  <h2>Hàng mới lên kệ</h2><div class="grid">${prods.slice(0, 8).map(pcard).join('')}</div>
  <h2>Deal sốc 🔥</h2><div class="grid">${[...prods].filter(p => p.original_price > p.price)
    .sort((a, b) => b.original_price / b.price - a.original_price / a.price).slice(0, 4).map(pcard).join('')}</div>`);
}

/* ---------- cửa hàng ---------- */
async function pageShop(q) {
  const brands = await api('/api/brands');
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  const prods = await api('/api/products?' + qs);
  const cat = state.cats.find(c => c.slug === q.category);
  renderCatBar(q.category);
  const opt = (arr, val) => arr.map(([v, l]) => `<option value="${esc(v)}" ${val === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  guard(`<h1>${cat ? esc(cat.name) : q.q ? `Kết quả cho “${esc(q.q)}”` : 'Tất cả sản phẩm'}</h1>
  <div class="shop"><form class="card filters" id="fform">
    <h3>Bộ lọc</h3>
    <label>Tình trạng máy</label><select name="condition"><option value="">Tất cả</option>${opt(['99%', '95%', '90%', '85%'].map(x => [x, x + ' – ' + ({ '99%': 'như mới', '95%': 'rất đẹp', '90%': 'trầy nhẹ', '85%': 'cũ, có trầy' })[x]]), q.condition)}</select>
    <label>Hãng</label><select name="brand"><option value="">Tất cả</option>${opt(brands.map(b => [b, b]), q.brand)}</select>
    <label>Giá từ (₫)</label><input name="min" type="number" min="0" step="100000" value="${esc(q.min || '')}">
    <label>Đến (₫)</label><input name="max" type="number" min="0" step="100000" value="${esc(q.max || '')}">
    <button class="btn block" style="margin-top:14px">Áp dụng</button>
    <a class="btn alt block sm" style="margin-top:8px" href="/cua-hang${q.category ? '?category=' + esc(q.category) : ''}">Xóa lọc</a></form>
  <div><div class="toolbar"><span class="muted">${prods.length} sản phẩm</span>
    <select id="sortSel" style="width:auto">${opt([['newest', 'Mới nhất'], ['price_asc', 'Giá tăng dần'], ['price_desc', 'Giá giảm dần']], q.sort || 'newest')}</select></div>
    ${prods.length ? `<div class="grid">${prods.map(pcard).join('')}</div>` : '<div class="card empty">Không tìm thấy sản phẩm phù hợp.</div>'}</div></div>`);
  const go = extra => { const n = { ...q, ...extra }; nav('/cua-hang?' + new URLSearchParams(Object.entries(n).filter(([, v]) => v))); };
  $('#fform').onsubmit = e => { e.preventDefault(); go(Object.fromEntries(new FormData(e.target))); };
  $('#sortSel').onchange = e => go({ sort: e.target.value });
}

/* ---------- chi tiết sản phẩm ---------- */
async function pageProduct(id) {
  const p = await api('/api/products/' + id);
  if (p.id) history.replaceState(null, '', productUrl(p)); // chuẩn hóa về link đẹp
  renderCatBar(p.category_slug);
  let qty = 1;
  const specs = (p.specs || '').split('|').filter(Boolean).map(s => { const [k, ...v] = s.split(':'); return `<tr><td>${esc(k)}</td><td>${esc(v.join(':').trim())}</td></tr>`; }).join('');
  const gal = (await api(`/api/products/${id}/gallery`).catch(() => ({ images: [p.image] }))).images;
  setTitle(`${p.name} cũ ${p.condition}`);
  guard(`<p class="muted"><a href="/">Trang chủ</a> / <a href="/cua-hang?category=${esc(p.category_slug)}">${esc(p.category_name)}</a> / ${esc(p.name)}</p>
  <div class="detail"><div class="gal"><img id="mainImg" src="${esc(gal[0])}" alt="${esc(p.name)}">${gal.length > 1 ? `<div class="thumbs">${gal.map((g, n) => `<img src="${esc(g)}" alt="Ảnh ${n + 1}" data-g="${n}" class="${n ? '' : 'on'}">`).join('')}</div>` : ''}</div>
  <div><h1>${esc(p.name)}</h1>
    <p><span class="chip ${condClass(p.condition)}">Tình trạng ${esc(p.condition)}</span> <span class="muted">· ${esc(p.brand)}${p.serial ? ' · Mã: ' + esc(p.serial) : ''}</span>${p.consigned ? ' <span class="chip consign">Hàng ký gửi</span>' : ''}</p>
    <div><span class="price" style="font-size:28px">${vnd(p.price)}</span>${p.original_price > p.price ? `<span class="old">${vnd(p.original_price)}</span>` : ''}</div>
    <p>${esc(p.description)}</p>
    <div class="assure"><div>✔ Bảo hành <b>${p.warranty_months} tháng</b></div><div>✔ Đổi trả trong 7 ngày nếu không đúng mô tả</div><div>✔ Đã kiểm tra 40+ điểm trước khi bán</div></div>
    ${p.stock > 0 ? `<p class="muted">Còn ${p.stock} sản phẩm</p>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div class="qty"><button id="qm" aria-label="Giảm">−</button><span id="qv">1</span><button id="qp" aria-label="Tăng">+</button></div>
      <button class="btn" id="addBtn">Thêm vào giỏ</button><button class="btn warn" id="buyBtn">Mua ngay</button></div>`
      : '<p><b style="color:var(--danger)">Hết hàng</b></p>'}
    <h2>Thông số</h2><table class="specs">${specs}</table></div></div>`);
  app.onclick = e => { const g = e.target.dataset.g; if (g === undefined) return; $('#mainImg').src = gal[+g]; app.querySelectorAll('.thumbs img').forEach(t => t.classList.toggle('on', t.dataset.g === g)); };
  if (p.stock > 0) {
    const upd = () => $('#qv').textContent = qty;
    $('#qm').onclick = () => { qty = Math.max(1, qty - 1); upd(); };
    $('#qp').onclick = () => { qty = Math.min(p.stock, qty + 1); upd(); };
    $('#addBtn').onclick = () => { if (cart.add(p, qty)) toast('Đã thêm vào giỏ hàng'); };
    $('#buyBtn').onclick = () => { if (cart.add(p, qty)) nav('/thanh-toan'); };
  }
}

/* ---------- giỏ hàng ---------- */
function pageCart() {
  renderCatBar();
  const c = cart.get();
  if (!c.length) return guard('<div class="card empty"><h2>Giỏ hàng trống</h2><a class="btn" href="/cua-hang">Tiếp tục mua sắm</a></div>');
  guard(`<h1>Giỏ hàng</h1><div class="two"><div class="card">${c.map((i, n) => `
    <div class="line"><img src="${esc(i.image)}" alt=""><div><a href="${productUrl(i)}"><b>${esc(i.name)}</b></a><div class="price">${vnd(i.price)}</div>
      <div class="qty" style="margin-top:6px"><button data-d="${n}:-1" aria-label="Giảm">−</button><span>${i.qty}</span><button data-d="${n}:1" aria-label="Tăng">+</button></div></div>
      <div class="right"><b>${vnd(i.price * i.qty)}</b><br><button class="linklike muted" data-rm="${n}">Xóa</button></div></div>`).join('')}</div>
    <div class="card"><div class="sum t"><span>Tổng cộng</span><span>${vnd(cart.total())}</span></div>
    <p class="muted">Phí vận chuyển và mã giảm giá được tính ở bước thanh toán.</p><a class="btn block" href="/thanh-toan">Tiến hành thanh toán</a></div></div>`);
  app.onclick = e => {
    const d = e.target.dataset;
    if (d.d) { const [n, k] = d.d.split(':').map(Number); const c2 = cart.get(); c2[n].qty = Math.min(c2[n].stock, Math.max(1, c2[n].qty + k)); cart.set(c2); pageCart(); }
    if (d.rm) { const c2 = cart.get(); c2.splice(+d.rm, 1); cart.set(c2); pageCart(); }
  };
}

/* ---------- thanh toán ---------- */
function pageCheckout() {
  renderCatBar();
  const c = cart.get();
  if (!c.length) return nav('/gio-hang', true);
  const u = state.user || {};
  const provs = state.config.provinces || [];
  let coupon = '', q = null;
  guard(`<h1>Thanh toán</h1><form class="two" id="co"><div class="card"><h3>Thông tin giao hàng</h3>
    <div class="row"><div><label>Họ và tên</label><input name="name" required value="${esc(u.name)}"></div><div><label>Số điện thoại</label><input name="phone" required inputmode="tel" value="${esc(u.phone)}"></div></div>
    <div class="row"><div><label>Tỉnh / Thành phố</label><select name="province" required><option value="">Chọn tỉnh/thành…</option>${provs.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
    <div><label>Email (nhận xác nhận đơn, không bắt buộc)</label><input name="email" type="email" value="${esc(u.email)}" autocomplete="email"></div></div>
    <label>Địa chỉ nhận hàng</label><input name="address" required placeholder="Số nhà, đường, phường/xã, quận/huyện">
    <label>Ghi chú (không bắt buộc)</label><textarea name="note"></textarea>
    <h3 style="margin-top:18px">Phương thức thanh toán</h3>
    <label class="pay on"><input type="radio" name="payment_method" value="cod" checked><span><b>${PAY.cod}</b><br><span class="muted">Kiểm tra hàng rồi trả tiền cho shipper.</span></span></label>
    <label class="pay"><input type="radio" name="payment_method" value="bank"><span><b>${PAY.bank}</b><br><span class="muted">Quét mã QR sau khi đặt đơn.</span></span></label>
    ${state.config.vnpay ? `<label class="pay"><input type="radio" name="payment_method" value="vnpay"><span><b>VNPay</b><br><span class="muted">Thẻ ATM / QR / thẻ quốc tế.</span></span></label>` : ''}
    <div class="err" id="coErr"></div></div>
    <div class="card"><h3>Đơn hàng</h3>${c.map(i => `<div class="sum"><span>${esc(i.name)} × ${i.qty}</span><span>${vnd(i.price * i.qty)}</span></div>`).join('')}
    <div class="coupon"><input id="cpIn" placeholder="Mã giảm giá" autocomplete="off" maxlength="30"><button type="button" class="btn alt sm" id="cpBtn">Áp dụng</button></div><div id="cpMsg" class="muted" style="font-size:14px"></div>
    <div id="sumBox"></div><button class="btn block" id="coBtn">Đặt hàng</button></div></form>`);
  const drawSum = () => {
    const sub = cart.total();
    $('#sumBox').innerHTML = `<div class="sum"><span>Tạm tính</span><span>${vnd(sub)}</span></div>
      <div class="sum"><span>Phí vận chuyển</span><span>${q ? (q.shipping ? vnd(q.shipping) : '<b style="color:var(--ok)">Miễn phí</b>') : '<span class="muted">Chọn tỉnh/thành</span>'}</span></div>
      ${q && q.coupon && q.shipping_original > 0 && q.shipping === 0 && q.subtotal < 1e12 && q.discount === 0 ? `<div class="sum"><span>Mã ${esc(q.coupon.code)}</span><span>-${vnd(q.shipping_original)} ship</span></div>` : ''}
      ${q && q.discount ? `<div class="sum"><span>Giảm giá (${esc(q.coupon.code)})</span><span style="color:var(--ok)">-${vnd(q.discount)}</span></div>` : ''}
      ${q && q.to_free_ship ? `<p class="muted" style="font-size:13px;margin:6px 0">Mua thêm ${vnd(q.to_free_ship)} để được miễn phí vận chuyển.</p>` : ''}
      <div class="sum t"><span>Tổng cộng</span><span>${vnd(q ? q.total : sub)}</span></div>`;
  };
  const requote = async () => {
    const f = Object.fromEntries(new FormData($('#co')));
    if (!f.province) { q = null; drawSum(); if (coupon) $('#cpMsg').innerHTML = '<span class="err">Hãy chọn tỉnh/thành trước khi áp dụng mã.</span>'; return; }
    try {
      q = await api('/api/quote', { method: 'POST', body: { items: cart.get().map(i => ({ id: i.id, qty: i.qty })), province: f.province, coupon, phone: f.phone } });
      if (q.coupon_error) { $('#cpMsg').innerHTML = `<span class="err">${esc(q.coupon_error)}</span>`; coupon = ''; }
      else if (q.coupon) $('#cpMsg').innerHTML = `<span style="color:var(--ok)">✔ ${esc(q.coupon.code)}: ${esc(q.coupon.label)}</span>`;
      else $('#cpMsg').textContent = '';
    } catch (er) { $('#coErr').textContent = er.message; }
    drawSum();
  };
  drawSum();
  $('#cpBtn').onclick = () => { coupon = $('#cpIn').value.trim().toUpperCase(); $('#cpMsg').textContent = ''; requote(); };
  $('#cpIn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#cpBtn').click(); } };
  $('#co').onchange = e => {
    if (e.target.name === 'payment_method') document.querySelectorAll('.pay').forEach(l => l.classList.toggle('on', l.contains(e.target)));
    if (e.target.name === 'province' || e.target.name === 'phone') requote();
  };
  $('#co').onsubmit = async e => {
    e.preventDefault();
    const b = $('#coBtn'); b.disabled = true; $('#coErr').textContent = '';
    try {
      const f = Object.fromEntries(new FormData(e.target));
      const r = await api('/api/orders', { method: 'POST', body: { ...f, coupon, items: cart.get().map(i => ({ id: i.id, qty: i.qty })) } });
      cart.clear();
      if (r.pay_url) location.href = r.pay_url; else nav('/order/' + r.code);
    } catch (err) { $('#coErr').textContent = err.message; b.disabled = false; }
  };
}

async function pageOrder(code) {
  renderCatBar();
  const o = await api('/api/orders/track/' + encodeURIComponent(code));
  const qr = o.payment_method === 'bank' && o.payment_status !== 'paid'
    ? `<div class="card" style="margin-top:16px;text-align:center"><h3>Chuyển khoản để hoàn tất</h3>
       <img class="qr" alt="Mã QR chuyển khoản" src="https://img.vietqr.io/image/${encodeURIComponent(state.config.bank.bankId)}-${encodeURIComponent(state.config.bank.account)}-compact2.png?amount=${o.total}&addInfo=${encodeURIComponent(o.code)}&accountName=${encodeURIComponent(state.config.bank.holder)}">
       <p>Ngân hàng <b>${esc(state.config.bank.bankId)}</b> · STK <b>${esc(state.config.bank.account)}</b><br>Chủ TK: ${esc(state.config.bank.holder)}<br>Số tiền: <b>${vnd(o.total)}</b> · Nội dung: <b>${esc(o.code)}</b></p>
       <p class="muted">${state.config.autoconfirm ? 'Trang này sẽ tự cập nhật ngay khi hệ thống nhận được tiền.' : 'Đơn sẽ được xác nhận sau khi chúng tôi nhận được tiền.'}</p></div>` : '';
  guard(`<div class="card narrow" style="max-width:640px"><h1>Cảm ơn bạn đã đặt hàng!</h1>
    <p>Mã đơn: <b>${esc(o.code)}</b> ${st(o.status)} ${st(o.payment_status)}</p>
    <p class="muted">Hãy lưu lại mã đơn để tra cứu. ${o.payment_method === 'vnpay' && o.payment_status !== 'paid' ? 'Thanh toán VNPay chưa được ghi nhận.' : ''}</p>
    ${o.items.map(i => `<div class="sum"><span>${esc(i.name)} × ${i.qty}</span><span>${vnd(i.price * i.qty)}</span></div>`).join('')}
    ${o.subtotal != null ? `<div class="sum"><span>Tạm tính</span><span>${vnd(o.subtotal)}</span></div><div class="sum"><span>Phí vận chuyển</span><span>${o.shipping_fee ? vnd(o.shipping_fee) : 'Miễn phí'}</span></div>${o.discount ? `<div class="sum"><span>Giảm giá (${esc(o.coupon_code)})</span><span>-${vnd(o.discount)}</span></div>` : ''}` : ''}
    <div class="sum t"><span>Tổng</span><span>${vnd(o.total)}</span></div>
    <p>Giao đến: ${esc(o.customer_name)} · ${esc(o.phone)}<br>${esc(o.address)}${o.province ? ', ' + esc(o.province) : ''}</p>${o.email ? `<p class="muted">Email xác nhận đã gửi tới ${esc(o.email)} (nếu shop đã bật email).</p>` : ''}<p>Thanh toán: ${esc(PAY[o.payment_method])}</p>
    <a class="btn" href="/">Tiếp tục mua sắm</a></div>${qr}`);
  if (qr && state.config.autoconfirm) {
    state.poll = setInterval(async () => {
      try {
        const n = await api('/api/orders/track/' + encodeURIComponent(code));
        if (n.payment_status === 'paid') { clearInterval(state.poll); pageOrder(code); toast('Đã nhận được thanh toán. Cảm ơn bạn!'); }
      } catch {}
    }, 4000);
  }
}

/* ---------- tài khoản ---------- */
function pageAuth(mode) {
  renderCatBar();
  const reg = mode === 'register';
  guard(`<div class="card narrow"><h1>${reg ? 'Tạo tài khoản' : 'Đăng nhập'}</h1><form id="af">
    ${reg ? '<label>Họ và tên</label><input name="name" required><label>Số điện thoại</label><input name="phone" inputmode="tel">' : ''}
    <label>Email</label><input name="email" type="email" required autocomplete="email">
    <label>Mật khẩu</label><input name="password" type="password" required minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}">
    <div class="err" id="aErr"></div><button class="btn block">${reg ? 'Đăng ký' : 'Đăng nhập'}</button></form>
    ${reg ? '' : '<p style="text-align:center;margin:10px 0 0"><a href="/quen-mat-khau">Quên mật khẩu?</a></p>'}
    <p class="muted" style="text-align:center">${reg ? 'Đã có tài khoản? <a href="/dang-nhap"><b>Đăng nhập</b></a>' : 'Chưa có tài khoản? <a href="/dang-ky"><b>Đăng ký</b></a>'}</p></div>`);
  $('#af').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/api/auth/' + (reg ? 'register' : 'login'), { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      state.user = r.user; renderUserNav(); toast('Xin chào ' + r.user.name);
      nav(r.user.role === 'admin' ? '/admin' : '/tai-khoan');
    } catch (err) { $('#aErr').textContent = err.message; }
  };
}

async function pageAccount() {
  renderCatBar();
  if (!state.user) return nav('/dang-nhap');
  const os = await api('/api/orders/mine');
  guard(`<p style="float:right"><a class="btn alt sm" href="/ky-gui">Ký gửi máy của tôi</a></p><h1>Đơn hàng của tôi</h1>${os.length ? os.map(o => `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><a href="/order/${esc(o.code)}"><b>${esc(o.code)}</b></a><span>${st(o.status)} ${st(o.payment_status)}</span></div>
    <div class="muted">${when(o.created_at)}</div>${o.items.map(i => `<div class="sum"><span>${esc(i.name)} × ${i.qty}</span><span>${vnd(i.price * i.qty)}</span></div>`).join('')}
    <div class="sum t"><span>Tổng</span><span>${vnd(o.total)}</span></div></div>`).join('') : '<div class="card empty">Bạn chưa có đơn hàng nào.</div>'}`);
}

/* ---------- thu mua ---------- */
function pageTradein() {
  renderCatBar();
  const u = state.user || {};
  guard(`<div class="card narrow" style="max-width:640px"><h1>Bán / Thu mua máy cũ</h1>
    <p class="muted">Gửi thông tin máy, chúng tôi sẽ liên hệ báo giá trong vòng 24 giờ. Thu mua điện thoại, tablet, laptop, CPU, VGA, RAM, SSD…</p>
    <form id="tf"><div class="row"><div><label>Họ và tên</label><input name="name" required value="${esc(u.name)}"></div><div><label>Số điện thoại</label><input name="phone" required value="${esc(u.phone)}"></div></div>
    <div class="row"><div><label>Loại thiết bị</label><select name="device_type">${state.cats.map(c => `<option>${esc(c.name)}</option>`).join('')}</select></div>
    <div><label>Tên máy / model</label><input name="model" required placeholder="VD: iPhone 11 64GB"></div></div>
    <div class="row"><div><label>Tình trạng</label><select name="condition"><option>Như mới (99%)</option><option>Rất đẹp (95%)</option><option>Trầy nhẹ (90%)</option><option>Cũ, có trầy (85%)</option><option>Có lỗi / hỏng</option></select></div>
    <div><label>Giá mong muốn (₫)</label><input name="expected_price" type="number" min="0" step="50000"></div></div>
    <label>Mô tả thêm</label><textarea name="description" placeholder="Phụ kiện đi kèm, lỗi nếu có, thời gian sử dụng, còn bảo hành không…"></textarea>
    <div class="err" id="tErr"></div><button class="btn block">Gửi yêu cầu báo giá</button></form></div>`);
  $('#tf').onsubmit = async e => {
    e.preventDefault();
    try { await api('/api/tradeins', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); toast('Đã gửi! Chúng tôi sẽ liên hệ sớm.'); }
    catch (err) { $('#tErr').textContent = err.message; }
  };
}

/* ---------- quên / đặt lại mật khẩu ---------- */
function pageForgot() {
  renderCatBar(); setTitle('Quên mật khẩu');
  guard(`<div class="card narrow"><h1>Quên mật khẩu</h1><p class="muted">Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.</p>
    <form id="ff"><label>Email</label><input name="email" type="email" required autocomplete="email"><div class="err" id="fErr"></div><button class="btn block">Gửi liên kết</button></form>
    <p class="muted" style="text-align:center"><a href="/dang-nhap">Quay lại đăng nhập</a></p></div>`);
  $('#ff').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/auth/forgot', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      $('#ff').innerHTML = `<p>Nếu email này đã đăng ký, bạn sẽ nhận được thư hướng dẫn trong ít phút. Hãy kiểm tra cả hộp thư rác.</p>${state.config.mail ? '' : '<p class="muted">Lưu ý: cửa hàng chưa bật gửi email. Vui lòng liên hệ hotline để được hỗ trợ đặt lại mật khẩu.</p>'}`;
    } catch (er) { $('#fErr').textContent = er.message; }
  };
}
function pageReset(q) {
  renderCatBar(); setTitle('Đặt lại mật khẩu');
  guard(`<div class="card narrow"><h1>Đặt mật khẩu mới</h1><form id="rf2"><label>Mật khẩu mới</label><input name="password" type="password" required minlength="6" autocomplete="new-password">
    <label>Nhập lại mật khẩu</label><input name="again" type="password" required minlength="6" autocomplete="new-password"><div class="err" id="rErr"></div><button class="btn block">Đổi mật khẩu</button></form></div>`);
  $('#rf2').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.password !== f.again) return $('#rErr').textContent = 'Hai mật khẩu không giống nhau';
    try { await api('/api/auth/reset', { method: 'POST', body: { token: q.token, password: f.password } }); toast('Đã đổi mật khẩu, hãy đăng nhập'); nav('/dang-nhap'); }
    catch (er) { $('#rErr').textContent = er.message; }
  };
}

/* ---------- chính sách ---------- */
async function pagePolicy(slug) {
  renderCatBar();
  const list = await api('/api/policies');
  const side = `<div class="card pol-nav"><b>Chính sách</b>${list.map(p => `<a href="/chinh-sach/${p.slug}" class="${p.slug === slug ? 'on' : ''}">${esc(p.title)}</a>`).join('')}</div>`;
  if (!slug) { setTitle('Chính sách'); return guard(`<h1>Chính sách &amp; quy định</h1><div class="cgrid">${list.map(p => `<a class="card cbox" href="/chinh-sach/${p.slug}"><b>${esc(p.title)}</b></a>`).join('')}</div>`); }
  const d = await api('/api/policies/' + encodeURIComponent(slug));
  setTitle(d.title);
  guard(`<div class="polwrap">${side}<article class="card policy"><h1>${esc(d.title)}</h1>${mdLite(d.body)}</article></div>`);
}

/* ---------- ký gửi ---------- */
async function pageConsign() {
  renderCatBar(); setTitle('Ký gửi bán hộ');
  const u = state.user || {}, fee = parseInt(state.config.shop.consign_fee_pct, 10) || 0;
  const mine = state.user ? await api('/api/listings/mine').catch(() => []) : [];
  const LS = { pending: 'Chờ duyệt', approved: 'Đang bán', rejected: 'Từ chối' };
  guard(`<div class="two consign"><div class="card"><h1>Ký gửi bán hộ</h1>
    <p class="muted">Bạn có máy cũ muốn bán? Gửi ảnh thật và thông tin, ${esc(state.config.shop.name)} sẽ duyệt, định giá cùng bạn và đăng bán${fee ? ` (phí ký gửi <b>${fee}%</b> khi bán được)` : ''}. Xem thêm <a href="/chinh-sach/ky-gui">quy định ký gửi</a>.</p>
    <form id="lf"><div class="row"><div><label>Họ và tên</label><input name="name" required value="${esc(u.name)}"></div><div><label>Số điện thoại</label><input name="phone" required inputmode="tel" value="${esc(u.phone)}"></div></div>
    <label>Email (nhận kết quả duyệt, không bắt buộc)</label><input name="email" type="email" value="${esc(u.email)}">
    <label>Tên máy / sản phẩm</label><input name="title" required maxlength="150" placeholder="VD: iPhone 12 64GB màu xanh">
    <div class="row"><div><label>Danh mục</label><select name="category_id" required>${state.cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div><label>Hãng</label><input name="brand" placeholder="Apple, Samsung…"></div></div>
    <div class="row"><div><label>Tình trạng</label><select name="condition"><option>99%</option><option selected>95%</option><option>90%</option><option>85%</option></select></div><div><label>Giá mong muốn bán (₫)</label><input name="expected_price" type="number" min="0" required step="50000"></div></div>
    <label>Mô tả (pin, lỗi nếu có, phụ kiện, thời gian sử dụng…)</label><textarea name="description" maxlength="1500"></textarea>
    <label>Ảnh thật của máy (1–5 ảnh)</label><input type="file" id="limg" accept="image/*" multiple><div class="thumbs prev" id="lprev"></div>
    <div class="err" id="lErr"></div><button class="btn block" id="lBtn">Gửi tin ký gửi</button></form></div>
    <div class="card"><h3>Tin ký gửi của tôi</h3>${state.user ? (mine.length ? mine.map(l => `<div class="sum lst"><span>${l.image ? `<img src="${esc(l.image)}" alt="">` : ''}<b>${esc(l.title)}</b><br><span class="muted">${LS[l.status] || l.status}${l.status === 'approved' ? ` · giá ${vnd(l.sell_price)}${l.sold ? ' · ĐÃ BÁN' : ''}` : ''}${l.status === 'rejected' && l.admin_note ? ' · ' + esc(l.admin_note) : ''}</span></span><span class="right">${l.sold ? (l.paid_out ? st('paid') : '<span class="muted">Chờ thanh toán</span>') : ''}</span></div>`).join('') : '<p class="muted">Bạn chưa gửi tin nào.</p>')
      : '<p class="muted"><a href="/dang-nhap">Đăng nhập</a> để theo dõi trạng thái tin ký gửi.</p>'}</div></div>`);
  let images = [];
  $('#limg').onchange = async e => {
    $('#lErr').textContent = '';
    try { images = []; for (const f of [...e.target.files].slice(0, 5)) images.push(await readImage(f, 900)); } catch (er) { $('#lErr').textContent = er.message; }
    $('#lprev').innerHTML = images.map(i => `<img src="${i}" alt="">`).join('');
  };
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const b = $('#lBtn'); b.disabled = true; $('#lErr').textContent = '';
    try {
      await api('/api/listings', { method: 'POST', body: { ...Object.fromEntries(new FormData(e.target)), images } });
      toast('Đã gửi! Shop sẽ liên hệ sớm.'); pageConsign();
    } catch (er) { $('#lErr').textContent = er.message; b.disabled = false; }
  };
}

/* ---------- quản trị ---------- */
async function pageAdmin(tab = 'stats') {
  renderCatBar();
  if (state.user?.role !== 'admin') return guard('<div class="card empty">Bạn cần đăng nhập bằng tài khoản quản trị. <a href="/dang-nhap"><b>Đăng nhập</b></a></div>');
  const unread = 0;
  const adm0 = await api('/api/admin/stats').catch(() => ({}));
  const tabs = [['stats', 'Tổng quan'], ['orders', 'Đơn hàng'], ['products', 'Sản phẩm'], ['categories', 'Danh mục'], ['coupons', 'Mã giảm giá'], ['listings', 'Ký gửi'], ['tradeins', 'Thu mua'], ['bank', 'Chuyển khoản'], ['chats', 'Tin nhắn'], ['policies', 'Chính sách'], ['settings', 'Cài đặt']];
  const head = `<h1>Quản trị</h1><div class="tabs">${tabs.map(([k, l]) => `<a href="/admin/${k}" class="${tab === k ? 'on' : ''}">${l}${k === 'chats' && adm0.unreadChats ? ` <span class="badge">${adm0.unreadChats}</span>` : ''}${k === 'listings' && adm0.pendingListings ? ` <span class="badge">${adm0.pendingListings}</span>` : ''}</a>`).join('')}</div>`;
  const sel = (arr, val, attrs) => `<select ${attrs} style="width:auto;padding:5px 8px">${arr.map(k => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(ST[k])}</option>`).join('')}</select>`;

  if (tab === 'stats') {
    const s = await api('/api/admin/stats');
    guard(head + `<div class="stats"><div class="card stat"><span class="muted">Doanh thu (đã thu)</span><b>${vnd(s.revenue)}</b></div>
      <div class="card stat"><span class="muted">Tổng đơn</span><b>${s.orders}</b></div><div class="card stat"><span class="muted">Đơn mới</span><b>${s.newOrders}</b></div>
      <div class="card stat"><span class="muted">Sản phẩm đang bán</span><b>${s.products}</b></div><div class="card stat"><span class="muted">Yêu cầu thu mua mới</span><b>${s.newTradeins}</b></div></div>
      <h2>Sắp hết hàng</h2><div class="card">${s.lowStock.length ? s.lowStock.map(p => `<div class="sum"><a href="${productUrl(p)}">${esc(p.name)}</a><b>${p.stock}</b></div>`).join('') : 'Không có.'}</div>`);
  }

  if (tab === 'orders') {
    const os = await api('/api/admin/orders');
    guard(head + `<div class="scroll"><table class="tbl"><tr><th>Mã đơn</th><th>Khách hàng</th><th>Sản phẩm</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th></tr>${os.map(o => `<tr>
      <td><b>${esc(o.code)}</b><br><span class="muted">${when(o.created_at)}</span></td>
      <td>${esc(o.customer_name)}<br>${esc(o.phone)}<br><span class="muted">${esc(o.address)}${o.province ? ', ' + esc(o.province) : ''}</span>${o.email ? `<br><span class="muted">${esc(o.email)}</span>` : ''}${o.note ? `<br><i>${esc(o.note)}</i>` : ''}</td>
      <td>${o.items.map(i => `${esc(i.name)} × ${i.qty}`).join('<br>')}</td><td><b>${vnd(o.total)}</b>${o.subtotal != null ? `<br><span class="muted">Ship ${vnd(o.shipping_fee)}${o.discount ? ` · Giảm ${vnd(o.discount)} (${esc(o.coupon_code)})` : ''}</span>` : ''}</td>
      <td>${esc(PAY[o.payment_method])}<br>${sel(['unpaid', 'paid'], o.payment_status, `data-o="${o.id}" data-f="payment_status"`)}</td>
      <td>${sel(['new', 'confirmed', 'shipping', 'delivered', 'cancelled'], o.status, `data-o="${o.id}" data-f="status"`)}</td></tr>`).join('')}</table></div>`);
    app.onchange = async e => {
      const d = e.target.dataset; if (!d.o) return;
      try { await api('/api/admin/orders/' + d.o, { method: 'PUT', body: { [d.f]: e.target.value } }); toast('Đã cập nhật'); } catch (er) { toast(er.message); }
    };
  }

  if (tab === 'tradeins') {
    const ts = await api('/api/admin/tradeins');
    guard(head + (ts.length ? `<div class="scroll"><table class="tbl"><tr><th>Người gửi</th><th>Thiết bị</th><th>Mong muốn</th><th>Xử lý</th></tr>${ts.map(t => `<tr>
      <td>${esc(t.name)}<br>${esc(t.phone)}<br><span class="muted">${when(t.created_at)}</span></td>
      <td><b>${esc(t.model)}</b> (${esc(t.device_type)})<br>${esc(t.condition)}<br><span class="muted">${esc(t.description)}</span></td>
      <td>${t.expected_price ? vnd(t.expected_price) : '—'}</td>
      <td>${sel(['new', 'contacted', 'offered', 'completed', 'rejected'], t.status, `data-t="${t.id}"`)}
      <input type="number" placeholder="Giá báo (₫)" value="${t.offer_price || ''}" data-ti="${t.id}" style="margin-top:6px;padding:5px 8px"></td></tr>`).join('')}</table></div>` : '<div class="card empty">Chưa có yêu cầu thu mua.</div>'));
    app.onchange = async e => {
      const d = e.target.dataset, id = d.t || d.ti; if (!id) return;
      const row = e.target.closest('td');
      try { await api('/api/admin/tradeins/' + id, { method: 'PUT', body: { status: $('select', row).value, offer_price: $('input', row).value } }); toast('Đã cập nhật'); } catch (er) { toast(er.message); }
    };
  }

  if (tab === 'settings') {
    const s = await api('/api/admin/settings');
    const f = (n, l, ph = '', t = 'text') => `<label>${l}</label><input name="${n}" type="${t}" value="${esc(s[n])}" placeholder="${esc(ph)}">`;
    guard(head + `<div class="card narrow" style="max-width:660px;margin:0"><form id="sf">
      <h3>Thông tin hiển thị cho khách</h3><p class="muted">Hiện ở thanh trên cùng, chân trang, trang Liên hệ và hộp chat.</p>
      ${f('name', 'Tên cửa hàng')}${f('phone', 'Số điện thoại / Hotline', '0900 000 000')}${f('email', 'Email hỗ trợ', 'hotro@tenmien.vn', 'email')}
      ${f('zalo', 'Số Zalo (để trống nếu không dùng)', '0900000000')}${f('messenger', 'Messenger (tên trang hoặc link)', 'retechshop hoặc https://m.me/retechshop')}
      ${f('address', 'Địa chỉ cửa hàng')}${f('hours', 'Giờ làm việc', '8:00 – 21:00 hằng ngày')}
      <h3 style="margin-top:22px">Thông tin doanh nghiệp (hiện ở chân trang)</h3>
      <p class="muted">Website bán hàng nên công bố tên chủ sở hữu và mã số thuế. Chỉ điền thông tin thật của bạn.</p>
      ${f('legal_name', 'Tên doanh nghiệp / hộ kinh doanh')}${f('tax_code', 'Mã số thuế', '10 hoặc 13 chữ số')}
      <h3 style="margin-top:22px">Phí vận chuyển</h3>
      ${f('ship_default', 'Phí mặc định (₫)', '30000', 'number')}${f('ship_free_over', 'Miễn phí vận chuyển cho đơn từ (₫), 0 = không miễn phí', '5000000', 'number')}
      <label>Phí riêng theo tỉnh/thành (mỗi dòng một tỉnh, dạng: Hà Nội = 20000)</label><textarea name="ship_rules" rows="4" placeholder="Hà Nội = 20000&#10;TP. Hồ Chí Minh = 20000">${esc(s.ship_rules)}</textarea>
      <h3 style="margin-top:22px">Ký gửi</h3>${f('consign_fee_pct', 'Phí ký gửi mặc định (% giá bán)', '10', 'number')}
      <h3 style="margin-top:22px">Email thông báo</h3>
      <p class="muted">${state.config.mail ? '✔ Máy chủ đã cấu hình SMTP.' : '✖ Chưa cấu hình SMTP nên chưa gửi được email (xem README, mục Email).'} Email này nhận thông báo đơn mới, tin nhắn, thu mua, ký gửi.</p>
      ${f('notify_email', 'Email nhận thông báo của shop', 'ban@gmail.com', 'email')}
      <div class="err" id="sErr"></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn">Lưu cài đặt</button><button type="button" class="btn alt" id="testMail">Gửi email thử</button></div></form></div>`);
    $('#sf').onsubmit = async e => {
      e.preventDefault();
      try { state.config.shop = await api('/api/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); renderShopInfo(); toast('Đã lưu cài đặt'); }
      catch (er) { $('#sErr').textContent = er.message; }
    };
    $('#testMail').onclick = async () => {
      try { const r = await api('/api/admin/test-email', { method: 'POST', body: { to: $('#sf [name=notify_email]').value } }); toast('Đã gửi email thử tới ' + r.to); }
      catch (er) { $('#sErr').textContent = er.message; }
    };
  }

  if (tab === 'categories') {
    const cs = await api('/api/admin/categories');
    guard(head + `<p><button class="btn" id="newC">+ Thêm danh mục</button></p><div class="scroll"><table class="tbl"><tr><th>Biểu tượng</th><th>Tên</th><th>Đường dẫn</th><th>Số sản phẩm</th><th></th></tr>${cs.map(c => `<tr>
      <td style="font-size:22px">${esc(c.icon)}</td><td><b>${esc(c.name)}</b></td><td class="muted">${esc(c.slug)}</td><td>${c.products}</td>
      <td><button class="btn alt sm" data-ce="${c.id}">Sửa</button> <button class="btn red sm" data-cd="${c.id}">Xóa</button></td></tr>`).join('')}</table></div>`);
    const form = (c = {}) => {
      const m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = `<form class="card" style="max-width:420px"><h3>${c.id ? 'Sửa' : 'Thêm'} danh mục</h3><label>Tên danh mục</label><input name="name" required value="${esc(c.name)}">
        <label>Biểu tượng (emoji)</label><input name="icon" maxlength="4" value="${esc(c.icon || '📦')}"><div class="err" id="cErr"></div>
        <div style="display:flex;gap:8px;margin-top:14px"><button class="btn">Lưu</button><button type="button" class="btn alt" id="cCancel">Hủy</button></div></form>`;
      document.body.appendChild(m);
      $('#cCancel', m).onclick = () => m.remove();
      $('form', m).onsubmit = async e => {
        e.preventDefault();
        try {
          const body = Object.fromEntries(new FormData(e.target));
          await api('/api/admin/categories' + (c.id ? '/' + c.id : ''), { method: c.id ? 'PUT' : 'POST', body });
          state.cats = await api('/api/categories'); renderCatBar(); m.remove(); toast('Đã lưu'); pageAdmin('categories');
        } catch (er) { $('#cErr', m).textContent = er.message; }
      };
    };
    $('#newC').onclick = () => form();
    app.onclick = async e => {
      const d = e.target.dataset;
      if (d.ce) form(cs.find(x => x.id === +d.ce));
      if (d.cd && confirm('Xóa danh mục này?')) {
        try { await api('/api/admin/categories/' + d.cd, { method: 'DELETE' }); state.cats = await api('/api/categories'); toast('Đã xóa'); pageAdmin('categories'); } catch (er) { toast(er.message); }
      }
    };
  }

  if (tab === 'coupons') {
    const cp = await api('/api/admin/coupons');
    const TYPE = { percent: 'Giảm %', fixed: 'Giảm tiền', freeship: 'Miễn phí ship' };
    const val = c => c.type === 'percent' ? `${c.value}%${c.max_discount ? ` (tối đa ${vnd(c.max_discount)})` : ''}` : c.type === 'fixed' ? vnd(c.value) : '—';
    guard(head + `<p><button class="btn" id="newCp">+ Thêm mã giảm giá</button></p>${cp.length ? `<div class="scroll"><table class="tbl"><tr><th>Mã</th><th>Loại</th><th>Giá trị</th><th>Điều kiện</th><th>Đã dùng</th><th>Hiệu lực</th><th></th></tr>${cp.map(c => `<tr style="${c.active ? '' : 'opacity:.45'}">
      <td><b>${esc(c.code)}</b>${c.active ? '' : '<br><span class="muted">đang tắt</span>'}</td><td>${TYPE[c.type]}</td><td>${val(c)}</td>
      <td class="muted">${c.min_order ? 'Đơn từ ' + vnd(c.min_order) + '<br>' : ''}${c.per_phone_limit ? c.per_phone_limit + ' lượt/SĐT<br>' : ''}${c.first_order_only ? 'Chỉ đơn đầu tiên' : ''}</td>
      <td>${c.used}${c.usage_limit ? ' / ' + c.usage_limit : ''}</td><td class="muted">${esc(c.starts_at || '…')} → ${esc(c.expires_at || '…')}</td>
      <td><button class="btn alt sm" data-pe="${c.id}">Sửa</button> <button class="btn red sm" data-pd="${c.id}">Xóa</button></td></tr>`).join('')}</table></div>` : '<div class="card empty">Chưa có mã giảm giá nào.</div>'}`);
    const form = (c = {}) => {
      const m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = `<form class="card" style="max-width:560px"><h3>${c.id ? 'Sửa' : 'Thêm'} mã giảm giá</h3>
        <div class="row"><div><label>Mã (chữ/số, không dấu)</label><input name="code" required maxlength="30" value="${esc(c.code)}" style="text-transform:uppercase"></div>
        <div><label>Loại</label><select name="type">${Object.entries(TYPE).map(([k, v]) => `<option value="${k}" ${k === c.type ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
        <div class="row"><div><label>Giá trị (% hoặc ₫)</label><input name="value" type="number" min="0" value="${c.value || ''}"></div><div><label>Giảm tối đa (₫, cho loại %)</label><input name="max_discount" type="number" min="0" value="${c.max_discount || ''}"></div></div>
        <div class="row"><div><label>Đơn tối thiểu (₫)</label><input name="min_order" type="number" min="0" value="${c.min_order || ''}"></div><div><label>Tổng lượt dùng (0 = không giới hạn)</label><input name="usage_limit" type="number" min="0" value="${c.usage_limit ?? 0}"></div></div>
        <div class="row"><div><label>Lượt dùng mỗi SĐT (0 = không giới hạn)</label><input name="per_phone_limit" type="number" min="0" value="${c.per_phone_limit ?? 1}"></div><div></div></div>
        <div class="row"><div><label>Bắt đầu</label><input name="starts_at" type="date" value="${esc(c.starts_at || '')}"></div><div><label>Hết hạn</label><input name="expires_at" type="date" value="${esc(c.expires_at || '')}"></div></div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" name="first_order_only" style="width:auto" ${c.first_order_only ? 'checked' : ''}> Chỉ áp dụng cho đơn đầu tiên của số điện thoại</label>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" style="width:auto" ${c.id && !c.active ? '' : 'checked'}> Đang bật</label>
        <div class="err" id="cpErr"></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn">Lưu</button><button type="button" class="btn alt" id="cpCancel">Hủy</button></div></form>`;
      document.body.appendChild(m);
      $('#cpCancel', m).onclick = () => m.remove();
      $('form', m).onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target), body = Object.fromEntries(fd);
        body.first_order_only = fd.has('first_order_only'); body.active = fd.has('active');
        try { await api('/api/admin/coupons' + (c.id ? '/' + c.id : ''), { method: c.id ? 'PUT' : 'POST', body }); m.remove(); toast('Đã lưu'); pageAdmin('coupons'); }
        catch (er) { $('#cpErr', m).textContent = er.message; }
      };
    };
    $('#newCp').onclick = () => form();
    app.onclick = async e => {
      const d = e.target.dataset;
      if (d.pe) form(cp.find(x => x.id === +d.pe));
      if (d.pd && confirm('Xóa mã này? (mã đã có người dùng sẽ chỉ bị tắt)')) { await api('/api/admin/coupons/' + d.pd, { method: 'DELETE' }); toast('Đã xử lý'); pageAdmin('coupons'); }
    };
  }

  if (tab === 'listings') {
    const ls = await api('/api/admin/listings');
    const LS = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
    guard(head + (ls.length ? ls.map(l => `<div class="card" style="margin-bottom:12px"><div class="lrow"><div class="thumbs prev">${l.images.map(i => `<img src="${esc(i)}" alt="">`).join('')}</div>
      <div><b>${esc(l.title)}</b> <span class="st ${l.status === 'approved' ? 'paid' : l.status === 'rejected' ? 'cancelled' : 'new'}">${LS[l.status]}${l.sold ? ' · đã bán' : ''}</span><br>
      <span class="muted">${esc(l.category_name || '')} · ${esc(l.brand || '')} · ${esc(l.condition || '')} · Mong muốn ${vnd(l.expected_price)}</span><br>
      ${esc(l.name)} · <a href="tel:${digits(l.phone)}">${esc(l.phone)}</a>${l.email ? ' · ' + esc(l.email) : ''} <span class="muted">· ${when(l.created_at)}</span>
      ${l.description ? `<p style="margin:6px 0">${esc(l.description)}</p>` : ''}
      ${l.status === 'pending' ? `<div class="lact" data-l="${l.id}"><input type="number" placeholder="Giá bán (₫)" value="${l.expected_price}" data-f="sell_price"><input type="number" placeholder="Phí %" value="${esc(state.config.shop.consign_fee_pct)}" data-f="fee_pct" style="width:90px" title="Phí ký gửi %">
        <button class="btn sm" data-act="approve">Duyệt & đăng bán</button><button class="btn red sm" data-act="reject">Từ chối</button></div>` : ''}
      ${l.status === 'approved' ? `<p style="margin:6px 0">Giá bán ${vnd(l.sell_price)} · phí ${l.fee_pct}%${l.sold ? ` · <b>cần trả khách ${vnd(l.payout)}</b> <label><input type="checkbox" data-paid="${l.id}" ${l.paid_out ? 'checked' : ''}> đã trả tiền</label>` : ' · đang bán'}</p>` : ''}
      ${l.status === 'rejected' && l.admin_note ? `<p class="muted">Lý do: ${esc(l.admin_note)}</p>` : ''}</div></div></div>`).join('') : '<div class="card empty">Chưa có tin ký gửi nào.</div>'));
    app.onclick = async e => {
      const act = e.target.dataset.act; if (!act) return;
      const box = e.target.closest('.lact'), id = box.dataset.l;
      const body = { action: act, sell_price: $('[data-f=sell_price]', box).value, fee_pct: $('[data-f=fee_pct]', box).value };
      if (act === 'reject') { const r = prompt('Lý do từ chối (gửi cho khách nếu có email):', ''); if (r === null) return; body.admin_note = r; }
      try { await api('/api/admin/listings/' + id, { method: 'PUT', body }); toast(act === 'approve' ? 'Đã đăng bán sản phẩm' : 'Đã từ chối'); pageAdmin('listings'); } catch (er) { toast(er.message); }
    };
    app.onchange = async e => {
      const id = e.target.dataset.paid; if (!id) return;
      try { await api('/api/admin/listings/' + id, { method: 'PUT', body: { action: 'paid', paid_out: e.target.checked } }); toast('Đã cập nhật'); } catch (er) { toast(er.message); }
    };
  }

  if (tab === 'policies') {
    const ps = await api('/api/admin/policies');
    let cur = ps[0].slug;
    const draw = () => {
      const p = ps.find(x => x.slug === cur);
      guard(head + `<div class="polwrap"><div class="card pol-nav"><b>Trang</b>${ps.map(x => `<a href="#" data-p="${x.slug}" class="${x.slug === cur ? 'on' : ''}">${esc(x.title)}${x.customized ? ' ✎' : ''}</a>`).join('')}</div>
        <div class="card"><h3>${esc(p.title)}</h3><p class="muted">Cú pháp: <code>## Tiêu đề</code>, <code>- gạch đầu dòng</code>, đoạn văn cách nhau bằng dòng trống. Biến tự điền: {{name}} {{phone}} {{email}} {{address}} {{hours}} {{consign_fee}}. <b>Hãy sửa cho đúng với cam kết thật của shop.</b> Xem trang: <a href="/chinh-sach/${p.slug}" target="_blank">/chinh-sach/${p.slug}</a></p>
        <textarea id="pbody" rows="18" style="font-family:monospace">${esc(p.body)}</textarea><div class="err" id="pcErr"></div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="btn" id="psave">Lưu</button><button class="btn alt" id="preset">Khôi phục nội dung mẫu</button></div></div></div>`);
      $('#psave').onclick = async () => {
        try { await api('/api/admin/policies/' + cur, { method: 'PUT', body: { body: $('#pbody').value } }); p.body = $('#pbody').value; p.customized = true; toast('Đã lưu'); draw(); } catch (er) { $('#pcErr').textContent = er.message; }
      };
      $('#preset').onclick = async () => {
        if (!confirm('Khôi phục về nội dung mẫu? Nội dung bạn đã sửa sẽ mất.')) return;
        await api('/api/admin/policies/' + cur, { method: 'DELETE' }); ps.splice(0, ps.length, ...await api('/api/admin/policies')); toast('Đã khôi phục'); draw();
      };
      app.onclick = e => { const a = e.target.closest('[data-p]'); if (a) { e.preventDefault(); cur = a.dataset.p; draw(); } };
    };
    draw();
  }

  if (tab === 'chats') {
    let cur = 0, sig = '', lastCur = 0;
    const draw = async force => {
      const list = await api('/api/admin/chats');
      if (!cur && list.length) cur = (list.find(c => c.unread_admin) || list[0]).id;
      const conv = cur ? await api('/api/admin/chats/' + cur).catch(() => null) : null;
      const s = JSON.stringify([cur, list.map(c => [c.id, c.last_at, c.unread_admin]), conv && conv.messages.length]);
      if (!force && s === sig) return;
      sig = s;
      const draft = cur === lastCur && $('#reply') ? $('#reply').value : '';
      lastCur = cur;
      app.innerHTML = head + `<div class="chatadmin"><div class="card chatlist">${list.length ? list.map(c => `<a href="#" data-c="${c.id}" class="cl ${c.id === cur ? 'on' : ''}">
        <b>${esc(c.name)}</b>${c.unread_admin ? ` <span class="badge">${c.unread_admin}</span>` : ''}<br><span class="muted">${esc(c.phone)} · ${esc((c.last_body || '').slice(0, 40))}</span></a>`).join('') : '<div class="muted">Chưa có cuộc trò chuyện nào.</div>'}</div>
        <div class="card">${conv ? `<h3>${esc(conv.chat.name)} · <a href="tel:${digits(conv.chat.phone)}">${esc(conv.chat.phone)}</a></h3>
        <div class="msgs" id="admMsgs">${conv.messages.map(m => `<div class="m ${m.sender === 'admin' ? 'customer' : m.sender === 'customer' ? 'admin' : 'bot'}"><small>${m.sender === 'customer' ? esc(conv.chat.name) : m.sender === 'bot' ? 'Trợ lý tự động' : 'Bạn'} · ${when(m.created_at)}</small><span>${esc(m.body)}</span></div>`).join('')}</div>
        <form id="rf" style="display:flex;gap:8px;margin-top:10px"><input id="reply" required maxlength="1000" placeholder="Nhập câu trả lời…" autocomplete="off"><button class="btn">Gửi</button></form>` : '<div class="empty">Chọn một cuộc trò chuyện bên trái.</div>'}</div></div>`;
      if ($('#reply')) { $('#reply').value = draft; if (force) $('#reply').focus(); }
      const m = $('#admMsgs'); if (m) m.scrollTop = m.scrollHeight;
    };
    app.onclick = e => { const a = e.target.closest('[data-c]'); if (a) { e.preventDefault(); cur = +a.dataset.c; draw(true); } };
    app.onsubmit = async e => {
      e.preventDefault();
      const v = $('#reply').value.trim(); if (!v) return;
      try { await api('/api/admin/chats/' + cur, { method: 'POST', body: { body: v } }); $('#reply').value = ''; lastCur = 0; draw(true); } catch (er) { toast(er.message); }
    };
    await draw(true);
    state.poll = setInterval(() => draw(false).catch(() => {}), 5000);
  }

  if (tab === 'bank') {
    const tx = await api('/api/admin/bank-txns');
    const RES = { paid: 'Đã xác nhận đơn', underpaid: 'Thiếu tiền, cần xử lý tay', no_match: 'Không khớp đơn nào, cần xử lý tay', duplicate: 'Trùng' };
    guard(head + (tx.length ? `<div class="scroll"><table class="tbl"><tr><th>Thời gian</th><th>Mã GD</th><th>Số tiền</th><th>Nội dung chuyển khoản</th><th>Kết quả</th></tr>${tx.map(t => `<tr>
      <td>${when(t.created_at)}</td><td>${esc(t.id)}</td><td><b>${vnd(t.amount)}</b></td><td>${esc(t.content)}</td>
      <td>${t.result === 'paid' ? st('paid') : `<span class="st cancelled">${esc(RES[t.result] || t.result)}</span>`}${t.order_code ? `<br><span class="muted">${esc(t.order_code)}</span>` : ''}</td></tr>`).join('')}</table></div>`
      : '<div class="card empty">Chưa có giao dịch nào từ ngân hàng. Cần bật SePay theo hướng dẫn trong README.</div>'));
  }

  if (tab === 'products') {
    const [ps, cats] = await Promise.all([api('/api/admin/products'), api('/api/admin/categories')]);
    guard(head + `<p><button class="btn" id="newP">+ Thêm sản phẩm</button></p><div class="scroll"><table class="tbl"><tr><th></th><th>Tên</th><th>Giá</th><th>Kho</th><th>Tình trạng</th><th></th></tr>${ps.map(p => `<tr style="${p.active ? '' : 'opacity:.45'}">
      <td style="width:70px"><img src="${esc(p.image)}" alt="" style="width:60px;border-radius:6px"></td><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.category_name)}${p.consigned ? ' · ký gửi' : ''}${p.active ? '' : ' · đã ẩn'}</span></td>
      <td>${vnd(p.price)}</td><td>${p.stock}</td><td>${esc(p.condition)}</td>
      <td><button class="btn alt sm" data-edit="${p.id}">Sửa</button> ${p.active ? `<button class="btn red sm" data-hide="${p.id}">Ẩn</button>` : ''}</td></tr>`).join('')}</table></div>`);
    const form = (p = {}) => {
      const m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = `<form class="card"><h3>${p.id ? 'Sửa' : 'Thêm'} sản phẩm</h3>
        <label>Tên sản phẩm</label><input name="name" required value="${esc(p.name)}">
        <div class="row"><div><label>Danh mục</label><select name="category_id">${cats.map(c => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div><label>Hãng</label><input name="brand" value="${esc(p.brand)}"></div></div>
        <div class="row"><div><label>Giá bán (₫)</label><input name="price" type="number" min="1" required value="${p.price || ''}"></div><div><label>Giá gốc (₫)</label><input name="original_price" type="number" min="0" value="${p.original_price || ''}"></div></div>
        <div class="row"><div><label>Tồn kho</label><input name="stock" type="number" min="0" value="${p.stock ?? 1}"></div><div><label>Bảo hành (tháng)</label><input name="warranty_months" type="number" min="0" value="${p.warranty_months ?? 3}"></div></div>
        <div class="row"><div><label>Tình trạng máy</label><select name="condition">${['99%', '95%', '90%', '85%'].map(c => `<option ${c === p.condition ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div><label>Serial / IMEI</label><input name="serial" value="${esc(p.serial)}"></div></div>
        <label>Mô tả</label><textarea name="description">${esc(p.description)}</textarea>
        <label>Thông số (mỗi dòng: Tên: giá trị, ngăn cách bằng dấu |)</label><textarea name="specs">${esc(p.specs)}</textarea>
        <label>Ảnh chính</label><input type="file" accept="image/*" id="pimg">
        <img id="ppre" src="${esc(p.image || '')}" alt="" style="width:120px;margin-top:8px;border-radius:8px;${p.image ? '' : 'display:none'}">
        <label>Ảnh phụ (tối đa 4, chọn lại sẽ thay thế ảnh phụ cũ)</label><input type="file" accept="image/*" id="pimgs" multiple><div class="thumbs prev" id="pextra"></div>
        <div class="err" id="pErr"></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn">Lưu</button><button type="button" class="btn alt" id="pCancel">Hủy</button></div></form>`;
      document.body.appendChild(m);
      let image = p.image || '', extra = null;
      $('#pimgs', m).onchange = async e => {
        try { extra = []; for (const f of [...e.target.files].slice(0, 4)) extra.push(await readImage(f, 900)); $('#pextra', m).innerHTML = extra.map(i => `<img src="${i}" alt="">`).join(''); }
        catch (er) { $('#pErr', m).textContent = er.message; }
      };
      $('#pCancel', m).onclick = () => m.remove();
      $('#pimg', m).onchange = e => { // thu nhỏ ảnh trước khi lưu
        const f = e.target.files[0]; if (!f) return;
        const img = new Image(); img.onload = () => {
          const s = Math.min(1, 800 / img.width), cv = document.createElement('canvas');
          cv.width = img.width * s; cv.height = img.height * s; cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          image = cv.toDataURL('image/jpeg', .82); const pre = $('#ppre', m); pre.src = image; pre.style.display = 'block';
        }; img.src = URL.createObjectURL(f);
      };
      $('form', m).onsubmit = async e => {
        e.preventDefault();
        try {
          const body = { ...Object.fromEntries(new FormData(e.target)), image, active: 1 };
          const saved = await api('/api/admin/products' + (p.id ? '/' + p.id : ''), { method: p.id ? 'PUT' : 'POST', body });
          if (extra) await api(`/api/admin/products/${p.id || saved.id}/images`, { method: 'PUT', body: { images: extra } });
          m.remove(); toast('Đã lưu'); pageAdmin('products');
        } catch (er) { $('#pErr', m).textContent = er.message; }
      };
    };
    $('#newP').onclick = () => form();
    app.onclick = async e => {
      const d = e.target.dataset;
      if (d.edit) form(ps.find(x => x.id === +d.edit));
      if (d.hide && confirm('Ẩn sản phẩm này khỏi cửa hàng?')) { await api('/api/admin/products/' + d.hide, { method: 'DELETE' }); toast('Đã ẩn'); pageAdmin('products'); }
    };
  }
}

/* ---------- liên hệ & chat CSKH ---------- */
const digits = s => String(s || '').replace(/\D/g, '');
function contactLinks(s) {
  const l = [];
  if (digits(s.phone)) l.push(['📞', 'Gọi ngay', 'tel:' + digits(s.phone)]);
  if (digits(s.zalo)) l.push(['💬', 'Zalo', 'https://zalo.me/' + digits(s.zalo)]);
  const m = String(s.messenger || '').trim();
  if (/^https:\/\//i.test(m)) l.push(['🗨️', 'Messenger', m]);
  else if (/^[A-Za-z0-9.]{3,}$/.test(m)) l.push(['🗨️', 'Messenger', 'https://m.me/' + m]);
  if (/^\S+@\S+\.\S+$/.test(s.email || '')) l.push(['📧', 'Email', 'mailto:' + s.email]);
  return l;
}
const linkAttr = u => `href="${esc(u)}"${u.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}`;
function renderShopInfo() {
  const s = state.config.shop;
  const top = [];
  if (digits(s.phone)) top.push(`📞 Hotline: <a href="tel:${digits(s.phone)}"><b>${esc(s.phone)}</b></a>`);
  if (/^\S+@\S+\.\S+$/.test(s.email || '')) top.push(`📧 <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`);
  if (s.hours) top.push(`🕗 ${esc(s.hours)}`);
  $('#topInfo').innerHTML = top.join('<span class="sep">·</span>');
  $('#footContact').innerHTML = `<b>Liên hệ</b><p>${[
    s.phone && `Hotline: ${esc(s.phone)}`, s.email && `Email: ${esc(s.email)}`, s.address && `Địa chỉ: ${esc(s.address)}`, s.hours && `Giờ làm việc: ${esc(s.hours)}`,
  ].filter(Boolean).join('<br>')}</p><p>${contactLinks(s).map(([i, l, u]) => `<a class="flink" ${linkAttr(u)}>${i} ${l}</a>`).join(' ')}</p>`;
  const lg = $('#footLegal');
  if (lg) lg.innerHTML = [s.legal_name && `<b>${esc(s.legal_name)}</b>`, s.tax_code && `MST: ${esc(s.tax_code)}`].filter(Boolean).join(' · ');
  const t = $('#chatTitle'); if (t) t.textContent = 'Chat với ' + s.name;
  const lk = $('#chatLinks'); if (lk) lk.innerHTML = contactLinks(s).map(([i, l, u]) => `<a ${linkAttr(u)}>${i} ${l}</a>`).join('');
}
function pageContact() {
  renderCatBar();
  const s = state.config.shop;
  const boxes = [['📞', 'Hotline', s.phone], ['📧', 'Email', s.email], ['📍', 'Địa chỉ', s.address], ['🕗', 'Giờ làm việc', s.hours]].filter(x => x[2]);
  guard(`<h1>Liên hệ & hỗ trợ</h1><div class="cgrid">${boxes.map(([i, l, v]) => `<div class="card cbox"><div class="ic">${i}</div><b>${l}</b><div>${esc(v)}</div></div>`).join('')}</div>
    <div class="card" style="margin-top:16px"><h3>Kết nối nhanh</h3><div class="clinks">${contactLinks(s).map(([i, l, u]) => `<a class="btn alt" ${linkAttr(u)}>${i} ${l}</a>`).join('')}
    <button class="btn" id="openChat">💬 Chat với shop</button></div></div>`);
  $('#openChat').onclick = () => chatOpen(true);
}

const chat = { open: false, token: null, last: 0, msgs: [], busy: false };
const chatStore = { get() { try { return localStorage.getItem('chatToken'); } catch { return null; } }, set(v) { try { v ? localStorage.setItem('chatToken', v) : localStorage.removeItem('chatToken'); } catch {} } };
function initChat() {
  chat.token = chatStore.get();
  const w = document.createElement('div'); w.id = 'chatw';
  w.innerHTML = `<button id="chatBtn" aria-label="Chat với shop">💬<span>Chat với shop</span><i id="chatDot" hidden></i></button>
    <section id="chatPanel" hidden aria-label="Chat hỗ trợ khách hàng"><header><div><b id="chatTitle"></b><small>Phản hồi trong giờ làm việc</small></div><button id="chatX" aria-label="Đóng">✕</button></header>
    <div id="chatLinks"></div><div id="chatBody"></div><div id="chatFoot"></div></section>`;
  document.body.appendChild(w);
  $('#chatBtn').onclick = () => chatOpen(!chat.open);
  $('#chatX').onclick = () => chatOpen(false);
  renderShopInfo();
  chatSync();
  setInterval(chatSync, 5000);
}
function chatOpen(v) {
  chat.open = v;
  $('#chatPanel').hidden = !v; $('#chatBtn').hidden = v;
  if (v) { $('#chatDot').hidden = true; chatDraw(); chatSync(); }
}
async function chatSync() {
  if (!chat.token || chat.busy) return;
  try {
    const r = await api(`/api/chat/${chat.token}?after=${chat.last}`);
    if (!r.messages.length) return;
    chat.msgs.push(...r.messages); chat.last = r.messages[r.messages.length - 1].id;
    if (chat.open) chatDraw();
    else if (r.messages.some(m => m.sender === 'admin')) $('#chatDot').hidden = false;
  } catch (e) {
    if (e.message === 'Không tìm thấy cuộc trò chuyện') { chat.token = null; chat.msgs = []; chat.last = 0; chatStore.set(null); if (chat.open) chatDraw(); }
  }
}
function chatDraw() {
  const body = $('#chatBody'), foot = $('#chatFoot'), u = state.user || {};
  if (!chat.token) {
    body.innerHTML = `<form id="cs" class="cstart"><p>Để lại thông tin, nhân viên sẽ trả lời bạn ngay tại đây.</p>
      <input name="name" required maxlength="80" placeholder="Họ và tên" value="${esc(u.name)}">
      <input name="phone" required inputmode="tel" placeholder="Số điện thoại" value="${esc(u.phone)}">
      <textarea name="message" maxlength="1000" placeholder="Bạn cần hỗ trợ điều gì?"></textarea>
      <div class="err" id="csErr"></div><button class="btn block">Bắt đầu chat</button></form>`;
    foot.innerHTML = '';
    $('#cs').onsubmit = async e => {
      e.preventDefault();
      try {
        const r = await api('/api/chat/start', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        chat.token = r.token; chat.msgs = []; chat.last = 0; chatStore.set(r.token);
        await chatSync(); chatDraw();
      } catch (er) { $('#csErr').textContent = er.message; }
    };
    return;
  }
  const near = body.scrollHeight - body.scrollTop - body.clientHeight < 80 || !body.querySelector('.m');
  body.innerHTML = chat.msgs.map(m => `<div class="m ${m.sender}">${m.sender === 'customer' ? '' : `<small>${m.sender === 'bot' ? 'Trợ lý tự động' : 'Nhân viên'}</small>`}<span>${esc(m.body)}</span></div>`).join('');
  if (!foot.querySelector('form')) {
    foot.innerHTML = `<div class="quick">${['Bảo hành', 'Đổi trả', 'Thanh toán', 'Giao hàng'].map(q => `<button type="button" data-q="${q}">${q}</button>`).join('')}</div>
      <form id="cm"><input id="cmIn" maxlength="1000" placeholder="Nhập tin nhắn…" autocomplete="off" required><button class="btn">Gửi</button></form>`;
    const send = async text => {
      if (!text.trim() || chat.busy) return;
      chat.busy = true;
      try { await api('/api/chat/' + chat.token, { method: 'POST', body: { body: text } }); } catch (er) { toast(er.message); }
      chat.busy = false; await chatSync();
    };
    $('#cm').onsubmit = async e => { e.preventDefault(); const i = $('#cmIn'); const v = i.value; i.value = ''; await send(v); };
    foot.querySelector('.quick').onclick = e => { if (e.target.dataset.q) send(e.target.dataset.q); };
  }
  if (near) body.scrollTop = body.scrollHeight;
}

/* ---------- điều hướng (đường dẫn thật, History API) ---------- */
async function route() {
  clearInterval(state.poll);
  app.onclick = app.onchange = app.onsubmit = null;
  const { parts, q } = parsePath();
  const [a, b] = parts;
  setTitle('');
  try {
    if (!a) { renderCatBar(); await pageHome(); }
    else if (a === 'cua-hang') await pageShop(q);
    else if (a === 'san-pham') { const id = /(\d+)$/.exec(b || ''); if (!id) throw new Error('Không tìm thấy sản phẩm'); await pageProduct(id[1]); }
    else if (a === 'gio-hang') pageCart();
    else if (a === 'thanh-toan') pageCheckout();
    else if (a === 'order') await pageOrder(b);
    else if (a === 'dang-nhap') pageAuth('login');
    else if (a === 'dang-ky') pageAuth('register');
    else if (a === 'quen-mat-khau') pageForgot();
    else if (a === 'dat-lai-mat-khau') pageReset(q);
    else if (a === 'tai-khoan') await pageAccount();
    else if (a === 'thu-mua') pageTradein();
    else if (a === 'ky-gui') await pageConsign();
    else if (a === 'lien-he') pageContact();
    else if (a === 'chinh-sach') await pagePolicy(b);
    else if (a === 'admin') await pageAdmin(b);
    else guard('<div class="card empty"><h2>Không tìm thấy trang</h2><a class="btn" href="/">Về trang chủ</a></div>');
  } catch (e) {
    guard(`<div class="card empty"><h2>${esc(e.message)}</h2><a class="btn" href="/">Về trang chủ</a></div>`);
  }
}

// Bấm vào link nội bộ thì chuyển trang không tải lại
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/img/') || /\.\w+$/.test(u.pathname)) return;
  if (a.getAttribute('href') === '#') return;
  e.preventDefault();
  if (u.pathname + u.search === location.pathname + location.search) return window.scrollTo(0, 0);
  nav(u.pathname + u.search);
});
window.addEventListener('popstate', route);
$('#searchForm').onsubmit = e => { e.preventDefault(); const v = $('#searchInput').value.trim(); nav('/cua-hang' + (v ? '?q=' + encodeURIComponent(v) : '')); };

// Link cũ dạng #/product/3 (nếu có người đã lưu) -> đường dẫn mới
(function legacyHash() {
  const h = location.hash;
  if (!h.startsWith('#/')) return;
  const MAP = { shop: 'cua-hang', cart: 'gio-hang', checkout: 'thanh-toan', login: 'dang-nhap', register: 'dang-ky', account: 'tai-khoan', tradein: 'thu-mua', contact: 'lien-he', product: 'san-pham' };
  const [path, qs] = h.slice(2).split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] in MAP) parts[0] = MAP[parts[0]];
  history.replaceState(null, '', '/' + parts.join('/') + (qs ? '?' + qs : ''));
})();

(async function init() {
  cart.badge();
  try {
    const [me, cats, cfg] = await Promise.all([api('/api/auth/me'), api('/api/categories'), api('/api/config')]);
    state.user = me.user; state.cats = cats; state.config = cfg;
    renderShopInfo(); initChat();
  } catch (e) { app.innerHTML = '<div class="card empty">Không kết nối được máy chủ.</div>'; return; }
  renderUserNav();
  route();
})();

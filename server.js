const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const mailer = require('./mailer');
const { PROVINCES, quote, phoneKey } = require('./pricing');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Cấu hình thanh toán (điền qua biến môi trường, xem README)
const BANK = {
  bankId: process.env.BANK_ID || 'VCB',
  account: process.env.BANK_ACCOUNT || '0123456789',
  holder: process.env.BANK_HOLDER || 'CUA HANG DIEN TU CU',
};
const SEPAY_KEY = process.env.SEPAY_API_KEY || '';
const VNPAY = {
  tmn: process.env.VNPAY_TMN_CODE,
  secret: process.env.VNPAY_HASH_SECRET,
  url: process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
};

const app = express();
app.set('trust proxy', 1); // chạy sau proxy của hosting: lấy đúng IP khách
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ---------- tiện ích ----------
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);

function auth(req, _res, next) {
  const t = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (t) {
    try {
      const p = jwt.verify(t, SECRET);
      req.user = db.prepare('SELECT id,name,email,phone,role FROM users WHERE id=?').get(p.id);
    } catch {}
  }
  next();
}
const needUser = (req, res, next) => (req.user ? next() : fail(res, 401, 'Vui lòng đăng nhập'));
const needAdmin = (req, res, next) => (req.user?.role === 'admin' ? next() : fail(res, 403, 'Chỉ dành cho quản trị viên'));
app.use(auth);

function setToken(res, user) {
  const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5 });
}

// Giới hạn đăng nhập sai
const attempts = new Map();
function throttled(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter(t => now - t < 15 * 60e3);
  attempts.set(key, a);
  return a.length >= 10;
}

// ---------- thông tin cửa hàng (sửa trong Quản trị > Cài đặt) ----------
const SETTING_DEFAULTS = {
  name: 'ReTech', phone: '0900 000 000', email: 'hotro@retech.local',
  zalo: '', messenger: '', address: '', hours: '8:00 – 21:00 hằng ngày',
  legal_name: '', tax_code: '', notify_email: '',
  ship_default: '30000', ship_free_over: '5000000', ship_rules: '', consign_fee_pct: '10',
};
function getSettings() {
  const s = { ...SETTING_DEFAULTS };
  db.prepare('SELECT key,value FROM settings').all().forEach(r => { if (r.key in s) s[r.key] = r.value; });
  return s;
}
const publicSettings = () => { const s = getSettings(); delete s.notify_email; return s; };
const hits = new Map();
function limited(key, max, ms) {
  const now = Date.now();
  const a = (hits.get(key) || []).filter(t => now - t < ms);
  if (a.length >= max) { hits.set(key, a); return true; }
  a.push(now); hits.set(key, a); return false;
}

// ---------- cấu hình ----------
app.get('/api/config', (_req, res) =>
  res.json({ bank: BANK, vnpay: !!(VNPAY.tmn && VNPAY.secret), autoconfirm: !!SEPAY_KEY, shop: publicSettings(), provinces: PROVINCES, mail: mailer.enabled() }));

// ---------- xác thực ----------
app.post('/api/auth/register', ah((req, res) => {
  const name = str(req.body.name, 100), email = str(req.body.email, 150).toLowerCase();
  const phone = str(req.body.phone, 20), password = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Tên hoặc email không hợp lệ');
  if (password.length < 6) return fail(res, 400, 'Mật khẩu tối thiểu 6 ký tự');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return fail(res, 409, 'Email đã được đăng ký');
  const r = db.prepare('INSERT INTO users (name,email,phone,password_hash) VALUES (?,?,?,?)')
    .run(name, email, phone, bcrypt.hashSync(password, 10));
  const user = db.prepare('SELECT id,name,email,phone,role FROM users WHERE id=?').get(r.lastInsertRowid);
  setToken(res, user);
  res.json({ user });
}));

app.post('/api/auth/login', ah((req, res) => {
  const email = str(req.body.email, 150).toLowerCase();
  const key = req.ip + email;
  if (throttled(key)) return fail(res, 429, 'Thử quá nhiều lần, vui lòng đợi 15 phút');
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    attempts.get(key).push(Date.now());
    return fail(res, 401, 'Email hoặc mật khẩu không đúng');
  }
  setToken(res, u);
  res.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role } });
}));

app.post('/api/auth/logout', (_req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }));

// ---------- sản phẩm ----------
app.get('/api/categories', (_req, res) => res.json(db.prepare(`
  SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1 AND p.stock>0) AS count
  FROM categories c ORDER BY c.id`).all()));

app.get('/api/products', (req, res) => {
  const { q, category, condition, brand, sort } = req.query;
  const min = int(req.query.min, 0), max = int(req.query.max, 0);
  const w = ['p.active=1'], a = [];
  if (q) { w.push('(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ?)'); a.push(...Array(3).fill(`%${str(q, 80)}%`)); }
  if (category) { w.push('c.slug=?'); a.push(str(category, 50)); }
  if (condition) { w.push('p.condition=?'); a.push(str(condition, 20)); }
  if (brand) { w.push('p.brand=?'); a.push(str(brand, 50)); }
  if (min) { w.push('p.price>=?'); a.push(min); }
  if (max) { w.push('p.price<=?'); a.push(max); }
  const order = { price_asc: 'p.price ASC', price_desc: 'p.price DESC', newest: 'p.id DESC' }[sort] || 'p.id DESC';
  const rows = db.prepare(`SELECT p.*, c.slug AS category_slug, c.name AS category_name
    FROM products p JOIN categories c ON c.id=p.category_id WHERE ${w.join(' AND ')} ORDER BY (p.stock>0) DESC, ${order}`).all(...a);
  res.json(rows);
});

app.get('/api/brands', (_req, res) =>
  res.json(db.prepare('SELECT DISTINCT brand FROM products WHERE active=1 AND brand IS NOT NULL ORDER BY brand').all().map(r => r.brand)));

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare(`SELECT p.*, c.slug AS category_slug, c.name AS category_name
    FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1`).get(int(req.params.id));
  if (!p) return fail(res, 404, 'Không tìm thấy sản phẩm');
  res.json(p);
});

// ---------- đơn hàng ----------
function orderCode() {
  return 'DH' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
}

const createOrder = db.transaction((req) => {
  const b = req.body;
  const name = str(b.name, 100), phone = str(b.phone, 20), address = str(b.address, 300);
  const email = str(b.email, 150).toLowerCase(), province = str(b.province, 60);
  const method = ['cod', 'bank', 'vnpay'].includes(b.payment_method) ? b.payment_method : null;
  if (!name || !/^[0-9+\s]{8,15}$/.test(phone) || !address) throw { code: 400, msg: 'Vui lòng nhập đủ họ tên, số điện thoại hợp lệ và địa chỉ' };
  if (!PROVINCES.includes(province)) throw { code: 400, msg: 'Vui lòng chọn tỉnh/thành phố' };
  if (email && !mailer.validEmail(email)) throw { code: 400, msg: 'Email không hợp lệ' };
  if (!method) throw { code: 400, msg: 'Phương thức thanh toán không hợp lệ' };
  if (method === 'vnpay' && !(VNPAY.tmn && VNPAY.secret)) throw { code: 400, msg: 'VNPay chưa được cấu hình' };

  const q = quote(db, getSettings(), { items: b.items, province, coupon: b.coupon, phone }, true); // giá luôn tính ở máy chủ
  for (const l of q.lines) {
    if (l.p.stock < l.qty) throw { code: 409, msg: `"${l.p.name}" chỉ còn ${l.p.stock} sản phẩm` };
    db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(l.qty, l.p.id);
  }
  const code = orderCode();
  const r = db.prepare(`INSERT INTO orders (code,user_id,customer_name,phone,email,address,province,note,payment_method,subtotal,shipping_fee,discount,coupon_code,total)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code, req.user?.id || null, name, phone, email || null, address, province, str(b.note, 300), method,
    q.subtotal, q.shipping, q.discount, q.coupon ? q.coupon.code : null, q.total);
  const ii = db.prepare('INSERT INTO order_items (order_id,product_id,name,price,qty) VALUES (?,?,?,?,?)');
  q.lines.forEach(l => ii.run(r.lastInsertRowid, l.p.id, l.p.name, l.p.price, l.qty));
  if (q.coupon) db.prepare('INSERT INTO coupon_uses (coupon_id,order_id,phone) VALUES (?,?,?)').run(q.coupon.id, r.lastInsertRowid, phoneKey(phone));
  return { id: r.lastInsertRowid, code, total: q.total, method, q, name, phone, email, address, province };
});

// Xem trước tiền hàng (phí ship + mã giảm giá) cho trang thanh toán
app.post('/api/quote', ah((req, res) => {
  try {
    const b = req.body || {};
    const q = quote(db, getSettings(), { items: b.items, province: str(b.province, 60), coupon: str(b.coupon, 40), phone: str(b.phone, 20) }, false);
    res.json({ subtotal: q.subtotal, shipping: q.shipping, shipping_original: q.shipping_original, discount: q.discount, total: q.total,
      coupon: q.coupon && { code: q.coupon.code, label: q.coupon.label }, coupon_error: q.coupon_error, to_free_ship: q.to_free_ship });
  } catch (e) { if (e.code) return fail(res, e.code, e.msg); throw e; }
}));

function vnpSign(params) {
  const keys = Object.keys(params).sort();
  const data = keys.map(k => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`).join('&');
  return { data, sig: crypto.createHmac('sha512', VNPAY.secret).update(Buffer.from(data, 'utf-8')).digest('hex') };
}
const vnpDate = d => new Date(d.getTime() + 7 * 3600e3).toISOString().replace(/\D/g, '').slice(0, 14);

app.post('/api/orders', ah((req, res) => {
  let o;
  try { o = createOrder(req); } catch (e) { if (e.code) return fail(res, e.code, e.msg); throw e; }
  const shop = publicSettings();
  const mail = { code: o.code, name: o.name, phone: o.phone, email: o.email, address: o.address, province: o.province, method: o.method, q: o.q };
  if (o.email) mailer.orderConfirmation(mail, shop, BASE_URL);
  if (getSettings().notify_email) mailer.newOrderAlert(getSettings().notify_email, mail, shop, BASE_URL);
  const out = { code: o.code, total: o.total, payment_method: o.method };
  if (o.method === 'vnpay') {
    const params = {
      vnp_Version: '2.1.0', vnp_Command: 'pay', vnp_TmnCode: VNPAY.tmn,
      vnp_Amount: o.total * 100, vnp_CurrCode: 'VND', vnp_TxnRef: o.code,
      vnp_OrderInfo: `Thanh toan don hang ${o.code}`, vnp_OrderType: 'other', vnp_Locale: 'vn',
      vnp_ReturnUrl: `${BASE_URL}/api/payment/vnpay-return`,
      vnp_IpAddr: req.ip.replace('::ffff:', ''), vnp_CreateDate: vnpDate(new Date()),
    };
    const { data, sig } = vnpSign(params);
    out.pay_url = `${VNPAY.url}?${data}&vnp_SecureHash=${sig}`;
  }
  res.json(out);
}));

app.get('/api/payment/vnpay-return', (req, res) => {
  if (!(VNPAY.tmn && VNPAY.secret)) return res.redirect('/');
  const q = { ...req.query };
  const hash = q.vnp_SecureHash;
  delete q.vnp_SecureHash; delete q.vnp_SecureHashType;
  const ok = hash && vnpSign(q).sig === hash;
  const code = str(q.vnp_TxnRef, 40);
  if (ok && q.vnp_ResponseCode === '00') {
    const o = db.prepare('SELECT total FROM orders WHERE code=?').get(code);
    if (o && o.total * 100 === int(q.vnp_Amount)) {
      db.prepare("UPDATE orders SET payment_status='paid' WHERE code=?").run(code);
    }
  }
  res.redirect(`/order/${encodeURIComponent(code)}`);
});

// Webhook SePay: tự xác nhận đơn chuyển khoản khi tiền về tài khoản.
// Cấu hình tại SePay: Webhooks -> kiểu chứng thực "API Key", giá trị = biến SEPAY_API_KEY.
app.post('/api/payment/sepay-webhook', (req, res) => {
  if (!SEPAY_KEY) return fail(res, 503, 'Chưa bật tự xác nhận thanh toán');
  const got = Buffer.from((req.headers.authorization || '').replace(/^Apikey\s+/i, ''));
  const want = Buffer.from(SEPAY_KEY);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return fail(res, 401, 'Sai khóa xác thực');
  const t = req.body || {};
  if (t.transferType !== 'in') return res.json({ success: true });
  const txId = str(t.id || t.referenceCode, 80), amount = int(t.transferAmount);
  if (!txId || amount <= 0) return fail(res, 400, 'Thiếu mã hoặc số tiền giao dịch');
  const content = str(`${t.content || ''} ${t.description || ''}`, 300);
  const text = `${t.code || ''} ${content}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const result = db.transaction(() => {
    if (db.prepare('SELECT 1 FROM bank_txns WHERE id=?').get(txId)) return 'duplicate';
    const open = db.prepare("SELECT code,total FROM orders WHERE payment_method='bank' AND payment_status='unpaid' AND status!='cancelled'").all();
    const o = open.find(x => text.includes(x.code));
    let r = 'no_match';
    if (o) {
      if (amount >= o.total) {
        db.prepare("UPDATE orders SET payment_status='paid', status=CASE WHEN status='new' THEN 'confirmed' ELSE status END WHERE code=?").run(o.code);
        r = 'paid';
      } else r = 'underpaid';
    }
    db.prepare('INSERT INTO bank_txns (id,order_code,amount,content,result) VALUES (?,?,?,?,?)').run(txId, o ? o.code : null, amount, content, r);
    return r;
  })();
  console.log(`[SePay] GD ${txId} ${amount}đ -> ${result}`);
  res.json({ success: true });
});

// Tra cứu đơn theo mã (mã đơn khó đoán nên dùng làm khóa tra cứu cho khách vãng lai)
app.get('/api/orders/track/:code', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE code=?').get(str(req.params.code, 40));
  if (!o) return fail(res, 404, 'Không tìm thấy đơn hàng');
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id);
  res.json(o);
});

app.get('/api/orders/mine', needUser, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  const gi = db.prepare('SELECT * FROM order_items WHERE order_id=?');
  rows.forEach(o => (o.items = gi.all(o.id)));
  res.json(rows);
});

function notifyShop(subject, text, adminPath) {
  const to = getSettings().notify_email;
  if (to) mailer.simple(to, `${subject} - ${getSettings().name}`, publicSettings(), subject, text, BASE_URL + (adminPath || '/admin'));
}

// ---------- thu mua / trade-in ----------
app.post('/api/tradeins', ah((req, res) => {
  const b = req.body;
  const name = str(b.name, 100), phone = str(b.phone, 20), model = str(b.model, 150);
  if (!name || !/^[0-9+\s]{8,15}$/.test(phone) || !model) return fail(res, 400, 'Vui lòng nhập đủ họ tên, số điện thoại và tên máy');
  db.prepare(`INSERT INTO tradeins (user_id,name,phone,device_type,model,condition,expected_price,description)
    VALUES (?,?,?,?,?,?,?,?)`).run(req.user?.id || null, name, phone, str(b.device_type, 50) || 'Khác', model,
    str(b.condition, 100) || 'Chưa rõ', int(b.expected_price) || null, str(b.description, 800));
  notifyShop('Yêu cầu thu mua mới', `${name} (${phone}) muốn bán: ${model}\nGiá mong muốn: ${int(b.expected_price) ? int(b.expected_price).toLocaleString('vi-VN') + 'đ' : 'chưa nêu'}`, '/admin/tradeins');
  res.json({ ok: true });
}));

// ---------- chat chăm sóc khách hàng ----------
const FAQ = [
  [/bảo hành|bao hanh/i, 'Máy bán ra có bảo hành 3–12 tháng tùy sản phẩm (ghi rõ ở trang chi tiết). Lỗi do nhà sản xuất được đổi mới trong 7 ngày.'],
  [/đổi trả|doi tra|hoàn tiền|hoan tien/i, 'Bạn được đổi trả trong 7 ngày nếu sản phẩm không đúng mô tả. Nhân viên sẽ hỗ trợ chi tiết khi liên hệ.'],
  [/thanh toán|thanh toan|chuyển khoản|chuyen khoan|\bcod\b|\bqr\b/i, 'Shop nhận thanh toán khi nhận hàng (COD) hoặc chuyển khoản QR. Các hình thức khác (nếu có) sẽ hiện ở bước thanh toán.'],
  [/ship|giao hàng|giao hang|vận chuyển|van chuyen/i, 'Phí vận chuyển được xác nhận khi chốt đơn, nhân viên sẽ báo cụ thể theo địa chỉ của bạn.'],
  [/thu mua|bán máy|ban may|trade/i, 'Bạn gửi thông tin máy ở trang "Thu mua", shop sẽ báo giá trong vòng 24 giờ.'],
];
function addMsg(chatId, sender, body) {
  db.prepare('INSERT INTO chat_msgs (chat_id,sender,body) VALUES (?,?,?)').run(chatId, sender, body);
  db.prepare("UPDATE chats SET last_at=datetime('now') WHERE id=?").run(chatId);
}
function faqReply(chatId, text) {
  const hit = FAQ.find(([re]) => re.test(text));
  if (hit) addMsg(chatId, 'bot', hit[1]);
}
const chatByToken = t => (/^[a-f0-9]{32}$/.test(String(t)) ? db.prepare('SELECT * FROM chats WHERE token=?').get(String(t)) : null);

app.post('/api/chat/start', ah((req, res) => {
  if (limited('chatstart:' + req.ip, 6, 3600e3)) return fail(res, 429, 'Bạn gửi quá nhiều yêu cầu, vui lòng thử lại sau');
  const name = str(req.body.name, 80), phone = str(req.body.phone, 20), msg = str(req.body.message, 1000);
  if (!name || !/^[0-9+\s]{8,15}$/.test(phone)) return fail(res, 400, 'Vui lòng nhập tên và số điện thoại hợp lệ');
  const token = crypto.randomBytes(16).toString('hex');
  const id = db.prepare('INSERT INTO chats (token,user_id,name,phone,unread_admin) VALUES (?,?,?,?,?)')
    .run(token, req.user?.id || null, name, phone, msg ? 1 : 0).lastInsertRowid;
  if (msg) addMsg(id, 'customer', msg);
  addMsg(id, 'bot', `Chào ${name}! Shop đã nhận tin nhắn và sẽ phản hồi trong giờ làm việc (${getSettings().hours}). Bạn có thể hỏi nhanh về bảo hành, đổi trả, thanh toán, giao hàng.`);
  if (msg) faqReply(id, msg);
  notifyShop('Khách mới nhắn tin', `${name} (${phone}):\n${msg || '(chưa có nội dung)'}`, '/admin/chats');
  res.json({ token });
}));

app.get('/api/chat/:token', (req, res) => {
  const c = chatByToken(req.params.token);
  if (!c) return fail(res, 404, 'Không tìm thấy cuộc trò chuyện');
  const messages = db.prepare('SELECT id,sender,body,created_at FROM chat_msgs WHERE chat_id=? AND id>? ORDER BY id').all(c.id, int(req.query.after));
  res.json({ messages });
});

app.post('/api/chat/:token', ah((req, res) => {
  const c = chatByToken(req.params.token);
  if (!c) return fail(res, 404, 'Không tìm thấy cuộc trò chuyện');
  const body = str(req.body.body, 1000);
  if (!body) return fail(res, 400, 'Tin nhắn trống');
  if (limited('chatmsg:' + c.token, 40, 3600e3)) return fail(res, 429, 'Bạn nhắn quá nhanh, vui lòng thử lại sau');
  addMsg(c.id, 'customer', body);
  db.prepare('UPDATE chats SET unread_admin=unread_admin+1 WHERE id=?').run(c.id);
  faqReply(c.id, body);
  res.json({ ok: true });
}));

// ---------- quản trị ----------
const admin = express.Router();
admin.use(needAdmin);

admin.get('/stats', (_req, res) => {
  const one = sql => db.prepare(sql).get();
  res.json({
    revenue: one("SELECT COALESCE(SUM(total),0) v FROM orders WHERE status IN ('delivered') OR payment_status='paid'").v,
    orders: one('SELECT COUNT(*) v FROM orders').v,
    newOrders: one("SELECT COUNT(*) v FROM orders WHERE status='new'").v,
    products: one('SELECT COUNT(*) v FROM products WHERE active=1').v,
    lowStock: db.prepare('SELECT id,name,stock FROM products WHERE active=1 AND stock<=2 ORDER BY stock').all(),
    newTradeins: one("SELECT COUNT(*) v FROM tradeins WHERE status='new'").v,
    pendingListings: one("SELECT COUNT(*) v FROM listings WHERE status='pending'").v,
    unreadChats: one('SELECT COALESCE(SUM(unread_admin),0) v FROM chats').v,
  });
});

admin.get('/products', (_req, res) => res.json(db.prepare(`SELECT p.*, c.name AS category_name
  FROM products p JOIN categories c ON c.id=p.category_id ORDER BY p.id DESC`).all()));

function productImage(b) {
  const img = String(b.image || '').slice(0, 500000);
  if (img && !img.startsWith('data:image/svg+xml')) return img; // ảnh thật do admin tải lên
  const c = db.prepare('SELECT slug FROM categories WHERE id=?').get(int(b.category_id));
  return db.illustrate(str(b.name, 200), str(b.brand, 60), c && c.slug);
}
function productFields(b) {
  const price = int(b.price);
  if (!str(b.name) || price <= 0 || !int(b.category_id)) throw { code: 400, msg: 'Tên, danh mục và giá là bắt buộc' };
  return [int(b.category_id), str(b.name, 200), str(b.brand, 60), str(b.description, 2000), str(b.specs, 2000),
    str(b.condition, 30) || '95%', price, int(b.original_price) || null, Math.max(0, int(b.stock)),
    Math.max(0, int(b.warranty_months)), str(b.serial, 60), productImage(b), b.active === 0 || b.active === false ? 0 : 1];
}
admin.post('/products', ah((req, res) => {
  try {
    const r = db.prepare(`INSERT INTO products (category_id,name,brand,description,specs,condition,price,original_price,stock,warranty_months,serial,image,active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...productFields(req.body));
    res.json({ id: r.lastInsertRowid });
  } catch (e) { if (e.code) return fail(res, e.code, e.msg); throw e; }
}));
admin.put('/products/:id', ah((req, res) => {
  try {
    db.prepare(`UPDATE products SET category_id=?,name=?,brand=?,description=?,specs=?,condition=?,price=?,original_price=?,stock=?,warranty_months=?,serial=?,image=?,active=? WHERE id=?`)
      .run(...productFields(req.body), int(req.params.id));
    res.json({ ok: true });
  } catch (e) { if (e.code) return fail(res, e.code, e.msg); throw e; }
}));
admin.delete('/products/:id', (req, res) => {
  // Ẩn thay vì xóa để giữ lịch sử đơn hàng
  db.prepare('UPDATE products SET active=0 WHERE id=?').run(int(req.params.id));
  res.json({ ok: true });
});

admin.get('/orders', (_req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  const gi = db.prepare('SELECT * FROM order_items WHERE order_id=?');
  rows.forEach(o => (o.items = gi.all(o.id)));
  res.json(rows);
});
const STATUSES = ['new', 'confirmed', 'shipping', 'delivered', 'cancelled'];
admin.put('/orders/:id', ah((req, res) => {
  const id = int(req.params.id);
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) return fail(res, 404, 'Không tìm thấy đơn');
  const status = req.body.status, ps = req.body.payment_status;
  if (status && !STATUSES.includes(status)) return fail(res, 400, 'Trạng thái không hợp lệ');
  if (ps && !['unpaid', 'paid'].includes(ps)) return fail(res, 400, 'Trạng thái thanh toán không hợp lệ');
  db.transaction(() => {
    // Hoàn kho khi hủy đơn, trừ lại nếu khôi phục
    if (status && status !== o.status) {
      if (status === 'cancelled') db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id)
        .forEach(i => db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.qty, i.product_id));
      if (o.status === 'cancelled') db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id)
        .forEach(i => db.prepare('UPDATE products SET stock=MAX(0,stock-?) WHERE id=?').run(i.qty, i.product_id));
      if (status === 'cancelled') db.prepare('UPDATE coupon_uses SET released=1 WHERE order_id=?').run(id);
      if (o.status === 'cancelled') db.prepare('UPDATE coupon_uses SET released=0 WHERE order_id=?').run(id);
      db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, id);
    }
    if (ps) db.prepare('UPDATE orders SET payment_status=? WHERE id=?').run(ps, id);
  })();
  res.json({ ok: true });
}));

admin.get('/tradeins', (_req, res) => res.json(db.prepare('SELECT * FROM tradeins ORDER BY id DESC').all()));
admin.put('/tradeins/:id', ah((req, res) => {
  const status = req.body.status;
  if (!['new', 'contacted', 'offered', 'completed', 'rejected'].includes(status)) return fail(res, 400, 'Trạng thái không hợp lệ');
  db.prepare('UPDATE tradeins SET status=?, offer_price=? WHERE id=?').run(status, int(req.body.offer_price) || null, int(req.params.id));
  res.json({ ok: true });
}));
admin.get('/bank-txns', (_req, res) => res.json(db.prepare('SELECT * FROM bank_txns ORDER BY rowid DESC LIMIT 200').all()));
admin.get('/chats', (_req, res) => res.json(db.prepare(`SELECT c.*, (SELECT body FROM chat_msgs m WHERE m.chat_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_body
  FROM chats c ORDER BY c.last_at DESC, c.id DESC LIMIT 100`).all()));
admin.get('/chats/:id', (req, res) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id=?').get(int(req.params.id));
  if (!chat) return fail(res, 404, 'Không tìm thấy cuộc trò chuyện');
  db.prepare('UPDATE chats SET unread_admin=0 WHERE id=?').run(chat.id);
  res.json({ chat, messages: db.prepare('SELECT id,sender,body,created_at FROM chat_msgs WHERE chat_id=? ORDER BY id').all(chat.id) });
});
admin.post('/chats/:id', ah((req, res) => {
  const chat = db.prepare('SELECT id FROM chats WHERE id=?').get(int(req.params.id));
  const body = str(req.body.body, 1000);
  if (!chat) return fail(res, 404, 'Không tìm thấy cuộc trò chuyện');
  if (!body) return fail(res, 400, 'Tin nhắn trống');
  addMsg(chat.id, 'admin', body);
  res.json({ ok: true });
}));
require('./extras')({ app, admin, db, ah, fail, str, int, limited, getSettings, publicSettings, mailer, BASE_URL, notifyShop, SETTING_DEFAULTS });
app.use('/api/admin', admin);

// ---------- lỗi ----------
app.use('/api', (_req, res) => fail(res, 404, 'Không tìm thấy'));
app.use((err, _req, res, _next) => { console.error(err); fail(res, 500, 'Lỗi máy chủ'); });

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Website chạy tại ${BASE_URL}`);
    if (!process.env.JWT_SECRET) console.log('Lưu ý: chưa đặt JWT_SECRET, phiên đăng nhập sẽ mất khi khởi động lại.');
  });
}
module.exports = app;

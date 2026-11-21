// Các tính năng bổ sung: chính sách, ký gửi, mã giảm giá, danh mục, quên mật khẩu, SEO, cài đặt mở rộng.
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PROVINCES, phoneKey } = require('./pricing');
const { POLICIES, BY_SLUG, fill } = require('./policies');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

module.exports = function extras(ctx) {
  const { app, admin, db, ah, fail, str, int, limited, getSettings, publicSettings, mailer, BASE_URL, notifyShop, SETTING_DEFAULTS } = ctx;
  const phoneOk = v => /^[0-9+\s]{8,15}$/.test(v);

  // ---------- Chính sách ----------
  const policyBody = slug => {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get('policy:' + slug);
    return row ? row.value : BY_SLUG[slug].body;
  };
  app.get('/api/policies', (_req, res) => res.json(POLICIES.map(p => ({ slug: p.slug, title: p.title }))));
  app.get('/api/policies/:slug', (req, res) => {
    const p = BY_SLUG[req.params.slug];
    if (!p) return fail(res, 404, 'Không tìm thấy trang');
    res.json({ slug: p.slug, title: p.title, body: fill(policyBody(p.slug), getSettings()) });
  });

  // ---------- Ảnh sản phẩm ----------
  app.get('/api/products/:id/gallery', (req, res) => {
    const id = int(req.params.id);
    const p = db.prepare('SELECT image FROM products WHERE id=? AND active=1').get(id);
    if (!p) return fail(res, 404, 'Không tìm thấy sản phẩm');
    const extra = db.prepare('SELECT image FROM product_images WHERE product_id=? ORDER BY position,id').all(id).map(r => r.image);
    res.json({ images: [p.image, ...extra].filter(Boolean) });
  });
  app.get('/img/product/:id', (req, res) => {
    const p = db.prepare('SELECT image FROM products WHERE id=? AND active=1').get(int(req.params.id));
    const m = p && /^data:([\w+/.-]+)(;utf8|;base64),(.*)$/s.exec(p.image || '');
    if (!m) return res.status(404).end();
    res.type(m[1]).set('Cache-Control', 'public, max-age=3600')
      .send(m[2] === ';base64' ? Buffer.from(m[3], 'base64') : decodeURIComponent(m[3]));
  });

  // ---------- Quên / đặt lại mật khẩu ----------
  app.post('/api/auth/forgot', ah(async (req, res) => {
    if (limited('forgot:' + req.ip, 5, 3600e3)) return fail(res, 429, 'Bạn thử quá nhiều lần, vui lòng đợi một lúc');
    const email = str(req.body.email, 150).toLowerCase();
    const u = /^\S+@\S+\.\S+$/.test(email) && db.prepare('SELECT id,email FROM users WHERE email=?').get(email);
    if (u) {
      const token = crypto.randomBytes(24).toString('hex');
      db.prepare('DELETE FROM password_resets WHERE user_id=? OR expires_at<?').run(u.id, Date.now());
      db.prepare('INSERT INTO password_resets (user_id,token_hash,expires_at) VALUES (?,?,?)').run(u.id, sha(token), Date.now() + 3600e3);
      const link = `${BASE_URL}/dat-lai-mat-khau?token=${token}`;
      if (mailer.enabled()) mailer.resetPassword(u.email, link, publicSettings());
      else console.log(`[Quên mật khẩu] Chưa cấu hình email. Link đặt lại cho ${u.email}: ${link}`);
    }
    res.json({ ok: true }); // luôn trả như nhau để không lộ email nào đã đăng ký
  }));
  app.post('/api/auth/reset', ah((req, res) => {
    const password = String(req.body.password || '');
    if (password.length < 6) return fail(res, 400, 'Mật khẩu tối thiểu 6 ký tự');
    const r = db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND used=0').get(sha(req.body.token));
    if (!r || r.expires_at < Date.now()) return fail(res, 400, 'Liên kết không hợp lệ hoặc đã hết hạn');
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), r.user_id);
      db.prepare('UPDATE password_resets SET used=1 WHERE user_id=?').run(r.user_id);
    })();
    res.json({ ok: true });
  }));

  // ---------- Ký gửi ----------
  app.post('/api/listings', ah((req, res) => {
    if (limited('listing:' + req.ip, 5, 3600e3)) return fail(res, 429, 'Bạn gửi quá nhiều tin, vui lòng thử lại sau');
    const b = req.body || {};
    const name = str(b.name, 100), phone = str(b.phone, 20), title = str(b.title, 150), email = str(b.email, 150).toLowerCase();
    const price = int(b.expected_price);
    if (!name || !phoneOk(phone) || !title) return fail(res, 400, 'Vui lòng nhập họ tên, số điện thoại hợp lệ và tên máy');
    if (price <= 0) return fail(res, 400, 'Vui lòng nhập giá mong muốn bán');
    if (email && !mailer.validEmail(email)) return fail(res, 400, 'Email không hợp lệ');
    const images = (Array.isArray(b.images) ? b.images : []).slice(0, 5);
    if (!images.length) return fail(res, 400, 'Vui lòng tải lên ít nhất 1 ảnh thật của máy');
    if (images.some(i => typeof i !== 'string' || i.length > 1200000 || !IMG_RE.test(i))) return fail(res, 400, 'Ảnh không hợp lệ (chỉ nhận JPG/PNG/WebP, tối đa ~800KB mỗi ảnh)');
    const cat = db.prepare('SELECT id FROM categories WHERE id=?').get(int(b.category_id));
    if (!cat) return fail(res, 400, 'Vui lòng chọn danh mục');
    db.prepare(`INSERT INTO listings (user_id,name,phone,email,title,category_id,brand,condition,expected_price,description,images)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user?.id || null, name, phone, email || null, title, cat.id, str(b.brand, 60),
      str(b.condition, 60) || 'Chưa rõ', price, str(b.description, 1500), JSON.stringify(images));
    notifyShop('Có tin ký gửi mới', `${name} (${phone}) ký gửi: ${title}\nGiá mong muốn: ${price.toLocaleString('vi-VN')}đ`, '/admin/listings');
    res.json({ ok: true });
  }));
  app.get('/api/listings/mine', (req, res) => {
    if (!req.user) return fail(res, 401, 'Vui lòng đăng nhập');
    const rows = db.prepare(`SELECT l.id,l.title,l.expected_price,l.status,l.sell_price,l.fee_pct,l.admin_note,l.paid_out,l.created_at,l.images,
      p.stock AS stock FROM listings l LEFT JOIN products p ON p.id=l.product_id WHERE l.user_id=? ORDER BY l.id DESC`).all(req.user.id);
    rows.forEach(r => { r.image = (JSON.parse(r.images)[0]) || null; delete r.images; r.sold = r.status === 'approved' && r.stock === 0; });
    res.json(rows);
  });

  // ---------- Admin: cài đặt mở rộng ----------
  admin.get('/settings', (_req, res) => res.json(getSettings()));
  admin.put('/settings', ah((req, res) => {
    const b = req.body || {};
    const v = {
      name: str(b.name, 60), phone: str(b.phone, 20), email: str(b.email, 120), zalo: str(b.zalo, 20),
      messenger: str(b.messenger, 200), address: str(b.address, 200), hours: str(b.hours, 80),
      legal_name: str(b.legal_name, 150), tax_code: str(b.tax_code, 20), notify_email: str(b.notify_email, 120),
      ship_default: String(Math.max(0, int(b.ship_default, 0))), ship_free_over: String(Math.max(0, int(b.ship_free_over, 0))),
      ship_rules: String(b.ship_rules || '').slice(0, 2000), consign_fee_pct: String(Math.min(90, Math.max(0, int(b.consign_fee_pct, 0)))),
    };
    if (!v.name) return fail(res, 400, 'Tên cửa hàng không được để trống');
    if (v.phone && !/^[0-9+.\s-]{8,20}$/.test(v.phone)) return fail(res, 400, 'Số điện thoại không hợp lệ');
    if (v.zalo && !/^[0-9+\s]{8,20}$/.test(v.zalo)) return fail(res, 400, 'Số Zalo chỉ gồm chữ số');
    if (v.email && !mailer.validEmail(v.email)) return fail(res, 400, 'Email không hợp lệ');
    if (v.notify_email && !mailer.validEmail(v.notify_email)) return fail(res, 400, 'Email nhận thông báo không hợp lệ');
    if (v.messenger && !/^(https:\/\/\S+|[A-Za-z0-9.]{3,})$/.test(v.messenger)) return fail(res, 400, 'Messenger: nhập tên trang (vd retechshop) hoặc đường link https://');
    if (v.tax_code && !/^[0-9-]{8,15}$/.test(v.tax_code)) return fail(res, 400, 'Mã số thuế chỉ gồm chữ số (10 hoặc 13 số)');
    const badRule = v.ship_rules.split('\n').map(l => l.trim()).filter(Boolean).find(l => !/^.+=\s*\d+$/.test(l));
    if (badRule) return fail(res, 400, `Dòng phí ship sai định dạng: "${badRule}". Viết theo mẫu: Hà Nội = 20000`);
    const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    Object.entries(v).forEach(([k, x]) => up.run(k, x));
    res.json(getSettings());
  }));
  admin.post('/test-email', ah(async (req, res) => {
    if (!mailer.enabled()) return fail(res, 400, 'Chưa cấu hình SMTP (xem hướng dẫn trong README)');
    const to = str(req.body.to, 150) || getSettings().notify_email || getSettings().email;
    const r = await mailer.simple(to, 'Email thử từ ' + getSettings().name, publicSettings(), 'Email hoạt động', 'Nếu bạn đọc được thư này thì cấu hình email đã đúng.');
    if (!r.ok) return fail(res, 400, 'Gửi thất bại: ' + r.error);
    res.json({ ok: true, to });
  }));

  // ---------- Admin: sao lưu / khôi phục toàn bộ dữ liệu (kể cả ảnh sản phẩm) ----------
  admin.get('/backup', ah((req, res) => {
    const tmp = path.join(os.tmpdir(), `retech-backup-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '');
    res.download(tmp, `retech-backup-${stamp}.db`, () => fs.rm(tmp, () => {}));
  }));
  admin.post('/restore', require('express').raw({ type: '*/*', limit: '300mb' }), ah((req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 100 || buf.slice(0, 15).toString() !== 'SQLite format 3') return fail(res, 400, 'Đây không phải tệp sao lưu (.db) của ReTech');
    const tmp = path.join(os.tmpdir(), `retech-restore-${Date.now()}.db`);
    fs.writeFileSync(tmp, buf);
    try {
      db.exec(`ATTACH DATABASE '${tmp.replace(/'/g, "''")}' AS old`);
      try {
        const has = n => db.prepare("SELECT 1 FROM old.sqlite_master WHERE type='table' AND name=?").get(n);
        if (!has('users') || !has('products')) return fail(res, 400, 'Tệp sao lưu không đúng định dạng (thiếu bảng users/products)');
        const tables = db.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name).filter(has);
        db.exec('PRAGMA foreign_keys=OFF');
        db.exec('BEGIN');
        try {
          for (const t of tables) {
            const mainCols = db.prepare(`PRAGMA main.table_info("${t}")`).all().map(c => c.name);
            const oldCols = new Set(db.prepare(`PRAGMA old.table_info("${t}")`).all().map(c => c.name));
            const cols = mainCols.filter(c => oldCols.has(c)).map(c => `"${c}"`).join(',');
            db.exec(`DELETE FROM main."${t}"`);
            db.exec(`INSERT INTO main."${t}" (${cols}) SELECT ${cols} FROM old."${t}"`);
          }
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
        res.json({ ok: true, tables: tables.length });
      } finally { db.exec('PRAGMA foreign_keys=ON'); db.exec('DETACH DATABASE old'); }
    } finally { fs.rm(tmp, () => {}); }
  }));

  // ---------- Admin: chính sách ----------
  admin.get('/policies', (_req, res) => res.json(POLICIES.map(p => ({
    slug: p.slug, title: p.title, body: policyBody(p.slug), customized: !!db.prepare('SELECT 1 FROM settings WHERE key=?').get('policy:' + p.slug),
  }))));
  admin.put('/policies/:slug', ah((req, res) => {
    if (!BY_SLUG[req.params.slug]) return fail(res, 404, 'Không tìm thấy trang');
    const body = String(req.body.body || '').trim().slice(0, 20000);
    if (!body) return fail(res, 400, 'Nội dung không được để trống');
    db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('policy:' + req.params.slug, body);
    res.json({ ok: true });
  }));
  admin.delete('/policies/:slug', (req, res) => {
    db.prepare('DELETE FROM settings WHERE key=?').run('policy:' + req.params.slug);
    res.json({ ok: true });
  });

  // ---------- Admin: mã giảm giá ----------
  admin.get('/coupons', (_req, res) => res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM coupon_uses u WHERE u.coupon_id=c.id AND u.released=0) AS used
    FROM coupons c ORDER BY c.id DESC`).all()));
  function couponFields(b) {
    const code = str(b.code, 30).toUpperCase().replace(/\s+/g, '');
    const type = ['percent', 'fixed', 'freeship'].includes(b.type) ? b.type : null;
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw { code: 400, msg: 'Mã gồm 3–30 ký tự chữ, số, gạch ngang (không dấu)' };
    if (!type) throw { code: 400, msg: 'Loại mã không hợp lệ' };
    const value = int(b.value);
    if (type === 'percent' && (value < 1 || value > 100)) throw { code: 400, msg: 'Phần trăm giảm phải từ 1 đến 100' };
    if (type === 'fixed' && value < 1) throw { code: 400, msg: 'Số tiền giảm phải lớn hơn 0' };
    const date = v => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const starts = date(b.starts_at), ends = date(b.expires_at);
    if (starts && ends && ends < starts) throw { code: 400, msg: 'Ngày hết hạn phải sau ngày bắt đầu' };
    return [code, type, type === 'freeship' ? 0 : value, Math.max(0, int(b.min_order)), type === 'percent' ? Math.max(0, int(b.max_discount)) : 0,
      Math.max(0, int(b.usage_limit)), Math.max(0, int(b.per_phone_limit)), b.first_order_only ? 1 : 0, starts, ends, b.active === 0 || b.active === false ? 0 : 1];
  }
  const dupMsg = e => (/UNIQUE/i.test(e.message) ? { code: 409, msg: 'Mã này đã tồn tại' } : null);
  admin.post('/coupons', ah((req, res) => {
    try {
      const r = db.prepare(`INSERT INTO coupons (code,type,value,min_order,max_discount,usage_limit,per_phone_limit,first_order_only,starts_at,expires_at,active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(...couponFields(req.body));
      res.json({ id: r.lastInsertRowid });
    } catch (e) { const x = e.code ? e : dupMsg(e); if (x) return fail(res, x.code, x.msg); throw e; }
  }));
  admin.put('/coupons/:id', ah((req, res) => {
    try {
      db.prepare(`UPDATE coupons SET code=?,type=?,value=?,min_order=?,max_discount=?,usage_limit=?,per_phone_limit=?,first_order_only=?,starts_at=?,expires_at=?,active=? WHERE id=?`)
        .run(...couponFields(req.body), int(req.params.id));
      res.json({ ok: true });
    } catch (e) { const x = e.code ? e : dupMsg(e); if (x) return fail(res, x.code, x.msg); throw e; }
  }));
  admin.delete('/coupons/:id', (req, res) => {
    const id = int(req.params.id);
    if (db.prepare('SELECT 1 FROM coupon_uses WHERE coupon_id=?').get(id)) {
      db.prepare('UPDATE coupons SET active=0 WHERE id=?').run(id); // đã có đơn dùng: chỉ tắt để giữ lịch sử
      return res.json({ ok: true, disabled: true });
    }
    db.prepare('DELETE FROM coupons WHERE id=?').run(id);
    res.json({ ok: true });
  });

  // ---------- Admin: danh mục ----------
  const catFields = b => {
    const name = str(b.name, 60);
    if (!name) throw { code: 400, msg: 'Tên danh mục không được để trống' };
    const slug = slugify(b.slug || name);
    if (!slug) throw { code: 400, msg: 'Tên danh mục không hợp lệ' };
    return [slug, name, str(b.icon, 8) || '📦'];
  };
  admin.get('/categories', (_req, res) => res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) AS products FROM categories c ORDER BY c.id`).all()));
  admin.post('/categories', ah((req, res) => {
    try { res.json({ id: db.prepare('INSERT INTO categories (slug,name,icon) VALUES (?,?,?)').run(...catFields(req.body)).lastInsertRowid }); }
    catch (e) { const x = e.code ? e : dupMsg(e); if (x) return fail(res, x.code, /UNIQUE/i.test(e.message) ? 'Danh mục (đường dẫn) đã tồn tại' : x.msg); throw e; }
  }));
  admin.put('/categories/:id', ah((req, res) => {
    try {
      db.prepare('UPDATE categories SET slug=?,name=?,icon=? WHERE id=?').run(...catFields(req.body), int(req.params.id));
      db.refreshIllustrations && db.refreshIllustrations();
      res.json({ ok: true });
    } catch (e) { const x = e.code ? e : dupMsg(e); if (x) return fail(res, x.code, /UNIQUE/i.test(e.message) ? 'Danh mục (đường dẫn) đã tồn tại' : x.msg); throw e; }
  }));
  admin.delete('/categories/:id', (req, res) => {
    const id = int(req.params.id);
    const n = db.prepare('SELECT COUNT(*) n FROM products WHERE category_id=?').get(id).n;
    if (n) return fail(res, 409, `Danh mục còn ${n} sản phẩm, hãy chuyển sản phẩm sang danh mục khác trước`);
    db.prepare('DELETE FROM categories WHERE id=?').run(id);
    res.json({ ok: true });
  });

  // ---------- Admin: ảnh phụ của sản phẩm ----------
  admin.get('/products/:id/images', (req, res) =>
    res.json(db.prepare('SELECT id,image FROM product_images WHERE product_id=? ORDER BY position,id').all(int(req.params.id))));
  admin.put('/products/:id/images', ah((req, res) => {
    const id = int(req.params.id);
    const imgs = (Array.isArray(req.body.images) ? req.body.images : []).slice(0, 8);
    if (imgs.some(i => typeof i !== 'string' || i.length > 1200000 || !IMG_RE.test(i))) return fail(res, 400, 'Ảnh không hợp lệ (JPG/PNG/WebP)');
    db.transaction(() => {
      db.prepare('DELETE FROM product_images WHERE product_id=?').run(id);
      imgs.forEach((im, i) => db.prepare('INSERT INTO product_images (product_id,image,position) VALUES (?,?,?)').run(id, im, i));
    })();
    res.json({ ok: true });
  }));

  // ---------- Admin: ký gửi ----------
  admin.get('/listings', (_req, res) => {
    const rows = db.prepare(`SELECT l.*, c.name AS category_name, p.stock AS stock FROM listings l
      LEFT JOIN categories c ON c.id=l.category_id LEFT JOIN products p ON p.id=l.product_id ORDER BY l.id DESC LIMIT 300`).all();
    rows.forEach(r => {
      r.images = JSON.parse(r.images || '[]');
      r.sold = r.status === 'approved' && r.stock === 0;
      r.payout = r.sold && r.sell_price ? Math.floor(r.sell_price * (100 - (r.fee_pct || 0)) / 100) : null;
    });
    res.json(rows);
  });
  admin.put('/listings/:id', ah((req, res) => {
    const id = int(req.params.id);
    const l = db.prepare('SELECT * FROM listings WHERE id=?').get(id);
    if (!l) return fail(res, 404, 'Không tìm thấy tin ký gửi');
    const b = req.body || {};
    const shop = publicSettings();
    if (b.action === 'paid') { // đánh dấu đã trả tiền cho người ký gửi
      if (l.status !== 'approved') return fail(res, 400, 'Tin chưa được duyệt');
      db.prepare('UPDATE listings SET paid_out=? WHERE id=?').run(b.paid_out ? 1 : 0, id);
      return res.json({ ok: true });
    }
    if (l.status !== 'pending') return fail(res, 400, 'Tin này đã được xử lý');
    if (b.action === 'reject') {
      const note = str(b.admin_note, 300);
      db.prepare("UPDATE listings SET status='rejected', admin_note=? WHERE id=?").run(note, id);
      if (l.email) mailer.simple(l.email, `Tin ký gửi "${l.title}" chưa được duyệt - ${shop.name}`, shop, 'Tin ký gửi chưa được duyệt', `Rất tiếc, shop chưa thể nhận ký gửi "${l.title}".${note ? '\nLý do: ' + note : ''}\nLiên hệ ${shop.phone} để được hỗ trợ thêm.`);
      return res.json({ ok: true });
    }
    if (b.action !== 'approve') return fail(res, 400, 'Thao tác không hợp lệ');
    const price = int(b.sell_price);
    if (price <= 0) return fail(res, 400, 'Vui lòng nhập giá bán');
    const fee = b.fee_pct === undefined || b.fee_pct === '' ? int(getSettings().consign_fee_pct) : int(b.fee_pct);
    if (fee < 0 || fee > 90) return fail(res, 400, 'Phí ký gửi phải từ 0 đến 90%');
    const imgs = JSON.parse(l.images || '[]');
    const note = str(b.admin_note, 300);
    const pid = db.transaction(() => {
      const r = db.prepare(`INSERT INTO products (category_id,name,brand,description,specs,condition,price,stock,warranty_months,serial,image,consigned)
        VALUES (?,?,?,?,?,?,?,1,?,?,?,1)`).run(l.category_id, l.title, l.brand || '', l.description || '', '', l.condition || '95%', price,
        Math.max(0, int(b.warranty_months, 1)), '', imgs[0]);
      imgs.slice(1).forEach((im, i) => db.prepare('INSERT INTO product_images (product_id,image,position) VALUES (?,?,?)').run(r.lastInsertRowid, im, i));
      db.prepare("UPDATE listings SET status='approved', sell_price=?, fee_pct=?, product_id=?, admin_note=? WHERE id=?").run(price, fee, r.lastInsertRowid, note, id);
      return r.lastInsertRowid;
    })();
    if (l.email) mailer.simple(l.email, `Tin ký gửi "${l.title}" đã được duyệt - ${shop.name}`, shop, 'Tin ký gửi đã được duyệt',
      `Shop đã đăng bán "${l.title}" với giá ${price.toLocaleString('vi-VN')}đ. Phí ký gửi ${fee}%. Khi bán được, bạn nhận ${Math.floor(price * (100 - fee) / 100).toLocaleString('vi-VN')}đ.\nShop sẽ liên hệ ${l.phone} để hướng dẫn giao máy.`);
    res.json({ ok: true, product_id: pid });
  }));

  // ---------- SEO: robots, sitemap, meta cho từng trang ----------
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${BASE_URL}/sitemap.xml\n`));
  app.get('/sitemap.xml', (_req, res) => {
    const urls = ['/', '/cua-hang', '/thu-mua', '/ky-gui', '/lien-he', ...POLICIES.map(p => '/chinh-sach/' + p.slug)];
    db.prepare('SELECT id,name FROM products WHERE active=1').all().forEach(p => urls.push(`/san-pham/${slugify(p.name)}-${p.id}`));
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${esc(BASE_URL + u)}</loc></url>`).join('\n')}\n</urlset>`);
  });

  const indexFile = path.join(__dirname, 'public', 'index.html');
  function render(meta) {
    let html = fs.readFileSync(indexFile, 'utf8');
    const tags = [
      `<meta name="description" content="${esc(meta.description)}">`,
      `<link rel="canonical" href="${esc(meta.url)}">`,
      `<meta property="og:type" content="${meta.product ? 'product' : 'website'}">`,
      `<meta property="og:title" content="${esc(meta.title)}">`,
      `<meta property="og:description" content="${esc(meta.description)}">`,
      `<meta property="og:url" content="${esc(meta.url)}">`,
      meta.image ? `<meta property="og:image" content="${esc(meta.image)}">` : '',
      meta.jsonld ? `<script type="application/ld+json">${JSON.stringify(meta.jsonld).replace(/</g, '\\u003c')}</script>` : '',
    ].join('\n');
    html = /<title>[\s\S]*?<\/title>/.test(html) ? html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(meta.title)}</title>`) : html.replace('</head>', () => `<title>${esc(meta.title)}</title></head>`);
    return html.replace('</head>', () => tags + '\n</head>');
  }
  const SHOP_DESC = s => `${s.name} - mua bán điện thoại, laptop, máy tính bảng, CPU và linh kiện máy tính cũ chính hãng, kiểm tra kỹ, có bảo hành.`;

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/img/') || path.extname(req.path)) return next();
    const s = getSettings();
    let meta = { title: `${s.name} - Đồ điện tử cũ chính hãng`, description: SHOP_DESC(s), url: BASE_URL + req.path };
    const m = /^\/san-pham\/(?:.*-)?(\d+)$/.exec(req.path);
    let status = 200;
    if (m) {
      const p = db.prepare('SELECT p.*, c.name AS cat FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1').get(int(m[1]));
      if (p) {
        const url = `${BASE_URL}/san-pham/${slugify(p.name)}-${p.id}`;
        meta = {
          product: true, url, title: `${p.name} cũ ${p.condition} - ${p.price.toLocaleString('vi-VN')}đ | ${s.name}`,
          description: `${p.name} (${p.condition}), bảo hành ${p.warranty_months} tháng, giá ${p.price.toLocaleString('vi-VN')}đ. ${String(p.description || '').slice(0, 120)}`.trim(),
          image: `${BASE_URL}/img/product/${p.id}`,
          jsonld: {
            '@context': 'https://schema.org', '@type': 'Product', name: p.name, brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
            description: String(p.description || '').slice(0, 300), image: `${BASE_URL}/img/product/${p.id}`, category: p.cat,
            offers: {
              '@type': 'Offer', url, priceCurrency: 'VND', price: p.price, itemCondition: 'https://schema.org/UsedCondition',
              availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
          },
        };
      } else status = 404;
    }
    const pm = /^\/chinh-sach\/([\w-]+)$/.exec(req.path);
    if (pm && BY_SLUG[pm[1]]) meta.title = `${BY_SLUG[pm[1]].title} | ${s.name}`;
    if (/^\/(admin|dat-lai-mat-khau|quen-mat-khau|dang-nhap|tai-khoan)/.test(req.path)) meta.noindex = true;
    let html = render(meta);
    if (meta.noindex) html = html.replace('</head>', '<meta name="robots" content="noindex"></head>');
    res.status(status).type('html').send(html);
  });
};

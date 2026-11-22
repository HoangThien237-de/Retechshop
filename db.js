const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const illustrate = require('./illustrate');

const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, 'shop.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
// Bọc transaction đơn giản (node:sqlite không có sẵn)
db.transaction = fn => (...args) => {
  db.exec('BEGIN');
  try { const r = fn(...args); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  brand TEXT,
  description TEXT,
  specs TEXT,
  condition TEXT NOT NULL DEFAULT '95%',
  price INTEGER NOT NULL,
  original_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 1,
  warranty_months INTEGER NOT NULL DEFAULT 3,
  serial TEXT,
  image TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  note TEXT,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  status TEXT NOT NULL DEFAULT 'new',
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bank_txns (
  id TEXT PRIMARY KEY,
  order_code TEXT,
  amount INTEGER NOT NULL,
  content TEXT,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  unread_admin INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_msgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tradeins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  device_type TEXT NOT NULL,
  model TEXT NOT NULL,
  condition TEXT NOT NULL,
  expected_price INTEGER,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  offer_price INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---- Nâng cấp CSDL cũ (an toàn khi chạy lại nhiều lần) ----
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('orders', 'email', 'TEXT');
addColumn('orders', 'province', 'TEXT');
addColumn('orders', 'subtotal', 'INTEGER');
addColumn('orders', 'shipping_fee', 'INTEGER NOT NULL DEFAULT 0');
addColumn('orders', 'discount', 'INTEGER NOT NULL DEFAULT 0');
addColumn('orders', 'coupon_code', 'TEXT');
addColumn('products', 'consigned', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,                 -- percent | fixed | freeship
  value INTEGER NOT NULL DEFAULT 0,
  min_order INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER NOT NULL DEFAULT 0,
  usage_limit INTEGER NOT NULL DEFAULT 0,
  per_phone_limit INTEGER NOT NULL DEFAULT 1,
  first_order_only INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS coupon_uses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id INTEGER,
  phone TEXT,
  released INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  title TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  brand TEXT,
  condition TEXT,
  expected_price INTEGER NOT NULL,
  description TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  sell_price INTEGER,
  fee_pct INTEGER,
  product_id INTEGER,
  admin_note TEXT,
  paid_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
`);

function svg(label, c1, c2) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><text x="200" y="160" font-family="Arial" font-size="26" font-weight="700" fill="rgba(255,255,255,.92)" text-anchor="middle">${label}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
}

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?,?)')
    .run('Quản trị viên', 'admin@shop.local', '0900000000', bcrypt.hashSync(adminPass, 10), 'admin');

  const cats = [
    ['dien-thoai', 'Điện thoại', '📱'],
    ['may-tinh-bang', 'Máy tính bảng', '📲'],
    ['laptop', 'Laptop', '💻'],
    ['cpu', 'CPU / Chip', '🧠'],
    ['ram-ssd', 'RAM & SSD', '💾'],
    ['vga', 'Card đồ họa', '🎮'],
    ['linh-kien-khac', 'Linh kiện khác', '🔧'],
  ];
  const ic = db.prepare('INSERT INTO categories (slug,name,icon) VALUES (?,?,?)');
  cats.forEach(c => ic.run(...c));
  const cid = Object.fromEntries(db.prepare('SELECT id,slug FROM categories').all().map(r => [r.slug, r.id]));

  const P = [
    ['dien-thoai', 'iPhone 13 128GB', 'Apple', '99%', 11500000, 14990000, 3, 6, 'Máy đẹp như mới, pin 92%, full box. Đã kiểm tra toàn bộ chức năng.', 'Màn hình: 6.1" OLED|Chip: A15 Bionic|RAM: 4GB|Bộ nhớ: 128GB|Pin: 92%', '#2b5876', '#4e4376'],
    ['dien-thoai', 'iPhone 12 Pro Max 256GB', 'Apple', '95%', 12900000, 17500000, 2, 6, 'Trầy nhẹ viền, màn hình không xước. Face ID, camera hoạt động tốt.', 'Màn hình: 6.7" OLED|Chip: A14 Bionic|RAM: 6GB|Bộ nhớ: 256GB|Pin: 87%', '#134e5e', '#71b280'],
    ['dien-thoai', 'Samsung Galaxy S22 Ultra 256GB', 'Samsung', '95%', 10900000, 16900000, 2, 6, 'Kèm bút S-Pen, ngoại hình đẹp, không lỗi.', 'Màn hình: 6.8" AMOLED 120Hz|Chip: Snapdragon 8 Gen 1|RAM: 12GB|Bộ nhớ: 256GB', '#41295a', '#2f0743'],
    ['dien-thoai', 'Xiaomi Redmi Note 11', 'Xiaomi', '90%', 2400000, 4490000, 5, 3, 'Máy dùng ổn định, có vài vết xước nhỏ ở lưng.', 'Màn hình: 6.43" AMOLED|Chip: Snapdragon 680|RAM: 6GB|Bộ nhớ: 128GB', '#cb2d3e', '#ef473a'],
    ['may-tinh-bang', 'iPad Pro 11 inch M1 128GB WiFi', 'Apple', '99%', 13500000, 18990000, 2, 6, 'Hỗ trợ Apple Pencil 2, pin 95%, không trầy.', 'Màn hình: 11" Liquid Retina|Chip: Apple M1|RAM: 8GB|Bộ nhớ: 128GB', '#0f2027', '#2c5364'],
    ['may-tinh-bang', 'Samsung Galaxy Tab S8 128GB', 'Samsung', '95%', 8200000, 15990000, 1, 6, 'Kèm S-Pen, màn hình AMOLED rực rỡ.', 'Màn hình: 11" LTPS 120Hz|Chip: Snapdragon 8 Gen 1|RAM: 8GB|Bộ nhớ: 128GB', '#3a1c71', '#d76d77'],
    ['laptop', 'MacBook Air M1 8GB/256GB', 'Apple', '95%', 14500000, 24990000, 3, 6, 'Chu kỳ sạc thấp (120 lần), vỏ không móp.', 'Màn hình: 13.3" Retina|Chip: Apple M1|RAM: 8GB|SSD: 256GB', '#606c88', '#3f4c6b'],
    ['laptop', 'Dell Latitude 7420 i7-1185G7', 'Dell', '95%', 11900000, 21000000, 4, 6, 'Laptop doanh nhân bền bỉ, bàn phím có đèn.', 'Màn hình: 14" FHD|CPU: Core i7-1185G7|RAM: 16GB|SSD: 512GB', '#141e30', '#243b55'],
    ['laptop', 'ThinkPad T480 i5-8350U', 'Lenovo', '90%', 5200000, 9900000, 6, 3, 'Pin rời, nâng cấp dễ, bàn phím tuyệt vời.', 'Màn hình: 14" FHD|CPU: Core i5-8350U|RAM: 8GB|SSD: 256GB', '#232526', '#414345'],
    ['cpu', 'Intel Core i5-12400F (Tray)', 'Intel', '99%', 2600000, 3990000, 8, 3, 'CPU 6 nhân 12 luồng, đã test ổn định, kèm tản box.', 'Socket: LGA1700|Nhân/Luồng: 6/12|Xung: 2.5-4.4 GHz|TDP: 65W', '#005c97', '#363795'],
    ['cpu', 'AMD Ryzen 5 5600X', 'AMD', '99%', 2900000, 4490000, 5, 3, 'Kèm tản nhiệt Wraith Stealth, chưa từng ép xung.', 'Socket: AM4|Nhân/Luồng: 6/12|Xung: 3.7-4.6 GHz|TDP: 65W', '#8e0e00', '#1f1c18'],
    ['cpu', 'Intel Core i7-9700K', 'Intel', '95%', 2800000, 5900000, 3, 3, 'Đã mở khóa ép xung, nhiệt độ tốt.', 'Socket: LGA1151|Nhân/Luồng: 8/8|Xung: 3.6-4.9 GHz|TDP: 95W', '#1e3c72', '#2a5298'],
    ['ram-ssd', 'RAM Kingston Fury 16GB DDR4 3200', 'Kingston', '99%', 650000, 1100000, 20, 12, 'Bảo hành 12 tháng, tản nhiệt đẹp.', 'Loại: DDR4|Dung lượng: 16GB|Bus: 3200MHz', '#4b134f', '#c94b4b'],
    ['ram-ssd', 'SSD Samsung 980 Pro 1TB NVMe', 'Samsung', '95%', 1850000, 3200000, 7, 6, 'Sức khỏe ổ 96%, tốc độ đọc 7000MB/s.', 'Chuẩn: NVMe PCIe 4.0|Dung lượng: 1TB|Tốc độ đọc: 7000MB/s', '#0575e6', '#021b79'],
    ['vga', 'NVIDIA GeForce RTX 3060 Ti 8GB', 'NVIDIA', '90%', 6200000, 10500000, 3, 3, 'Không đào coin, 2 fan chạy êm, nhiệt độ mát.', 'VRAM: 8GB GDDR6|Nguồn phụ: 8-pin|TDP: 200W', '#16222a', '#3a6073'],
    ['vga', 'AMD Radeon RX 6600 8GB', 'AMD', '95%', 3500000, 6200000, 4, 3, 'Hiệu năng/giá tốt cho 1080p, tiết kiệm điện.', 'VRAM: 8GB GDDR6|Nguồn phụ: 8-pin|TDP: 132W', '#b91d73', '#f953c6'],
    ['linh-kien-khac', 'Mainboard ASUS B550M-A WiFi', 'ASUS', '95%', 1700000, 2900000, 4, 3, 'Socket AM4, có WiFi/Bluetooth, đủ phụ kiện.', 'Socket: AM4|Chipset: B550|RAM: DDR4 x4|Form: mATX', '#283048', '#859398'],
    ['linh-kien-khac', 'Nguồn Corsair RM750x 750W 80+ Gold', 'Corsair', '95%', 1750000, 3000000, 3, 6, 'Full modular, quạt êm, đủ dây.', 'Công suất: 750W|Chuẩn: 80+ Gold|Modular: Full', '#0f0c29', '#302b63'],
  ];
  const ip = db.prepare(`INSERT INTO products
    (category_id,name,brand,condition,price,original_price,stock,warranty_months,description,specs,image,serial)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  P.forEach((p, i) => {
    ip.run(cid[p[0]], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], illustrate(p[1], p[2], p[0]), 'SN' + (100000 + i * 137));
  });
}
// Nếu CSDL còn trống và có tệp du-lieu-mau.db cạnh server.js (bản sao lưu đưa lên cùng mã nguồn)
// thì nạp dữ liệu từ đó. Giúp dữ liệu quay lại khi hosting miễn phí xóa ổ đĩa.
function loadSnapshot() {
  const fs = require('fs'), snap = path.join(__dirname, 'du-lieu-mau.db');
  if (!fs.existsSync(snap) || db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;
  try {
    db.exec(`ATTACH DATABASE '${snap.replace(/'/g, "''")}' AS old`);
    try {
      const has = n => db.prepare("SELECT 1 FROM old.sqlite_master WHERE type='table' AND name=?").get(n);
      if (!has('users') || !has('products')) return;
      const tables = db.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name).filter(has);
      db.exec('PRAGMA foreign_keys=OFF'); db.exec('BEGIN');
      try {
        for (const t of tables) {
          const oc = new Set(db.prepare(`PRAGMA old.table_info("${t}")`).all().map(c => c.name));
          const cols = db.prepare(`PRAGMA main.table_info("${t}")`).all().map(c => c.name).filter(c => oc.has(c)).map(c => `"${c}"`).join(',');
          db.exec(`DELETE FROM main."${t}"`); db.exec(`INSERT INTO main."${t}" (${cols}) SELECT ${cols} FROM old."${t}"`);
        }
        db.exec('COMMIT'); console.log('Đã nạp dữ liệu từ du-lieu-mau.db');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    } finally { db.exec('PRAGMA foreign_keys=ON'); db.exec('DETACH DATABASE old'); }
  } catch (e) { console.error('Không nạp được du-lieu-mau.db:', e.message); }
}
loadSnapshot();
seed();

// Ảnh minh họa do hệ thống tạo (SVG) luôn được vẽ lại theo tên/hãng/danh mục hiện tại.
// Ảnh do admin tải lên (JPEG) không bị đụng tới.
function refreshIllustrations() {
  const rows = db.prepare(`SELECT p.id,p.name,p.brand,c.slug,p.image FROM products p JOIN categories c ON c.id=p.category_id
    WHERE p.image IS NULL OR p.image='' OR p.image LIKE 'data:image/svg+xml%'`).all();
  const up = db.prepare('UPDATE products SET image=? WHERE id=?');
  rows.forEach(r => { const img = illustrate(r.name, r.brand, r.slug); if (img !== r.image) up.run(img, r.id); });
}
refreshIllustrations();
db.illustrate = illustrate;
db.refreshIllustrations = refreshIllustrations;

module.exports = db;

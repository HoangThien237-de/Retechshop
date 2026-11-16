// Tính tiền đơn hàng: phí vận chuyển + mã giảm giá. Dùng chung cho xem trước và đặt hàng thật.
const PROVINCES = [
  'Hà Nội', 'TP. Hồ Chí Minh', 'TP. Hải Phòng', 'TP. Đà Nẵng', 'TP. Cần Thơ', 'TP. Huế',
  'An Giang', 'Bắc Ninh', 'Cà Mau', 'Cao Bằng', 'Đắk Lắk', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Tĩnh',
  'Hưng Yên', 'Khánh Hòa', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn', 'Lào Cai', 'Nghệ An', 'Ninh Bình', 'Phú Thọ',
  'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sơn La', 'Tây Ninh', 'Thái Nguyên', 'Thanh Hóa', 'Tuyên Quang', 'Vĩnh Long',
];

const err = (msg, code = 400) => ({ code, msg });
const digits = s => String(s || '').replace(/\D/g, '');
const phoneKey = s => digits(s).slice(-9); // 9 số cuối: 0912345678 và +84912345678 là một
const money = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); // giờ Việt Nam
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  .replace(/^(thanh pho|tp\.?)\s+/, '').replace(/^tinh\s+/, '').trim();

function shippingFor(subtotal, province, s) {
  const freeOver = parseInt(s.ship_free_over, 10) || 0;
  if (freeOver > 0 && subtotal >= freeOver) return 0;
  const target = norm(province);
  for (const line of String(s.ship_rules || '').split('\n')) {
    const i = line.lastIndexOf('=');
    if (i < 0) continue;
    const fee = line.slice(i + 1).trim();
    if (norm(line.slice(0, i)) === target && /^\d+$/.test(fee)) return parseInt(fee, 10);
  }
  return parseInt(s.ship_default, 10) || 0;
}

function applyCoupon(db, code, { subtotal, shipping, phone }) {
  const c = db.prepare('SELECT * FROM coupons WHERE code=?').get(String(code).trim().toUpperCase());
  if (!c || !c.active) throw err('Mã giảm giá không hợp lệ');
  const t = today();
  if (c.starts_at && t < c.starts_at) throw err('Mã chưa đến thời gian áp dụng');
  if (c.expires_at && t > c.expires_at) throw err('Mã đã hết hạn');
  if (subtotal < c.min_order) throw err(`Mã áp dụng cho đơn từ ${money(c.min_order)}`);
  if (c.usage_limit > 0 && db.prepare('SELECT COUNT(*) n FROM coupon_uses WHERE coupon_id=? AND released=0').get(c.id).n >= c.usage_limit)
    throw err('Mã đã hết lượt sử dụng');
  const key = phoneKey(phone);
  if (key.length >= 8) { // chỉ kiểm tra theo số điện thoại khi khách đã nhập
    if (c.per_phone_limit > 0 && db.prepare('SELECT COUNT(*) n FROM coupon_uses WHERE coupon_id=? AND phone=? AND released=0').get(c.id, key).n >= c.per_phone_limit)
      throw err('Số điện thoại này đã dùng hết lượt của mã');
    if (c.first_order_only && db.prepare("SELECT 1 FROM orders WHERE status!='cancelled' AND REPLACE(REPLACE(phone,' ',''),'+','') LIKE ?").get('%' + key))
      throw err('Mã chỉ áp dụng cho đơn hàng đầu tiên');
  }
  let discount = 0, label = '';
  if (c.type === 'percent') {
    discount = Math.floor(subtotal * c.value / 100);
    if (c.max_discount > 0) discount = Math.min(discount, c.max_discount);
    label = `Giảm ${c.value}%`;
  } else if (c.type === 'fixed') {
    discount = Math.min(c.value, subtotal);
    label = `Giảm ${money(discount)}`;
  } else if (c.type === 'freeship') {
    if (shipping <= 0) throw err('Đơn của bạn đã được miễn phí vận chuyển');
    label = 'Miễn phí vận chuyển';
    return { coupon: c, discount: 0, shipping: 0, label };
  }
  return { coupon: c, discount, shipping, label };
}

// items: [{id, qty}]. strictCoupon=true: mã lỗi thì báo lỗi (khi đặt hàng); false: trả coupon_error (khi xem trước).
function quote(db, settings, { items, province, coupon, phone }, strictCoupon) {
  if (!Array.isArray(items) || !items.length) throw err('Giỏ hàng trống');
  const qtyById = new Map();
  for (const it of items) {
    const id = parseInt(it.id, 10);
    if (!Number.isFinite(id)) throw err('Sản phẩm không hợp lệ');
    qtyById.set(id, (qtyById.get(id) || 0) + Math.max(1, parseInt(it.qty, 10) || 1));
  }
  const lines = [];
  let subtotal = 0;
  for (const [id, qty] of qtyById) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(id);
    if (!p) throw err('Có sản phẩm không còn tồn tại');
    lines.push({ p, qty });
    subtotal += p.price * qty;
  }
  let shipping = shippingFor(subtotal, province, settings);
  const shippingOriginal = shipping;
  let discount = 0, applied = null, couponError = null;
  if (coupon && String(coupon).trim()) {
    try {
      const r = applyCoupon(db, coupon, { subtotal, shipping, phone });
      discount = r.discount; shipping = r.shipping;
      applied = { id: r.coupon.id, code: r.coupon.code, label: r.label };
    } catch (e) {
      if (strictCoupon || !e.code) throw e;
      couponError = e.msg;
    }
  }
  const freeOver = parseInt(settings.ship_free_over, 10) || 0;
  return {
    lines, subtotal, shipping, shipping_original: shippingOriginal, discount,
    total: subtotal - discount + shipping, coupon: applied, coupon_error: couponError,
    to_free_ship: freeOver > 0 && subtotal < freeOver && shippingOriginal > 0 ? freeOver - subtotal : 0,
  };
}

module.exports = { PROVINCES, quote, phoneKey, money, digits };

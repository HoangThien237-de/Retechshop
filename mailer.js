// Gửi email qua SMTP (cấu hình bằng biến môi trường). Chưa cấu hình thì bỏ qua, không làm hỏng đơn hàng.
const nodemailer = require('nodemailer');
const { money } = require('./pricing');

const enabled = () => !!process.env.SMTP_HOST;
let transport;
function get() {
  if (!transport) {
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const validEmail = s => /^\S+@\S+\.\S+$/.test(String(s || ''));

// Trả về { ok, error }
async function send({ to, subject, text, html }) {
  if (!enabled()) { console.log(`[Email] chưa cấu hình SMTP, bỏ qua: "${subject}" -> ${to}`); return { ok: false, error: 'Chưa cấu hình SMTP' }; }
  if (!validEmail(to)) return { ok: false, error: 'Email người nhận không hợp lệ' };
  try {
    await get().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
    return { ok: true };
  } catch (e) {
    console.error('[Email] lỗi gửi:', e.message);
    return { ok: false, error: e.message };
  }
}

function layout(shop, title, inner) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
  <div style="background:#0a0e22;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;font-size:20px;font-weight:bold">${esc(shop.name)}</div>
  <div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 10px 10px">
  <h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>${inner}
  <p style="color:#6b7280;font-size:13px;margin-top:24px">${[shop.phone && 'Hotline: ' + esc(shop.phone), shop.email && 'Email: ' + esc(shop.email)].filter(Boolean).join(' · ')}</p>
  </div></div>`;
}

function orderTable(o) {
  const rows = o.q.lines.map(l => `<tr><td style="padding:4px 0">${esc(l.p.name)} × ${l.qty}</td><td style="text-align:right">${money(l.p.price * l.qty)}</td></tr>`).join('');
  const extra = [
    ['Tạm tính', money(o.q.subtotal)],
    ['Phí vận chuyển', o.q.shipping ? money(o.q.shipping) : 'Miễn phí'],
    o.q.discount ? [`Giảm giá (${esc(o.q.coupon && o.q.coupon.code)})`, '-' + money(o.q.discount)] : null,
  ].filter(Boolean).map(([a, b]) => `<tr><td style="padding:2px 0;color:#6b7280">${a}</td><td style="text-align:right;color:#6b7280">${b}</td></tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse">${rows}${extra}<tr><td style="border-top:1px solid #e5e7eb;padding-top:8px"><b>Tổng cộng</b></td><td style="border-top:1px solid #e5e7eb;padding-top:8px;text-align:right"><b>${money(o.q.total)}</b></td></tr></table>`;
}

const PAYNAME = { cod: 'Thanh toán khi nhận hàng (COD)', bank: 'Chuyển khoản ngân hàng', vnpay: 'VNPay' };

function orderConfirmation(o, shop, baseUrl) {
  const link = `${baseUrl}/order/${encodeURIComponent(o.code)}`;
  const inner = `<p>Cảm ơn ${esc(o.name)} đã đặt hàng. Mã đơn của bạn là <b>${esc(o.code)}</b>.</p>${orderTable(o)}
    <p>Giao đến: ${esc(o.name)}, ${esc(o.phone)}<br>${esc(o.address)}, ${esc(o.province)}</p><p>Thanh toán: ${esc(PAYNAME[o.method] || o.method)}</p>
    <p><a href="${esc(link)}">Xem đơn hàng</a></p>`;
  return send({ to: o.email, subject: `Xác nhận đơn hàng ${o.code} - ${shop.name}`, html: layout(shop, 'Đặt hàng thành công', inner),
    text: `Cảm ơn ${o.name} đã đặt hàng. Mã đơn: ${o.code}. Tổng: ${money(o.q.total)}. Xem đơn: ${link}` });
}

function newOrderAlert(to, o, shop, baseUrl) {
  const inner = `<p>Khách: <b>${esc(o.name)}</b> · ${esc(o.phone)}${o.email ? ' · ' + esc(o.email) : ''}<br>${esc(o.address)}, ${esc(o.province)}</p>${orderTable(o)}
    <p>Thanh toán: ${esc(PAYNAME[o.method] || o.method)}</p><p><a href="${esc(baseUrl)}/admin/orders">Mở trang quản trị</a></p>`;
  return send({ to, subject: `Đơn mới ${o.code} - ${money(o.q.total)}`, html: layout(shop, 'Có đơn hàng mới', inner),
    text: `Đơn mới ${o.code} từ ${o.name} (${o.phone}), tổng ${money(o.q.total)}.` });
}

function resetPassword(to, link, shop) {
  const inner = `<p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu. Bấm vào liên kết dưới đây, liên kết có hiệu lực trong 1 giờ:</p>
    <p><a href="${esc(link)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Đặt lại mật khẩu</a></p>
    <p style="color:#6b7280;font-size:13px">Nếu không phải bạn yêu cầu, hãy bỏ qua email này, mật khẩu của bạn vẫn giữ nguyên.</p>`;
  return send({ to, subject: `Đặt lại mật khẩu - ${shop.name}`, html: layout(shop, 'Đặt lại mật khẩu', inner), text: `Đặt lại mật khẩu (hiệu lực 1 giờ): ${link}` });
}

function simple(to, subject, shop, title, bodyText, link) {
  const inner = `<p>${esc(bodyText).replace(/\n/g, '<br>')}</p>${link ? `<p><a href="${esc(link)}">Mở xem</a></p>` : ''}`;
  return send({ to, subject, html: layout(shop, title, inner), text: bodyText + (link ? `\n${link}` : '') });
}

module.exports = { enabled, send, validEmail, orderConfirmation, newOrderAlert, resetPassword, simple };

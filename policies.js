// Nội dung mẫu cho các trang chính sách. Chủ shop sửa trong Quản trị > Chính sách.
// Cú pháp: "## Tiêu đề", "- gạch đầu dòng", đoạn văn cách nhau bằng dòng trống.
// Biến: {{name}} {{phone}} {{email}} {{address}} {{hours}} {{consign_fee}}
const POLICIES = [
  {
    slug: 'gioi-thieu', title: 'Giới thiệu',
    body: `## Về {{name}}
{{name}} mua bán điện thoại, máy tính bảng, laptop, CPU và linh kiện máy tính đã qua sử dụng. Mỗi sản phẩm đều ghi rõ tình trạng, thông số và thời hạn bảo hành để bạn yên tâm lựa chọn.

## Cam kết
- Mô tả đúng tình trạng thực tế của từng sản phẩm.
- Có bảo hành theo thời hạn ghi trên trang sản phẩm.
- Hỗ trợ đổi trả theo chính sách đổi trả.
- Hỗ trợ khách hàng qua hotline {{phone}} và hộp chat trên website.

## Liên hệ
Hotline: {{phone}}
Email: {{email}}
Địa chỉ: {{address}}
Giờ làm việc: {{hours}}`,
  },
  {
    slug: 'bao-hanh', title: 'Chính sách bảo hành',
    body: `## Thời hạn bảo hành
Thời hạn bảo hành của từng sản phẩm được ghi trên trang chi tiết sản phẩm.

## Điều kiện bảo hành
- Sản phẩm còn trong thời hạn bảo hành, còn nguyên số serial/IMEI như lúc bán.
- Lỗi phát sinh do linh kiện hoặc nhà sản xuất, không do tác động bên ngoài.

## Không thuộc phạm vi bảo hành
- Rơi vỡ, vào nước, cháy nổ, tự ý sửa chữa hoặc can thiệp phần mềm.
- Hao mòn tự nhiên trong quá trình sử dụng, trầy xước do sử dụng.

## Cách yêu cầu bảo hành
Liên hệ hotline {{phone}} hoặc email {{email}} kèm mã đơn hàng, mô tả lỗi và hình ảnh hoặc video nếu có.`,
  },
  {
    slug: 'doi-tra', title: 'Chính sách đổi trả và hoàn tiền',
    body: `## Đổi trả trong 7 ngày
Bạn được đổi hoặc trả sản phẩm trong 7 ngày kể từ khi nhận hàng nếu sản phẩm không đúng với mô tả trên website (tình trạng, thông số, phụ kiện đi kèm).

## Điều kiện
- Có mã đơn hàng.
- Sản phẩm giữ nguyên hiện trạng khi nhận, đủ phụ kiện, không có dấu hiệu bị tác động mới.

## Cách thực hiện
Liên hệ hotline {{phone}} hoặc chat trên website, cung cấp mã đơn và lý do đổi trả. Nhân viên sẽ hướng dẫn gửi sản phẩm về.

## Hoàn tiền
Sau khi {{name}} nhận lại và kiểm tra sản phẩm, tiền được hoàn qua hình thức bạn đã thanh toán.`,
  },
  {
    slug: 'van-chuyen', title: 'Chính sách vận chuyển',
    body: `## Phí vận chuyển
Phí được tính theo tỉnh/thành phố nhận hàng và hiển thị ở bước thanh toán. Một số đơn hàng đủ điều kiện sẽ được miễn phí vận chuyển theo chương trình hiện hành.

## Thời gian xử lý đơn
Đơn hàng được xác nhận trong giờ làm việc ({{hours}}). Thời gian giao dự kiến do nhân viên thông báo khi xác nhận đơn.

## Kiểm tra hàng khi nhận
Bạn nên kiểm tra ngoại quan sản phẩm khi nhận. Nếu có sai khác so với mô tả, hãy liên hệ ngay với {{name}} qua hotline {{phone}}.`,
  },
  {
    slug: 'thanh-toan', title: 'Hình thức thanh toán',
    body: `## Các hình thức
- Thanh toán khi nhận hàng (COD).
- Chuyển khoản ngân hàng bằng mã QR hiển thị sau khi đặt hàng. Vui lòng ghi đúng nội dung chuyển khoản là mã đơn hàng.
- Các cổng thanh toán trực tuyến khác sẽ hiện ở bước thanh toán nếu đang được bật.

## Lưu ý an toàn
{{name}} chỉ nhận chuyển khoản vào tài khoản hiển thị trên website này. Hãy cảnh giác với các tin nhắn yêu cầu chuyển tiền vào tài khoản khác.`,
  },
  {
    slug: 'bao-mat', title: 'Chính sách bảo mật thông tin',
    body: `## Thông tin chúng tôi thu thập
Họ tên, số điện thoại, địa chỉ nhận hàng, email (nếu bạn cung cấp) và nội dung bạn gửi qua form hoặc hộp chat.

## Mục đích sử dụng
- Xử lý và giao đơn hàng, bảo hành, đổi trả.
- Liên hệ hỗ trợ và báo giá khi bạn gửi yêu cầu thu mua hoặc ký gửi.
- Gửi email xác nhận đơn hàng và đặt lại mật khẩu.

## Cam kết
- Không bán hoặc chia sẻ thông tin của bạn cho bên thứ ba vì mục đích thương mại.
- Chỉ chia sẻ thông tin cần thiết cho đơn vị vận chuyển, cổng thanh toán để hoàn tất đơn hàng, hoặc khi pháp luật yêu cầu.
- Mật khẩu tài khoản được lưu dưới dạng đã mã hóa.

## Quyền của bạn
Bạn có thể yêu cầu xem, chỉnh sửa hoặc xóa thông tin cá nhân bằng cách liên hệ {{email}} hoặc hotline {{phone}}.`,
  },
  {
    slug: 'ky-gui', title: 'Quy định ký gửi và thu mua',
    body: `## Ký gửi bán hộ
Bạn gửi thông tin và ảnh thật của máy. Sau khi {{name}} duyệt, sản phẩm được đăng bán trên website với nhãn "Hàng ký gửi". Phí ký gửi: {{consign_fee}}.

## Điều kiện
- Máy thuộc quyền sở hữu hợp pháp của bạn, không phải hàng bị báo mất hoặc nguồn gốc không rõ.
- Thông tin và hình ảnh đúng thực tế. Máy đã đăng xuất các tài khoản cá nhân (iCloud, Google...) trước khi giao.

## Quy trình
- Bạn gửi tin ký gửi, {{name}} xem xét và có thể điều chỉnh giá bán cho phù hợp.
- Khi bán được, {{name}} thanh toán phần tiền của bạn sau khi trừ phí ký gửi theo thỏa thuận lúc duyệt tin.

## Thu mua trực tiếp
Nếu bạn muốn bán đứt, hãy dùng mục Thu mua để nhận báo giá trong vòng 24 giờ.`,
  },
];

const BY_SLUG = Object.fromEntries(POLICIES.map(p => [p.slug, p]));

function fill(text, s) {
  const fee = parseInt(s.consign_fee_pct, 10) || 0;
  const vars = {
    name: s.name, phone: s.phone, email: s.email, address: s.address || '(đang cập nhật)', hours: s.hours,
    consign_fee: fee > 0 ? `${fee}% giá bán khi bán thành công` : 'không thu phí',
  };
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ''));
}

module.exports = { POLICIES, BY_SLUG, fill };

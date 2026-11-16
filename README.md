# ReTech – Website bán đồ điện tử cũ

Điện thoại, máy tính bảng, laptop, CPU/chip, RAM/SSD, VGA và linh kiện PC. Có tài khoản khách, giỏ hàng, đặt hàng,
thanh toán (COD / chuyển khoản QR / VNPay), thu mua máy cũ (trade-in) và trang quản trị.

## Chạy thử
Cần Node.js 22.13 trở lên (dùng SQLite có sẵn trong Node, không cần biên dịch gì thêm).

    npm install
    npm start

Mở http://localhost:3000. Lần chạy đầu tiên sẽ tự tạo cơ sở dữ liệu `shop.db` (SQLite) cùng 17 sản phẩm mẫu.

Tài khoản quản trị mặc định: `admin@shop.local` / `admin123` (đổi ngay bằng biến `ADMIN_PASSWORD` trước lần chạy đầu tiên).
Quản trị tại: http://localhost:3000/#/admin

## Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng chạy (mặc định 3000) |
| `JWT_SECRET` | Chuỗi bí mật ký phiên đăng nhập. **Bắt buộc đặt khi chạy thật** |
| `ADMIN_PASSWORD` | Mật khẩu admin khi tạo DB lần đầu |
| `BASE_URL` | Địa chỉ công khai của web (VD https://retech.vn), dùng cho VNPay |
| `BANK_ID`, `BANK_ACCOUNT`, `BANK_HOLDER` | Ngân hàng (mã VietQR như VCB, MB, TCB), số tài khoản, tên chủ TK để sinh mã QR |
| `SEPAY_API_KEY` | Khóa bí mật để bật tự xác nhận chuyển khoản qua SePay (xem phần dưới) |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL` | Thông tin merchant VNPay. Chưa đặt thì ẩn lựa chọn VNPay |

## Tự xác nhận chuyển khoản (SePay)
Khi khách chuyển khoản đúng nội dung (mã đơn) và đủ tiền, đơn tự chuyển sang "Đã thanh toán" và "Đã xác nhận";
trang đơn hàng của khách cũng tự cập nhật. Giao dịch lạ, thiếu tiền hoặc sai nội dung hiện ở Quản trị > Chuyển khoản để xử lý tay.

1. Đăng ký tại https://sepay.vn và liên kết tài khoản ngân hàng đúng với `BANK_ACCOUNT`.
2. Đặt biến `SEPAY_API_KEY` thành một chuỗi bí mật dài do bạn tự đặt, rồi chạy lại web.
3. Trong SePay: Tích hợp Webhooks > Thêm webhook. URL: `https://TEN-MIEN-CUA-BAN/api/payment/sepay-webhook`,
   kiểu chứng thực "API Key", nhập đúng chuỗi ở bước 2.
4. Chuyển thử một khoản nhỏ vào một đơn thử để kiểm tra.

Lưu ý: SePay phải gọi được tới web của bạn, nên web cần chạy trên máy chủ có tên miền và HTTPS.
Chạy ở máy cá nhân thì chỉ nhận được khi dùng công cụ mở cổng tạm như Cloudflare Tunnel hoặc ngrok.

## Thông tin liên hệ và chat CSKH
- Đổi số điện thoại, email, Zalo, Messenger, địa chỉ, giờ làm việc tại Quản trị > Cài đặt. Thông tin hiện ở thanh trên cùng, chân trang, trang Liên hệ và hộp chat.
- Khách nhắn qua hộp chat ở góc phải màn hình; bạn xem và trả lời tại Quản trị > Tin nhắn (có số tin chưa đọc). Trang tự cập nhật mỗi 5 giây.
- Trợ lý tự động trả lời sẵn các câu hỏi về bảo hành, đổi trả, thanh toán, giao hàng, thu mua. Nội dung nằm trong `server.js` (mảng `FAQ`), sửa cho đúng chính sách của shop.
- Chat chỉ có tin nhắn khi bạn đang mở trang quản trị. Chưa có thông báo qua email/Zalo khi khách nhắn.

## Ảnh sản phẩm
Sản phẩm chưa có ảnh thật sẽ tự có ảnh minh họa theo danh mục (vẽ lại mỗi lần khởi động theo tên/hãng hiện tại).
Tải ảnh thật lên trong Quản trị > Sản phẩm > Sửa thì ảnh thật được giữ nguyên.

## Tính năng bổ sung (phiên bản 2)

**Phí vận chuyển.** Quản trị > Cài đặt: phí mặc định, ngưỡng miễn phí (mặc định 5.000.000đ) và phí riêng từng tỉnh (mỗi dòng `Hà Nội = 20000`). Khách chọn tỉnh/thành ở bước thanh toán, tiền tính ở máy chủ nên không sửa được từ trình duyệt.

**Mã giảm giá.** Quản trị > Mã giảm giá: giảm %, giảm tiền hoặc miễn phí ship; đơn tối thiểu, giảm tối đa, hạn dùng, tổng lượt dùng, lượt dùng mỗi số điện thoại, chỉ đơn đầu tiên. Hủy đơn thì lượt dùng được hoàn lại.

**Trang chính sách.** 7 trang mẫu tại `/chinh-sach/...`, sửa trong Quản trị > Chính sách. Nội dung mẫu (đổi trả 7 ngày, bảo hành...) chỉ là gợi ý: hãy sửa cho đúng cam kết thật của shop. Điền tên doanh nghiệp và mã số thuế ở Cài đặt để hiện ở chân trang.

**Ký gửi.** Khách gửi ảnh và thông tin tại `/ky-gui`. Admin duyệt ở tab Ký gửi, đặt giá và phí (mặc định 10%); sản phẩm tự đăng bán với nhãn "Ký gửi". Khi bán hết, tab hiện số tiền cần trả khách để bạn tích "đã trả tiền". Lưu ý: nên kiểm tra nguồn gốc máy (IMEI, hóa đơn) trước khi duyệt.

**Link riêng và SEO.** Sản phẩm có địa chỉ như `/san-pham/iphone-13-128gb-1`, kèm thẻ tiêu đề, mô tả, ảnh chia sẻ, dữ liệu Product (hàng đã qua sử dụng), `sitemap.xml` và `robots.txt`. Đặt `BASE_URL` đúng tên miền thật. Link cũ dạng `#/product/1` vẫn tự chuyển sang link mới.

**Danh mục.** Quản trị > Danh mục: thêm, sửa, xóa (chỉ xóa được khi không còn sản phẩm).

**Email.** Cần cấu hình SMTP bằng biến môi trường `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (xem chay-web.bat). Với Gmail: bật xác minh 2 bước rồi tạo "Mật khẩu ứng dụng". Sau đó vào Cài đặt, điền email nhận thông báo và bấm "Gửi email thử". Email gửi cho khách: xác nhận đơn, đặt lại mật khẩu, kết quả duyệt ký gửi. Email gửi cho shop: đơn mới, tin nhắn, thu mua, ký gửi. Chưa cấu hình SMTP thì website vẫn chạy, chỉ không gửi mail (link đặt lại mật khẩu sẽ in ra cửa sổ chạy web).

**Quên mật khẩu.** Trang `/quen-mat-khau`, liên kết có hiệu lực 1 giờ và dùng một lần.

Sau khi cập nhật, chạy lại `chay-web.bat` (tự cài thêm thư viện nodemailer). Dữ liệu cũ được giữ nguyên.

## Cấu trúc
- `server.js` – API Express (sản phẩm, đăng nhập, đơn hàng, thu mua, quản trị, VNPay)
- `db.js` – schema SQLite và dữ liệu mẫu
- `public/` – giao diện (HTML/CSS/JS thuần, không cần build)

## Lưu ý khi đưa lên mạng thật
- Dùng HTTPS và đặt `JWT_SECRET` cố định; sao lưu `shop.db` định kỳ.
- Chuyển khoản QR: có tự xác nhận nếu bật SePay (phần trên), nếu không admin tự đổi trạng thái khi thấy tiền về.
- VNPay: đã có tạo link và kiểm tra chữ ký khi quay về; nên test kỹ trên sandbox VNPay và bổ sung IPN trước khi chạy thật.
- Chưa có: MoMo, gửi email/SMS, tính phí ship, nhiều ảnh cho một sản phẩm, quên mật khẩu.

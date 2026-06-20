# Quỹ Ăn Chơi

Prototype web/PWA cho nhóm bạn quản lý quỹ ăn chơi:

- Tài khoản demo cho quản trị quỹ và thành viên.
- Tạo thành viên và mã nạp riêng cho từng người.
- Ghi nhận khoản nộp quỹ thủ công.
- Mô phỏng sao kê ngân hàng: hệ thống đọc nội dung chuyển khoản, tìm mã nạp và tự cộng tiền cho thành viên.
- Tạo buổi ăn/nhậu, chọn thành viên tham gia và tự phân bổ bill.
- Gán tiền người lạ/khách mời cho một người trong nhóm.
- Mỗi thành viên xem được đã nộp, đã dùng và số dư còn lại.
- Lịch sử giao dịch theo dạng sổ cái để truy vết tiền vào/tiền ra.

## Tài khoản demo

```text
Admin:      admin@quy.local / admin123
Thành viên: minh@quy.local  / minh123
```

Admin có thể quản lý thành viên, nộp quỹ, mô phỏng sao kê, tạo buổi ăn/nhậu và xem toàn bộ lịch sử.

Thành viên chỉ xem số dư cá nhân, mã nạp của mình và lịch sử giao dịch của mình.

## Chạy local

```powershell
.\start-server.ps1
```

Mở:

```text
http://localhost:5173
```

Dữ liệu demo lưu trong `localStorage` của trình duyệt. Đăng nhập admin rồi bấm `Làm mới demo` để reset.

## Nguyên tắc tính tiền

Số dư từng thành viên:

```text
số dư = tổng tiền đã nộp - tổng chi phí được phân bổ
```

Khi tạo buổi:

- `Chia đều cho người tham gia sau khi trừ khách lạ`: tổng bill trừ tiền khách lạ, phần còn lại chia đều.
- `Chia đều bill, người được gán trả phần khách lạ`: bill chia đều cho người tham gia, tiền khách lạ cộng thêm vào người được gán.

## Đề xuất tính năng cho tài khoản admin

- Tạo nhiều quỹ theo nhóm, mùa du lịch hoặc sự kiện.
- Thêm/sửa trạng thái thành viên: đang tham gia, tạm dừng, đã rời nhóm.
- Mời thành viên bằng link hoặc mã QR.
- Duyệt giao dịch chưa nhận diện và gán thủ công cho thành viên.
- Tạo buổi ăn/nhậu kèm ảnh hóa đơn, địa điểm, ngày giờ, người tạo.
- Split nâng cao: chia theo phần, theo %, theo món, miễn phí cho khách.
- Khóa sổ theo tháng để chốt công nợ.
- Xuất báo cáo Excel/PDF.
- Nhật ký thao tác bất biến: ai sửa gì, lúc nào, lý do.
- Cảnh báo số dư âm và nhắc nộp quỹ tự động.

## Đề xuất tính năng cho tài khoản thành viên

- Xem số dư, tổng đã nộp, tổng đã dùng.
- Xem mã QR/mã nội dung chuyển khoản cá nhân.
- Xem lịch sử khoản nộp và khoản bị trừ.
- Nhận thông báo khi nạp tiền thành công, bị phân bổ chi phí hoặc số dư âm.
- Xác nhận tham gia buổi ăn/nhậu trước khi admin chốt bill.
- Gửi yêu cầu kiểm tra lại hóa đơn hoặc khiếu nại phân bổ.
- Xem bảng xếp hạng đóng quỹ vui vẻ: ai còn nhiều quỹ, ai đang âm.

## Hướng kiến trúc gợi ý

- Frontend: React/Vue/Svelte hoặc PWA thuần nếu app nhỏ.
- Backend: Node.js/NestJS, Laravel hoặc Supabase.
- Database: PostgreSQL với các bảng `funds`, `members`, `users`, `roles`, `ledger_entries`, `events`, `event_participants`, `bank_transactions`.
- Thanh toán/nhận diện: VietQR cho nội dung chuyển khoản, webhook từ ngân hàng/đối tác trung gian, job đối soát định kỳ.
- Bảo mật: mọi phép cộng/trừ tiền phải xử lý ở backend, client chỉ gửi yêu cầu.

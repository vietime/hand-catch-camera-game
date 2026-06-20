# Quỹ Ăn Chơi

Prototype web/PWA cho nhóm bạn quản lý quỹ ăn chơi:

- Tạo thành viên và mã nạp riêng cho từng người.
- Chủ quỹ cấu hình tài khoản ngân hàng nhận quỹ.
- Tạo VietQR cho từng thành viên với nội dung chuyển khoản riêng.
- Ghi nhận khoản nộp quỹ thủ công.
- Thành viên bấm `Tôi đã chuyển khoản` để tạo yêu cầu nộp quỹ chờ admin xác nhận.
- Mô phỏng sao kê ngân hàng: hệ thống đọc nội dung chuyển khoản, tìm mã nạp và tự cộng tiền cho thành viên.
- Tạo buổi ăn/nhậu, chọn thành viên tham gia và tự phân bổ bill.
- Gán tiền người lạ/khách mời cho một người trong nhóm.
- Mỗi thành viên xem được đã nộp, đã dùng và số dư còn lại.
- Lịch sử giao dịch theo dạng sổ cái để truy vết tiền vào/tiền ra.

Admin đăng nhập bằng Supabase Auth, có thể quản lý thành viên, nộp quỹ, mô phỏng sao kê, tạo buổi ăn/nhậu và xem toàn bộ lịch sử.

Thành viên đăng nhập bằng Supabase Auth, chỉ xem số dư cá nhân, mã nạp của mình và lịch sử giao dịch của mình.

## Đăng ký chủ quỹ và mời thành viên

MVP hiện hỗ trợ:

- Người dùng tự đăng ký `Chủ quỹ mới` từ màn đăng nhập.
- Hệ thống tạo Supabase Auth user, tạo quỹ mới và gắn người đó với role `admin`.
- Admin nhập tên/email thành viên trong tab `Thành viên` để tạo link mời.
- Admin copy link mời gửi qua Zalo/Messenger.
- Thành viên mở link hoặc dán mã mời ở màn `Tham gia bằng mã mời`, tự tạo tài khoản và được gắn vào quỹ với role `member`.

Giới hạn hiện tại: một tài khoản chỉ gắn với một quỹ trong bảng `profiles`. Nếu cần một người tham gia nhiều quỹ, cần đổi khóa chính `profiles` sang cặp `(user_id, fund_id)`.

## Chạy local

```powershell
.\start-server.ps1
```

Mở:

```text
http://localhost:5173
```

Dữ liệu local lưu trong `localStorage` của trình duyệt nếu chưa cấu hình Supabase.

## CSDL hiện tại

Prototype này hỗ trợ 2 chế độ:

- Nếu `src/config.js` chưa có Supabase URL/key, app dùng `localStorage` của trình duyệt để chạy demo.
- Nếu đã cấu hình Supabase, app dùng Supabase Auth + PostgreSQL + Row Level Security.

## Tạo CSDL Supabase/PostgreSQL

1. Tạo project mới trên Supabase.
2. Vào `SQL Editor` và chạy toàn bộ file [supabase/schema.sql](supabase/schema.sql).
3. Chạy tiếp file [supabase/rls_auth.sql](supabase/rls_auth.sql) để bật policy theo tài khoản admin/thành viên.
4. Vào `Project Settings` -> `API`.
5. Copy `Project URL` và `anon public key`.
6. Mở [src/config.js](src/config.js) và điền:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://PROJECT_ID.supabase.co",
  supabaseAnonKey: "ANON_PUBLIC_KEY",
  fundId: "quy-an-choi-demo",
};
```

Sau khi deploy lại GitHub Pages, trạng thái `CSDL` trên giao diện sẽ chuyển từ `Local demo` sang `Supabase/PostgreSQL`.

Hiện bản online đã dùng Supabase Auth + RLS:

- Admin được đọc/ghi dữ liệu quỹ.
- Thành viên chỉ đọc được hồ sơ, số dư và lịch sử của chính mình.
- Anon/public key không ghi được dữ liệu nếu chưa đăng nhập.
- Link mời được lưu trong bảng `fund_invites`; chỉ admin của quỹ mới xem/tạo/hủy link mời.

Lưu ý bảo mật tiếp theo: các thao tác cộng/trừ tiền quan trọng vẫn nên chuyển vào Supabase Edge Functions hoặc backend riêng để tránh tin hoàn toàn vào logic client.

## Nguyên tắc tính tiền

Số dư từng thành viên:

```text
số dư = tổng tiền đã nộp - tổng chi phí được phân bổ
```

Khi tạo buổi:

- `Chia đều cho người tham gia sau khi trừ khách lạ`: tổng bill trừ tiền khách lạ, phần còn lại chia đều.
- `Chia đều bill, người được gán trả phần khách lạ`: bill chia đều cho người tham gia, tiền khách lạ cộng thêm vào người được gán.

## Luồng nộp quỹ giai đoạn 1

Giai đoạn này dùng phương án QR tĩnh + admin xác nhận:

1. Thành viên mở tab `Nạp quỹ`.
2. Thành viên quét VietQR của quỹ hoặc copy thông tin chuyển khoản. Mỗi thành viên có nội dung chuyển khoản riêng.
3. Thành viên nhập số tiền đã chuyển rồi bấm `Tôi đã chuyển khoản`.
4. Hệ thống tạo một dòng trong bảng `deposit_requests` trạng thái `pending`.
5. Admin kiểm tra sao kê ngân hàng.
6. Admin bấm `Xác nhận`, hệ thống mới tạo dòng `ledger_entries` loại `deposit` và cộng vào số dư thành viên.
7. Nếu không khớp sao kê, admin bấm `Từ chối`.

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

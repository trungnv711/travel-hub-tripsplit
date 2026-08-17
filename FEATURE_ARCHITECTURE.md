# TripSplit - Phân tích BA và kiến trúc mở rộng

## 1. Mục tiêu sản phẩm

TripSplit không chỉ là màn hình chia hóa đơn. Sản phẩm được tổ chức thành ba trải nghiệm:

1. **Nhật ký hành trình**: tổng hợp nhiều chuyến đi, xu hướng chi tiêu và câu chuyện nổi bật.
2. **Không gian vận hành chuyến đi**: thành viên, chi phí, quyết toán và thanh toán.
3. **Báo cáo chia sẻ**: PDF, CSV và Google Sheet cho người không đăng nhập hoặc không mở được link.

## 2. Quy tắc nghiệp vụ mới

### Trạng thái khoản chi

- `included: true`: khoản đã chốt, tham gia tổng chi, chia tiền, công nợ, dashboard, PDF quyết toán và Google Sheet.
- `included: false`: khoản kế hoạch, vẫn được lưu và hiển thị nhưng không tham gia phép tính.
- Dữ liệu cũ không có `included` được hiểu là `true` để không thay đổi kết quả đang có.

### Tiền tạm ứng

- `member.prepaidAmount` là khoản thu trước cố định.
- Chỉ thay đổi khi người dùng sửa thành viên.
- Không bị trộn với `expense.payerId` (người thực trả hóa đơn) hoặc `payments` (giao dịch quyết toán).

## 3. Phân rã mô-đun và mức ảnh hưởng

| Mô-đun | Trách nhiệm | Mức ảnh hưởng khi sửa |
|---|---|---|
| `logic.js` | Chia tiền, lọc khoản được tính, số dư và công nợ | Rất cao - mọi màn hình và báo cáo dùng kết quả này |
| `report.js` | Tạo mô hình dữ liệu báo cáo thu chi | Cao - PDF/CSV/Sheet cần thống nhất số liệu |
| `dashboard.js` | Tổng hợp tuần, tháng, năm; nhóm chi; người ứng nhiều | Trung bình - chỉ đọc dữ liệu, không thay đổi công nợ |
| `app.js` | Điều phối giao diện, lưu dữ liệu và sự kiện người dùng | Cao - tránh đưa công thức nghiệp vụ mới trực tiếp vào đây |
| `Code.gs` | Đồng bộ và trình bày Google Sheet | Trung bình - phải theo đúng mô hình từ `report.js` |
| `styles.css` | Hệ thống trình bày desktop/mobile/in/PDF | Thấp với dữ liệu, cao với trải nghiệm người dùng |

## 4. Luồng dữ liệu chuẩn

`Portfolio -> Trip -> Members / Expenses / Payments`

- Dashboard đọc nhiều `Trip` qua `dashboard.js`.
- Quyết toán một chuyến đọc `Trip` qua `logic.js`.
- PDF/CSV/Sheet nhận cùng một mô hình báo cáo, không tự viết lại công thức.
- D1 lưu nguyên JSON chuyến đi; trường mới có giá trị mặc định khi tải dữ liệu cũ.

## 5. Nguyên tắc mở rộng sang website khác

1. Thêm trường dữ liệu và giá trị mặc định trong bước chuẩn hóa.
2. Viết phép tính dưới dạng hàm thuần trong mô-đun riêng.
3. Viết kiểm thử cho dữ liệu cũ và trường hợp mới trước khi nối giao diện.
4. Giao diện chỉ gọi API mô-đun, không lặp lại công thức.
5. Báo cáo và dashboard dùng cùng kết quả trung tâm.
6. Mỗi tính năng mới phải xác định rõ ảnh hưởng đến: lưu trữ, công nợ, xuất dữ liệu, chia sẻ và responsive.

Thiết kế này giúp có thể sao chép `logic.js`, `report.js` và `dashboard.js` sang một website khác mà không phải mang theo toàn bộ giao diện TripSplit.

# TripSplit - Phân tích BA và kiến trúc mở rộng

## Mục tiêu sản phẩm

TripSplit gồm ba trải nghiệm: nhật ký nhiều hành trình, không gian vận hành từng chuyến và báo cáo chia sẻ PDF/CSV/Google Sheet.

## Quy tắc dữ liệu

- `expense.included = true`: khoản đã chốt, tham gia tổng chi, chia tiền, công nợ, dashboard và báo cáo quyết toán.
- `expense.included = false`: khoản kế hoạch, vẫn được lưu nhưng không tham gia phép tính.
- Dữ liệu cũ thiếu `included` được hiểu là `true`.
- `member.prepaidAmount` là khoản thu trước cố định, không trộn với người thực trả hóa đơn hoặc giao dịch quyết toán.

## Mô-đun và mức ảnh hưởng

| Mô-đun | Trách nhiệm | Mức ảnh hưởng |
|---|---|---|
| `logic.js` | Chia tiền, lọc khoản được tính, số dư và công nợ | Rất cao |
| `report.js` | Mô hình dữ liệu dùng chung cho báo cáo | Cao |
| `dashboard.js` | Tổng hợp tuần/tháng/năm, nhóm chi và người ứng nhiều | Trung bình |
| `app.js` | Điều phối giao diện, lưu dữ liệu và sự kiện | Cao |
| `Code.gs` | Trình bày Google Sheet | Trung bình |
| `styles.css` | Desktop, mobile và bố cục in | Thấp với dữ liệu, cao với UX |

## Luồng dữ liệu

`Portfolio -> Trip -> Members / Expenses / Payments`

- Dashboard đọc nhiều chuyến qua `dashboard.js`.
- Quyết toán đọc một chuyến qua `logic.js`.
- PDF/CSV/Sheet dùng cùng mô hình báo cáo, không tự viết lại công thức.
- D1 lưu JSON chuyến đi; trường mới được chuẩn hóa khi tải dữ liệu cũ.

## Quy trình mở rộng sang website khác

1. Khai báo trường dữ liệu và giá trị mặc định.
2. Viết phép tính dưới dạng hàm thuần trong mô-đun riêng.
3. Kiểm thử dữ liệu cũ và trường hợp mới trước khi nối UI.
4. UI chỉ gọi mô-đun, không lặp công thức.
5. Báo cáo và dashboard dùng cùng kết quả trung tâm.
6. Mỗi tính năng xác định rõ ảnh hưởng tới lưu trữ, công nợ, xuất dữ liệu, chia sẻ và responsive.

`logic.js`, `report.js` và `dashboard.js` có thể được tái sử dụng cho website khác mà không phải mang theo toàn bộ giao diện TripSplit.

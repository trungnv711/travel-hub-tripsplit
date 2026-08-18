# TripSplit — Phân tích BA mô-đun Quỹ chuyến đi

## 1. Vấn đề nghiệp vụ

Trường `prepaidAmount` cũ chỉ ghi nhận một con số tạm ứng tại hồ sơ thành viên và không tham gia quyết toán. Mô hình này không trả lời được bốn câu hỏi quan trọng:

1. Nhóm đã nạp vào quỹ tổng cộng bao nhiêu?
2. Bao nhiêu chi phí được trả bằng quỹ, bao nhiêu do cá nhân tự ứng?
3. Người giữ quỹ đang còn cầm bao nhiêu tiền mặt?
4. Mỗi thành viên đã được hoàn bao nhiêu và còn được hoàn bao nhiêu?

## 2. Phạm vi dữ liệu

- `member.prepaidAmount`: tiền tạm ứng ban đầu, giữ để tương thích dữ liệu cũ.
- `trip.fundKeeperId`: thành viên chịu trách nhiệm giữ tiền mặt của quỹ.
- `trip.fundTransactions[]`: sổ giao dịch quỹ, gồm `deposit` (nạp thêm) và `refund` (hoàn tiền).
- `expense.paymentSource`: `fund` nếu trả từ quỹ, `personal` nếu một thành viên tự trả.
- `payments[]`: giao dịch quyết toán giữa hai thành viên, tách biệt với nạp/hoàn quỹ.

## 3. Công thức nghiệp vụ

- Tổng tạm ứng thành viên = Tạm ứng ban đầu + Tổng nạp thêm.
- Tạm ứng ròng = Tổng tạm ứng − Đã hoàn.
- Phần chi từ quỹ của thành viên = Tổng phần được phân bổ trong các khoản chi có nguồn `fund`.
- Còn lại tạm ứng = `max(Tạm ứng ròng − Phần chi từ quỹ, 0)`.
- Thiếu tạm ứng = `max(Phần chi từ quỹ − Tạm ứng ròng, 0)`.
- Quỹ còn lại = Tổng tiền đã nạp − Tổng đã hoàn − Tổng chi từ quỹ.
- Quyết toán thành viên trước chuyển tiền = Chi cá nhân + Tạm ứng ròng − Tổng phải chịu.
- Người giữ quỹ được trừ thêm số tiền quỹ đang cầm để tổng quyết toán toàn nhóm luôn cân bằng về 0.

## 4. Ví dụ kiểm chứng

Chuyến Đà Lạt có 7 thành viên:

- Mỗi người nạp ban đầu 1.000.000 đồng: tổng 7.000.000 đồng.
- Nhóm nạp thêm 5.000.000 đồng: tổng quỹ đã nạp 12.000.000 đồng.
- Chi từ quỹ 10.000.000 đồng.
- Quỹ còn lại 2.000.000 đồng.

Nếu 5.000.000 đồng nạp thêm được chia đều cho 7 người, số tiền còn được hoàn của mỗi người xấp xỉ 285.714–285.715 đồng; tổng đúng 2.000.000 đồng. Sai số 1 đồng được phân bổ có kiểm soát để tổng không lệch.

Nếu chỉ một người nạp thêm toàn bộ 5.000.000 đồng, hệ thống không chia đều tiền hoàn một cách sai lệch. Người đó có quyền được nhận lại nhiều hơn, còn những người đóng thiếu phải bổ sung theo phần thực tế phải chịu.

## 5. Kiểm soát và tác động

- Không cho hoàn quá số tiền thành viên còn trong quỹ.
- Không cho hoàn quá số dư tiền mặt hiện có.
- Khoản chi kế hoạch không làm giảm quỹ và không tham gia quyết toán.
- Dữ liệu cũ tự động được gán nguồn `personal`; tạm ứng ban đầu được giữ nguyên.
- PDF, CSV và Google Sheet dùng cùng mô hình tính toán để tránh lệch số giữa các đầu ra.
- Xóa hoặc đổi người giữ quỹ làm thay đổi toàn bộ hướng quyết toán nên phải lưu và tính lại ngay.

## 6. Nguyên tắc mở rộng

Mô-đun quỹ chỉ phụ thuộc vào các hàm thuần trong `logic.js`. Khi tái sử dụng ở website khác, giao diện chỉ cần cung cấp thành viên, khoản chi, giao dịch quỹ và người giữ quỹ; không cần sao chép logic tính toán vào từng màn hình hoặc từng báo cáo.

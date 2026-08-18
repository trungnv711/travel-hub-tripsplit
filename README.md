# Travel Hub — TripSplit

Trang web cá nhân dành cho việc quản lý chuyến đi và chia chi phí nhóm. Công cụ
TripSplit giúp theo dõi thành viên, quỹ chung, khoản chi, công nợ và báo cáo của
từng chuyến đi trên cùng một giao diện.

## Truy cập

- Website: [tripchia.trungnguyen-fit71.chatgpt.site](https://tripchia.trungnguyen-fit71.chatgpt.site/)
- Công cụ TripSplit: [Mở TripSplit](https://tripchia.trungnguyen-fit71.chatgpt.site/cong-cu)

## Tính năng chính

- Quản lý nhiều chuyến đi độc lập.
- Quản lý thành viên và thông tin liên hệ của từng chuyến.
- Theo dõi quỹ chung: tạm ứng, nạp thêm, hoàn tiền và chi từ quỹ.
- Ghi nhận chi phí cá nhân hoặc chi phí thanh toán từ quỹ.
- Tự động tính phần chia, số dư và phương án quyết toán.
- Phân biệt khoản đã chốt với khoản chi phí kế hoạch.
- Chia sẻ chuyến đi bằng liên kết.
- Xuất báo cáo PDF, CSV và sao lưu hoặc khôi phục bằng JSON.
- Đồng bộ báo cáo với Google Sheet thông qua Google Apps Script.
- Đăng ký, đăng nhập bằng email hoặc Google với Firebase Authentication.

## Công nghệ

- Next.js 16, React 19 và TypeScript.
- vinext/Vite cho quá trình build và triển khai.
- Cloudflare D1 và Drizzle ORM cho dữ liệu phía máy chủ.
- Firebase Authentication cho danh tính người dùng trên Cloudflare.
- HTML, CSS và JavaScript cho không gian làm việc TripSplit.
- Node.js từ phiên bản `22.13.0` trở lên.

## Chạy dự án trên máy

### 1. Cài đặt

```bash
npm ci
```

### 2. Chạy môi trường phát triển

```bash
npm run dev
```

Mở địa chỉ được hiển thị trong cửa sổ dòng lệnh để xem website.

### 3. Kiểm tra trước khi gửi code

```bash
npm run lint
npm test
```

Lệnh `npm test` sẽ build toàn bộ ứng dụng trước khi chạy bộ kiểm thử giao diện
đã kết xuất.

## Cấu trúc chính

```text
app/                      Trang web và các API phía máy chủ
public/tripsplit/         Giao diện và nghiệp vụ của công cụ TripSplit
tests/                    Bộ kiểm thử tự động
db/                       Khai báo dữ liệu với Drizzle
drizzle/                  Các phiên bản thay đổi cơ sở dữ liệu
.openai/hosting.json      Cấu hình dự án đang được triển khai
FUND_MANAGEMENT_BA.md     Đặc tả nghiệp vụ quỹ chuyến đi
FEATURE_ARCHITECTURE.md   Tài liệu kiến trúc tính năng
```

## Quy trình đóng góp

Không sửa trực tiếp trên nhánh `main`. Mỗi thay đổi nên đi qua một nhánh riêng:

```bash
git switch main
git pull
git switch -c codex/ten-thay-doi

# Chỉnh sửa và kiểm tra code
npm run lint
npm test

git add .
git commit -m "feat: mô tả ngắn gọn thay đổi"
git push -u origin codex/ten-thay-doi
```

Sau khi đẩy nhánh, tạo Pull Request trên GitHub, chờ kiểm tra tự động hoàn tất
rồi mới hợp nhất vào `main`.

## Quy ước commit

- `feat:` thêm tính năng.
- `fix:` sửa lỗi.
- `docs:` cập nhật tài liệu.
- `test:` thêm hoặc sửa kiểm thử.
- `refactor:` cải tổ code nhưng không thay đổi hành vi.
- `chore:` công việc bảo trì dự án.

## An toàn dữ liệu

- Không commit mật khẩu, khóa bí mật hoặc file `.env` lên GitHub.
- Không commit gói triển khai cục bộ `.codex-site.tar.gz`.
- Dữ liệu lưu trên thiết bị nên được sao lưu bằng JSON trước khi xóa dữ liệu
  trình duyệt hoặc chuyển máy.

## Trạng thái

Dự án đang được phát triển và sử dụng cho website cá nhân Travel Hub.

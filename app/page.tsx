import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Travel Hub — Không gian chuyến đi của tôi",
  description: "Một không gian cá nhân để quản lý hành trình, chi phí nhóm và những công cụ du lịch hữu ích.",
};

const highlights = [
  { number: "01", title: "Nhiều chuyến, một nơi", copy: "Tách riêng thành viên, khoản chi và quyết toán cho từng hành trình." },
  { number: "02", title: "Tính tiền minh bạch", copy: "Biết ngay ai cần trả ai, khoản nào đã chốt và khoản nào còn dự kiến." },
  { number: "03", title: "Chia sẻ dễ dàng", copy: "Gửi liên kết, xuất PDF, CSV hoặc đồng bộ Google Sheet cho cả nhóm." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const params = await searchParams;
  if (typeof params.trip === "string" && params.trip) {
    redirect(`/cong-cu?trip=${encodeURIComponent(params.trip)}`);
  }

  return (
    <main className="personal-site">
      <nav className="site-nav" aria-label="Điều hướng chính">
        <Link className="site-brand" href="/" aria-label="Travel Hub — Trang chủ">
          <span className="site-brand__mark">T</span>
          <span><strong>Travel Hub</strong><small>Không gian của tôi</small></span>
        </Link>
        <div className="site-nav__links">
          <a href="#gioi-thieu">Giới thiệu</a>
          <a href="#cong-cu">Công cụ</a>
          <Link className="button button--small" href="/cong-cu">Mở TripSplit</Link>
        </div>
      </nav>

      <section className="personal-hero" id="gioi-thieu">
        <div className="personal-hero__copy">
          <p className="kicker">NHẬT KÝ HÀNH TRÌNH · CÔNG CỤ CÁ NHÂN</p>
          <h1>Đi nhiều hơn.<br /><em>Đối soát nhẹ hơn.</em></h1>
          <p className="personal-hero__lead">Nơi mình lưu lại những chuyến đi và xây các công cụ nhỏ giúp cả nhóm quản lý chi phí rõ ràng, nhanh chóng, không còn những bảng tính rối mắt.</p>
          <div className="personal-hero__actions">
            <Link className="button" href="/cong-cu">Bắt đầu với TripSplit <span aria-hidden="true">→</span></Link>
            <a className="text-link" href="#cong-cu">Khám phá công cụ</a>
          </div>
        </div>

        <div className="journey-card" aria-label="Minh họa hành trình">
          <div className="journey-card__top"><span>CHUYẾN ĐI GẦN ĐÂY</span><span className="live-dot">Đang quản lý</span></div>
          <div className="journey-card__route"><span>SGN</span><div><i />✈<i /></div><span>DLI</span></div>
          <div className="journey-card__places"><span>TP. Hồ Chí Minh</span><span>Đà Lạt</span></div>
          <div className="journey-card__stats">
            <div><small>Thành viên</small><strong>08 người</strong></div>
            <div><small>Khoản chi</small><strong>24 khoản</strong></div>
            <div><small>Trạng thái</small><strong>Đang quyết toán</strong></div>
          </div>
          <div className="journey-card__stamp" aria-hidden="true">TRIP<br />SPLIT</div>
        </div>
      </section>

      <section className="personal-section" id="cong-cu">
        <div className="section-heading">
          <p className="kicker">CÔNG CỤ NỔI BẬT</p>
          <h2>Mọi khoản chi đều có câu trả lời.</h2>
          <p>TripSplit được xây cho những chuyến đi thật: nhiều người, nhiều khoản ứng và nhiều thay đổi đến phút cuối.</p>
        </div>
        <div className="tool-showcase">
          <div className="tool-showcase__copy">
            <span className="tool-icon" aria-hidden="true">✦</span>
            <p className="kicker">TRIPSPLIT</p>
            <h3>Chia chi phí nhóm, rõ ràng đến từng người.</h3>
            <p>Tạo chuyến đi, thêm thành viên và ghi nhận khoản chi. Hệ thống tự tính phần mỗi người phải chịu và đề xuất các giao dịch cần chuyển.</p>
            <Link className="button button--light" href="/cong-cu">Dùng công cụ miễn phí <span aria-hidden="true">→</span></Link>
          </div>
          <div className="tool-showcase__features">
            {highlights.map((item) => (
              <article key={item.number}><span>{item.number}</span><div><h4>{item.title}</h4><p>{item.copy}</p></div></article>
            ))}
          </div>
        </div>
      </section>

      <section className="personal-cta">
        <p className="kicker">SẴN SÀNG CHO CHUYẾN TIẾP THEO?</p>
        <h2>Tạo chuyến đi đầu tiên trong vài phút.</h2>
        <Link className="button" href="/cong-cu">Mở TripSplit ngay →</Link>
      </section>

      <footer className="site-footer">
        <div><strong>Travel Hub</strong><p>Một góc nhỏ dành cho hành trình và những công cụ hữu ích.</p></div>
        <p>Được xây dựng để mỗi chuyến đi nhẹ nhàng hơn.</p>
      </footer>
    </main>
  );
}

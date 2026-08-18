import { getCurrentUser } from "../../auth";

const SCRIPT_URL_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const MAX_PAYLOAD_BYTES = 750_000;
const MAX_RESPONSE_CHARS = 1_000_000;

type SheetRequest = {
  action?: "check" | "sync";
  scriptUrl?: string;
  secret?: string;
  payload?: Record<string, unknown>;
};

function errorMessage(status: number) {
  if (status === 404) return "URL Apps Script không còn tồn tại. Hãy tạo deployment mới và dán URL /exec mới.";
  if (status === 401 || status === 403) return "Apps Script chưa cho phép truy cập. Hãy đặt Who has access thành Anyone.";
  return `Apps Script phản hồi lỗi HTTP ${status}.`;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ error: "Vui lòng đăng nhập trước khi kết nối Google Sheet." }, { status: 401 });

  try {
    const body = (await request.json()) as SheetRequest;
    const action = body.action === "sync" ? "sync" : "check";
    const scriptUrl = String(body.scriptUrl || "").trim();
    if (!SCRIPT_URL_PATTERN.test(scriptUrl)) {
      return Response.json({ error: "Web App URL không hợp lệ. URL phải bắt đầu bằng script.google.com và kết thúc bằng /exec." }, { status: 400 });
    }

    if (action === "check") {
      const healthUrl = new URL(scriptUrl);
      healthUrl.searchParams.set("health", "1");
      const response = await fetchWithTimeout(healthUrl.toString(), { method: "GET", cache: "no-store" }, 20_000);
      if (!response.ok) return Response.json({ error: errorMessage(response.status) }, { status: 502 });
      const finalHost = new URL(response.url).hostname;
      if (finalHost === "accounts.google.com") {
        return Response.json({ error: "Deployment đang yêu cầu đăng nhập Google. Hãy triển khai Web app với quyền truy cập Anyone." }, { status: 502 });
      }
      return Response.json({ ok: true, message: "Kết nối Apps Script hoạt động." });
    }

    const secret = String(body.secret || "").trim();
    if (!secret || secret.length > 256) return Response.json({ error: "Mã bí mật không hợp lệ." }, { status: 400 });
    if (!body.payload || typeof body.payload !== "object") return Response.json({ error: "Thiếu dữ liệu chuyến đi." }, { status: 400 });
    const payloadText = JSON.stringify({ ...body.payload, secret, responseMode: "json" });
    if (new TextEncoder().encode(payloadText).length > MAX_PAYLOAD_BYTES) {
      return Response.json({ error: "Dữ liệu chuyến đi quá lớn để xuất Google Sheet." }, { status: 413 });
    }

    const form = new URLSearchParams({ payload: payloadText });
    const response = await fetchWithTimeout(scriptUrl, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: form.toString(),
    }, 55_000);
    if (!response.ok) return Response.json({ error: errorMessage(response.status) }, { status: 502 });
    const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);

    try {
      const result = JSON.parse(text) as { ok?: boolean; error?: string; message?: string; sheetUrl?: string; sharedCount?: number; failedEmails?: string[] };
      if (!result.ok) return Response.json({ error: result.error || "Apps Script không thể cập nhật Sheet." }, { status: 502 });
      return Response.json(result);
    } catch {
      const sheetUrl = decodeHtml(text.match(/href=["'](https:\/\/docs\.google\.com\/spreadsheets\/[^"']+)/i)?.[1] || "");
      if (/Google Sheet đã được cập nhật/i.test(text)) {
        return Response.json({ ok: true, message: "Google Sheet đã được cập nhật.", sheetUrl, legacyResponse: true });
      }
      const plainText = decodeHtml(text.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      return Response.json({ error: plainText.slice(0, 400) || "Apps Script trả về dữ liệu không hợp lệ. Hãy cập nhật Code.gs và deployment." }, { status: 502 });
    }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Apps Script phản hồi quá lâu. Hãy kiểm tra deployment rồi thử lại."
      : error instanceof Error ? error.message : "Không thể kết nối Google Sheet.";
    return Response.json({ error: message }, { status: 500 });
  }
}

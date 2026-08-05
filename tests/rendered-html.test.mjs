import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("ships the professional TripSplit workspace and account controls", async () => {
  const [html, app, css] = await Promise.all([
    read("public/tripsplit/index.html"),
    read("public/tripsplit/app.js"),
    read("public/tripsplit/styles.css"),
  ]);

  assert.match(html, /data-tab="overview"/);
  assert.match(html, /data-tab="expenses"/);
  assert.match(html, /data-tab="members"/);
  assert.match(html, /data-tab="share"/);
  assert.match(html, /id="btnSignIn"/);
  assert.match(html, /id="btnSignOut"/);
  assert.match(html, /id="shareMenu"/);
  assert.match(html, /data-share-action="email"/);
  assert.match(html, /data-share-action="facebook"/);
  assert.match(html, /data-share-action="copy"/);
  assert.match(app, /fetch\("\/api\/me"/);
  assert.match(app, /fetch\("\/api\/account\/trips"/);
  assert.match(app, /loadSharedTripFromUrl/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /Logic\.buildShareContent/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(css, /\.account-box/);
  assert.match(css, /\.share-menu/);
});

test("builds safe, deduplicated share targets", async () => {
  await import(new URL("public/tripsplit/logic.js", root));
  const Logic = globalThis.TravelExpenseLogic;
  const content = Logic.buildShareContent(
    "Đà Lạt cùng nhóm",
    "https://example.com/?trip=abc-123",
    [
      { email: " An@Example.com " },
      { email: "an@example.com" },
      { email: "khong-hop-le" },
      { email: "binh@example.com" },
    ],
  );

  assert.deepEqual(content.emails, ["an@example.com", "binh@example.com"]);
  assert.match(content.mailtoUrl, /^mailto:\?bcc=/);
  assert.match(decodeURIComponent(content.mailtoUrl), /an@example\.com,binh@example\.com/);
  assert.match(content.facebookUrl, /^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
  assert.match(decodeURIComponent(content.facebookUrl), /trip=abc-123/);
  assert.throws(() => Logic.buildShareContent("Trip", "javascript:alert(1)", []), /không hợp lệ/);
});

test("persists owned trips and revision history in D1", async () => {
  const [schema, createRoute, updateRoute, accountRoute, migration] = await Promise.all([
    read("db/schema.ts"),
    read("app/api/shared-trips/route.ts"),
    read("app/api/shared-trips/[shareId]/route.ts"),
    read("app/api/account/trips/route.ts"),
    read("drizzle/0001_narrow_roulette.sql"),
  ]);

  assert.match(schema, /ownerId:\s*text\("owner_id"\)/);
  assert.match(schema, /tripHistory/);
  assert.match(createRoute, /getChatGPTUser/);
  assert.match(updateRoute, /action:\s*"updated"/);
  assert.match(accountRoute, /eq\(sharedTrips\.ownerId, user\.userId\)/);
  assert.match(migration, /CREATE TABLE `trip_history`/);
  assert.match(migration, /ADD `owner_id` text/);
});

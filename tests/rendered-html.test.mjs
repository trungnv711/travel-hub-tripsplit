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
  assert.match(app, /fetch\("\/api\/me"/);
  assert.match(app, /fetch\("\/api\/account\/trips"/);
  assert.match(app, /loadSharedTripFromUrl/);
  assert.match(css, /\.account-box/);
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

/**
 * Generate README screenshots from the running local app.
 *
 *   JWT_SECRET=$(grep ^JWT_SECRET= .env | cut -d= -f2-) node scripts/screenshots.mjs
 *
 * Requires: the app running on http://localhost:3000, google-chrome installed,
 * and puppeteer-core. Uses a freshly-minted session cookie for user id 1.
 */
import { mkdir } from "node:fs/promises";
import { SignJWT } from "jose";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const BOARD = 8;
const CARD = 35;
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const OUT = "docs/screenshots";
const VIEW = { width: 1440, height: 900, deviceScaleFactor: 1.5 };

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error("Set JWT_SECRET (from .env) in the environment.");
  process.exit(1);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function token() {
  return new SignJWT({ email: "cedric@test.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("1")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(secret));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars"],
    defaultViewport: VIEW,
  });

  const session = await token();

  // Render a target with a given theme (and optional view), then screenshot.
  async function shot({ name, path, theme = "dark", authed = true, view }) {
    const page = await browser.newPage();
    await page.setViewport(VIEW);
    if (authed) {
      await page.setCookie({
        name: "sunday_session",
        value: session,
        domain: "localhost",
        path: "/",
        httpOnly: true,
      });
    }
    // Seed theme (+ optional per-board view) in localStorage before navigating.
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (t, b, v) => {
        localStorage.setItem("theme", t);
        if (v) localStorage.setItem(`sunday:boardView:${b}`, v);
      },
      theme,
      BOARD,
      view || "",
    );
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    await wait(2800); // fonts + entrance animations + data
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log("✓", `${OUT}/${name}.png`);
    await page.close();
  }

  await shot({ name: "landing", path: "/", theme: "sand", authed: false });
  await shot({ name: "board-kanban", path: `/boards/${BOARD}`, theme: "sand" });
  await shot({ name: "card-drawer", path: `/boards/${BOARD}?card=${CARD}`, theme: "sand" });
  await shot({ name: "board-table", path: `/boards/${BOARD}`, theme: "sand", view: "table" });
  await shot({ name: "board-light", path: `/boards/${BOARD}`, theme: "sand" });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

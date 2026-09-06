/**
 * Renders the tracker in a headless browser and checks that every button
 * reaches 4.5:1 contrast against the surface behind it.
 *
 *   node preview/probe.mjs
 *
 * This exists because the two colour bugs it caught were both invisible in the
 * source: one button group inherited its colour from the host page, and a fix
 * that was too broad then overrode a group that had been correct. Reading the
 * CSS could not settle either; measuring the rendered page did.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SP = await mkdtemp(path.join(tmpdir(), "tlt-probe-"));

// React is bundled in rather than loaded from a CDN, so this runs offline.
await build({
  entryPoints: [path.join(here, "probe-entry.js")],
  bundle: true, format: "iife", jsx: "transform",
  loader: { ".jsx": "jsx" },
  alias: { papaparse: path.join(here, "shim-papa-stub.js") },
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: path.join(SP, "probe.js"),
});

await writeFile(path.join(SP, "probe.html"), `<!doctype html><html><head><meta charset="utf-8">
<title>probe</title></head><body style="margin:0"><div id="root"></div>
<script>(function(){var k=function(a,s){return (s?"shared:":"mine:")+a;};
window.storage={get:function(a,s){var v=localStorage.getItem(k(a,s));
  return Promise.resolve(v===null?null:{value:v});},
set:function(a,v,s){localStorage.setItem(k(a,s),v);return Promise.resolve();},
delete:function(a,s){localStorage.removeItem(k(a,s));return Promise.resolve();}};})();
</script><script src="probe.js"></script></body></html>`);
const salt = "0011223344556677";
const hash = createHash("sha256").update(`tlt:${salt}:4821`).digest("hex");
const team = { members: [{ name: "Preview", role: "Super admin", email: "", salt, hash }] };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: "dark" });
await page.addInitScript(([t, m]) => {
  localStorage.setItem("shared:tlt:team-v1", t);
  localStorage.setItem("mine:tlt:me-v1", m);
}, [JSON.stringify(team), JSON.stringify({ name: "Preview", hash })]);
await page.goto(`file://${SP}/probe.html`);
await page.waitForSelector(".row-actions .mini", { timeout: 25000 });

/** Relative luminance, to judge contrast rather than eyeball hex values. */
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => {
    const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const rows = await page.evaluate(() => {
  const out = [];
  const push = (el, where) => {
    const cs = getComputedStyle(el);
    let bg = cs.backgroundColor, node = el;
    while (bg === "rgba(0, 0, 0, 0)" && node.parentElement) {
      node = node.parentElement; bg = getComputedStyle(node).backgroundColor;
    }
    out.push({ where, label: el.textContent.trim().slice(0, 22), color: cs.color, bg });
  };
  const seen = new Set();
  for (const b of document.querySelectorAll(".row-actions .mini")) {
    if (seen.has(b.textContent.trim())) continue;
    seen.add(b.textContent.trim()); push(b, "table row");
    if (seen.size >= 4) break;
  }
  for (const b of document.querySelectorAll(".who .who-btn")) push(b, "header");
  return out;
});

let bad = 0;
for (const r of rows) {
  const L1 = lum(r.color), L2 = lum(r.bg);
  const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  const ok = ratio >= 4.5;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${ratio.toFixed(1)}:1  [${r.where}] ${r.label.padEnd(24)} ${r.color} on ${r.bg}`);
}
console.log(bad === 0 ? "\nAll buttons meet 4.5:1." : `\n${bad} button(s) below 4.5:1.`);
if (bad > 0) process.exitCode = 1;
const shot = path.join(SP, "probe.png");
await page.screenshot({ path: shot });
console.log(`Screenshot: ${shot}`);
await browser.close();

/**
 * Drives the ticket scanner end to end with PDF.js and the sample capability
 * stubbed out, so the PDF handling can be verified without network access.
 *
 * Checks both routes: a normal e-ticket (text layer -> sent as text) and a
 * scanned one (no text -> first page rendered and sent as an image).
 *
 *   node preview/probe-scan.mjs
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SP = await mkdtemp(path.join(tmpdir(), "tlt-scan-"));

await build({
  entryPoints: [path.join(here, "probe-entry.js")],
  bundle: true, format: "iife", jsx: "transform",
  loader: { ".jsx": "jsx" },
  alias: { papaparse: path.join(here, "shim-papa-stub.js") },
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: path.join(SP, "probe.js"),
});

await writeFile(path.join(SP, "probe.html"), `<!doctype html><html><head><meta charset="utf-8">
<title>scan probe</title></head><body style="margin:0"><div id="root"></div>
<script>(function(){var k=function(a,s){return (s?"shared:":"mine:")+a;};
window.storage={get:function(a,s){var v=localStorage.getItem(k(a,s));
  return Promise.resolve(v===null?null:{value:v});},
set:function(a,v,s){localStorage.setItem(k(a,s),v);return Promise.resolve();},
delete:function(a,s){localStorage.removeItem(k(a,s));return Promise.resolve();}};})();
</script><script src="probe.js"></script></body></html>`);

const salt = "0011223344556677";
const hash = createHash("sha256").update(`tlt:${salt}:4821`).digest("hex");
const team = { members: [{ name: "Preview", role: "Super admin", email: "", salt, hash }] };

async function run(label, { hasTextLayer }) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.addInitScript(([t, m, withText]) => {
    localStorage.setItem("shared:tlt:team-v1", t);
    localStorage.setItem("mine:tlt:me-v1", m);

    // Stand in for the PDF.js build that would come from cdnjs.
    const items = withText
      ? [{ str: "ELECTRONIC TICKET ITINERARY RECEIPT" },
         { str: "PASSENGER SCOTT MACKAY MR   BOOKING REFERENCE 7QW2XZ" },
         { str: "ISSUING OFFICE KURDISTAN TRAVEL ERBIL   TICKET 235 1234567890" },
         { str: "OUTBOUND  TK 804  ISTANBUL IST  TO  ERBIL EBL" },
         { str: "DEPART 27OCT26 2340   ARRIVE 28OCT26 0515   TERMINAL 1   ECONOMY" },
         { str: "RETURN    TK 317  ERBIL EBL  TO  ISTANBUL IST" },
         { str: "DEPART 03DEC26 0255   ARRIVE 03DEC26 0620   ECONOMY   1PC 23KG" },
         { str: "FARE BASIS QLXOW   BAGGAGE ALLOWANCE 1 PIECE 23 KG PER PASSENGER" },
         { str: "PLEASE PRESENT THIS RECEIPT AND A VALID PASSPORT AT CHECK IN" },
         { str: "CHECK IN CLOSES 60 MINUTES BEFORE SCHEDULED DEPARTURE TIME" }]
      : [{ str: " " }];
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: () => Promise.resolve({
            getTextContent: () => Promise.resolve({ items }),
            getViewport: ({ scale }) => ({ width: 595 * scale, height: 842 * scale }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        }),
      }),
    };

    // Stand in for the host's sample capability; record what it is handed.
    window.__sent = null;
    window.claude = {
      use: (name) => name !== "sample" ? Promise.resolve(null) : Promise.resolve(
        Object.assign(
          async () => ({ text: "" }),
          {
            json: async (input, opts) => {
              window.__sent = {
                input: String(input),
                imageType: opts && opts.images ? opts.images.type : null,
                imageBytes: opts && opts.images ? opts.images.size : null,
              };
              return { name: "Scott Mackay", arrDate: "2026-10-28", arrTime: "05:15",
                       arrFlight: "TK 804", depDate: "2026-12-03", depTime: "02:55",
                       depFlight: "TK 317", arrAirport: "Erbil (EIA)" };
            },
            limits: async () => ({ images: { maxCount: 4, maxInputBytes: 20 * 1024 * 1024,
                                             mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] } }),
          },
        ),
      ),
    };
  }, [JSON.stringify(team), JSON.stringify({ name: "Preview", hash }), hasTextLayer]);

  await page.goto(`file://${SP}/probe.html`);
  await page.getByRole("button", { name: "Scan ticket" }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "eticket.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 stub"),
  });
  await page.getByRole("button", { name: /^Read the ticket|^Scan|Read ticket/i }).click()
    .catch(async () => { await page.locator(".modal-actions .btn.primary").click(); });

  await page.waitForFunction(() => window.__sent !== null, { timeout: 15000 });
  const sent = await page.evaluate(() => window.__sent);

  console.log(`\n--- ${label} ---`);
  if (hasTextLayer) {
    const ok = sent.imageType === null && /Here is the text of the ticket/.test(sent.input)
      && /SCOTT MACKAY/.test(sent.input);
    console.log(ok ? "PASS  sent as text, no image" : "FAIL  " + JSON.stringify(sent).slice(0, 300));
    console.log(`      prompt carried ${sent.input.length} chars of ticket text`);
  } else {
    const ok = sent.imageType === "image/jpeg" && sent.imageBytes > 0;
    console.log(ok ? `PASS  rendered to ${sent.imageType}, ${sent.imageBytes} bytes`
                   : "FAIL  " + JSON.stringify(sent).slice(0, 300));
  }
  await browser.close();
  return sent;
}

await run("e-ticket with a text layer", { hasTextLayer: true });
await run("scanned ticket, no text layer", { hasTextLayer: false });

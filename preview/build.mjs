/**
 * Builds the browser preview of the tracker.
 *
 * The tracker is written for its artifact host: it imports React and PapaParse
 * as modules and expects a global `window.storage`. This bundles it against
 * UMD globals and injects the result into template.html, which supplies a
 * localStorage-backed `window.storage` so the preview is self-contained.
 *
 *   node preview/build.mjs
 *
 * Output (preview/bundle.js, preview/index.html) is generated and git-ignored.
 */
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

await build({
  entryPoints: [path.join(here, "entry.js")],
  bundle: true,
  format: "iife",
  globalName: "TLT",
  jsx: "transform",
  loader: { ".jsx": "jsx" },
  alias: {
    react: path.join(here, "shim-react.js"),
    papaparse: path.join(here, "shim-papa.js"),
  },
  outfile: path.join(here, "bundle.js"),
});

const template = await readFile(path.join(here, "template.html"), "utf8");
const bundle = await readFile(path.join(here, "bundle.js"), "utf8");

// A literal </script> inside the bundle would close the tag it is embedded in.
const safe = bundle.replaceAll("</script>", "<\\/script>");

if (!template.includes("__BUNDLE__")) {
  throw new Error("template.html no longer contains the __BUNDLE__ placeholder");
}

const out = path.join(here, "index.html");
await writeFile(out, template.replace("__BUNDLE__", safe));
console.log(`Wrote ${path.relative(root, out)} (${(safe.length / 1024).toFixed(0)} kB of script)`);

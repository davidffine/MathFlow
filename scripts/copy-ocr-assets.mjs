import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../public/ocr/", import.meta.url));
const workerRoot = dirname(require.resolve("tesseract.js/package.json"));
const coreRoot = dirname(require.resolve("tesseract.js-core/package.json"));
rmSync(root, { recursive: true, force: true });
mkdirSync(join(root, "core"), { recursive: true });
mkdirSync(join(root, "lang"), { recursive: true });
copyFileSync(
  join(workerRoot, "dist/worker.min.js"),
  join(root, "worker.min.js"),
);

// The OCR always requests the LSTM engine. Ship all three browser variants so
// older devices, SIMD and relaxed SIMD use their supported core offline.
for (const variant of ["", "-simd", "-relaxedsimd"]) {
  for (const suffix of [".wasm.js", ".wasm"]) {
    const name = `tesseract-core${variant || ""}-lstm${suffix}`;
    copyFileSync(join(coreRoot, name), join(root, "core", name));
  }
}
for (const language of ["eng", "heb"]) {
  const dataRoot = dirname(
    require.resolve(`@tesseract.js-data/${language}/package.json`),
  );
  // Serve raw data: some static hosts mark .gz as Content-Encoding:gzip,
  // making the browser decompress it before Tesseract can read it.
  writeFileSync(
    join(root, "lang", `${language}.traineddata`),
    gunzipSync(
      readFileSync(join(dataRoot, `4.0.0_best_int/${language}.traineddata.gz`)),
    ),
  );
}

// Smoke test for the served build.
//
// Starts from a base URL (the running launch.py server) and checks that the
// page shell, source modules and the Box3D WebAssembly module are actually
// served and load. Run locally with:
//
//   python3 launch.py --no-open &
//   node scripts/smoke.mjs http://localhost:8000
//
// Exits non-zero on the first failure.
const base = (process.argv[2] ?? "http://localhost:8000").replace(/\/+$/, "");

let failures = 0;
let checks = 0;

function ok(label, detail = "") {
  checks += 1;
  console.log(`  ok   ${label}${detail ? `  (${detail})` : ""}`);
}

function fail(label, detail = "") {
  checks += 1;
  failures += 1;
  console.error(`  FAIL ${label}${detail ? `  -> ${detail}` : ""}`);
}

function check(cond, label, detail = "") {
  cond ? ok(label, detail) : fail(label, detail);
}

async function get(path) {
  const res = await fetch(base + path, { redirect: "manual" });
  return res;
}

// --- page shell -------------------------------------------------------------
console.log(`smoke: ${base}`);

const page = await get("/");
check(page.status === 200, "GET / returns 200", `status ${page.status}`);
const html = await page.text();
check(/<title>Gummy Bears/.test(html), "page has the Gummy Bears title");
check(html.includes('type="importmap"'), "page declares an import map");
check(html.includes("three@0.186.1"), "page pins the three.js version");
check(html.includes('id="aeroHud"'), "page includes the HUD markup");
check(html.includes('id="settings"'), "page includes the settings sheet");
check(html.includes('data-profile="auto"'), "page includes graphics presets");
check(html.includes('id="raceLab"'), "page includes the Studio race prototype");
check(html.includes('id="raceFrame"'), "page includes the race camera-frame control");

// --- source modules ---------------------------------------------------------
const modules = [
  "/src/app.js",
  "/src/config.js",
  "/src/world.js",
  "/src/launcher.js",
  "/src/field.js",
  "/src/food.js",
  "/src/life.js",
  "/src/ai.js",
  "/src/effects.js",
  "/src/msn.js",
  "/src/aidebug.js",
  "/src/sky.js",
  "/src/box3d.js",
  "/vendor/box3d/box3d.js",
];
for (const path of modules) {
  const res = await get(path);
  const type = res.headers.get("content-type") ?? "";
  check(
    res.status === 200 && /javascript/.test(type),
    `GET ${path}`,
    `${res.status} ${type}`,
  );
  // Drain every response. Node 24's bundled undici crashes with an
  // uncatchable Parser.finish assertion when a paused body is followed by a
  // server FIN (nodejs/undici#5360). Consuming the body keeps the parser out
  // of that state regardless of the CI Node version.
  await res.arrayBuffer();
}

// --- Studio GLB -------------------------------------------------------------
const glbRes = await get("/assets/MSN_Figure/msn.glb");
const glbType = glbRes.headers.get("content-type") ?? "";
check(glbRes.status === 200, "GET /assets/MSN_Figure/msn.glb returns 200");
check(
  glbType.includes("gltf-binary"),
  "GLB is served with the model/gltf-binary MIME type",
  glbType,
);
const glbBytes = new Uint8Array(await glbRes.arrayBuffer());
const glbMagic = new TextDecoder().decode(glbBytes.subarray(0, 4));
check(glbMagic === "glTF", "GLB has the glTF magic header", glbMagic);
check(glbBytes.length > 200_000, "GLB payload is present", `${glbBytes.length} bytes`);

// --- Box3D wasm -------------------------------------------------------------
const wasmRes = await get("/vendor/box3d/box3d.wasm");
const wasmType = wasmRes.headers.get("content-type") ?? "";
check(wasmRes.status === 200, "GET /vendor/box3d/box3d.wasm returns 200");
check(
  wasmType.includes("application/wasm"),
  "wasm is served with the application/wasm MIME type",
  wasmType,
);

const wasmBytes = new Uint8Array(await wasmRes.arrayBuffer());
const magic = [...wasmBytes.subarray(0, 4)]
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("");
check(magic === "0061736d", "wasm has the \\0asm magic header", magic);
check(wasmBytes.length > 100_000, "wasm payload is present", `${wasmBytes.length} bytes`);

// Instantiate with stubbed Emscripten imports. This compiles the module and
// runs its constructors, proving the served binary is valid wasm whose
// imports the loader can satisfy. Export names are the minified letters the
// JS glue (`vendor/box3d/box3d.js`) looks up.
try {
  const mod = await WebAssembly.compile(wasmBytes);
  const instance = await WebAssembly.instantiate(mod, {
    a: {
      a: () => 0, // _emscripten_get_now
      b: () => 0, // _fd_write
      c: () => 0, // _emscripten_resize_heap
      d: () => 0, // _clock_time_get
    },
  });
  const ex = instance.exports;
  check(ex.e instanceof WebAssembly.Memory, "wasm exports linear memory");
  const needed = { f: "init", g: "g3_init", h: "malloc", k: "g3_step", q: "g3_body_count", r: "g3_read", w: "g3_wake" };
  const missing = Object.entries(needed)
    .filter(([name]) => typeof ex[name] !== "function")
    .map(([, label]) => label);
  check(
    missing.length === 0,
    "wasm exports the Box3D wrapper API",
    missing.length ? `missing ${missing.join(", ")}` : "memory + 15 functions",
  );
  ex.f(); // __wasm_call_ctors
  ok("wasm constructors run");
} catch (err) {
  fail("wasm instantiates", err instanceof Error ? err.message : String(err));
}

// --- licensing + 404 --------------------------------------------------------
const license = await get("/vendor/box3d/LICENSE");
check(
  license.status === 200 && (await license.text()).includes("MIT License"),
  "Box3D MIT license is served",
);
const repoLicense = await get("/LICENSE");
check(
  repoLicense.status === 200 && (await repoLicense.text()).includes("MIT License"),
  "repository MIT license is served",
);
const missing = await get("/this-file-does-not-exist");
await missing.arrayBuffer();
check(missing.status === 404, "unknown paths return 404", `status ${missing.status}`);

// --- summary ----------------------------------------------------------------
console.log("");
if (failures) {
  console.error(`smoke: ${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`smoke: all ${checks} checks passed`);

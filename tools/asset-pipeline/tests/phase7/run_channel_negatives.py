"""Run Phase 7A negative controls against the channel verifier.

Each case deliberately corrupts one source reference or hash in a copy of the
v4 build record. The verifier must fail; a pass is a test failure.
"""

import argparse
import copy
import hashlib
import json
import subprocess
import sys
from pathlib import Path

parse = argparse.ArgumentParser()
parse.add_argument("--build", required=True)
parse.add_argument("--glb", required=True)
parse.add_argument("--blender", required=True)
parse.add_argument("--verifier", required=True)
parse.add_argument("--out-dir", required=True)
args = parse.parse_args()

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
base = json.loads(Path(args.build).read_text(encoding="utf-8"))


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def make_case(name, mutate, expected):
    build = copy.deepcopy(base)
    mutate(build)
    build_path = out_dir / (name + "-build.json")
    output_path = out_dir / (name + "-channels.json")
    build_path.write_text(json.dumps(build, indent=2))
    result = subprocess.run(
        [args.blender, "--background", "--factory-startup",
         "--python-exit-code", "1", "--python", args.verifier, "--",
         "--glb", args.glb, "--build", str(build_path),
         "--out", str(output_path)],
        capture_output=True, text=True,
    )
    report = None
    if output_path.exists():
        report = json.loads(output_path.read_text(encoding="utf-8"))
    findings = report.get("findings", []) if report else []
    passed = (result.returncode != 0 and any(expected in finding for finding in findings))
    return {
        "case": name,
        "expected_finding": expected,
        "returncode": result.returncode,
        "findings": findings,
        "status": "pass" if passed else "fail",
        "stdout": result.stdout.strip()[-1200:],
        "stderr": result.stderr.strip()[-1200:],
    }


cases = []


def wrong_basecolor(build):
    source = build["textures"]["silver_normal"]
    build["textures"]["silver_basecolor"]["path"] = source["path"]
    build["textures"]["silver_basecolor"]["sha256"] = sha256_file(source["path"])


def wrong_metallic(build):
    source = build["textures"]["silver_roughness"]
    build["textures"]["silver_metallic"]["path"] = source["path"]
    build["textures"]["silver_metallic"]["sha256"] = sha256_file(source["path"])


def wrong_normal(build):
    source = build["textures"]["silver_basecolor"]
    build["textures"]["silver_normal"]["path"] = source["path"]
    build["textures"]["silver_normal"]["sha256"] = sha256_file(source["path"])


def wrong_hash(build):
    build["textures"]["silver_basecolor"]["sha256"] = "0" * 64


cases.append(make_case("wrong-basecolor", wrong_basecolor, "baseColor MAE"))
cases.append(make_case("wrong-metallic", wrong_metallic, "metallic MAE"))
cases.append(make_case("wrong-normal", wrong_normal, "normal MAE"))
cases.append(make_case("wrong-hash", wrong_hash, "source hash does not match"))

report = {
    "cases": cases,
    "status": "pass" if all(case["status"] == "pass" for case in cases) else "fail",
}
summary = out_dir / "negative-controls.json"
summary.write_text(json.dumps(report, indent=2))
print("PHASE7_NEGATIVE_CONTROLS_" + report["status"].upper(),
      json.dumps({case["case"]: case["status"] for case in cases}, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)

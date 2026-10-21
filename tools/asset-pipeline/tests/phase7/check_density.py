"""Check planar density fixtures against known projected screen density."""

import argparse
import json
import math
from pathlib import Path

parse = argparse.ArgumentParser()
parse.add_argument("--uv1", required=True)
parse.add_argument("--uvhalf", required=True)
parse.add_argument("--out", required=True)
args = parse.parse_args()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def measure(report):
    obj = report["objects"]["Plane"]
    uv = obj["uv_density"]
    coverage = obj["texel_density"]["coverage"]
    projected_px_per_m = math.sqrt(
        coverage["sampled_screen_area_px"] / coverage["sampled_world_area_m2"])
    ratio = obj["texel_density"]["resolutions"][0]["overall"]["ratio"]["median"]
    return {
        "uv_density_px_per_m": uv["density_px_per_m"],
        "projected_px_per_m": projected_px_per_m,
        "ratio_median": ratio,
        "sample_count": coverage["sampled_triangles"],
        "sampled_world_area_m2": coverage["sampled_world_area_m2"],
    }


uv1 = measure(load(args.uv1))
uvhalf = measure(load(args.uvhalf))
vertical_fov = 2.0 * math.atan(10.125 / 50.0)
expected_projected = 1080.0 / (2.0 * 3.0 * math.tan(vertical_fov / 2.0))
findings = []
if abs(uv1["uv_density_px_per_m"] - 512.0) > 0.01:
    findings.append("uv1 density is not 512 px/m")
if abs(uvhalf["uv_density_px_per_m"] - 256.0) > 0.01:
    findings.append("uvhalf density is not 256 px/m")
if abs(uv1["projected_px_per_m"] - expected_projected) > 0.1:
    findings.append("uv1 projected density differs from analytical value")
if abs(uvhalf["projected_px_per_m"] - expected_projected) > 0.1:
    findings.append("uvhalf projected density differs from analytical value")
if abs(uv1["ratio_median"] - 512.0 / expected_projected) > 1e-4:
    findings.append("uv1 ratio does not equal texture/projected density")
if abs(uvhalf["ratio_median"] - 256.0 / expected_projected) > 1e-4:
    findings.append("uvhalf ratio does not equal texture/projected density")
if uv1["sample_count"] < 4 or uvhalf["sample_count"] < 4:
    findings.append("density zone sample count is below 4")
report = {
    "expected_projected_px_per_m": expected_projected,
    "uv1": uv1,
    "uvhalf": uvhalf,
    "findings": findings,
    "status": "pass" if not findings else "fail",
    "note": "The audit's advisory 'under' warning is expected at 3 m and is not a measurement failure.",
}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print("PHASE7_DENSITY_" + report["status"].upper(), json.dumps(report, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)

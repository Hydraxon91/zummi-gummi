import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / "tools" / "asset-pipeline" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import density_policy as dp  # noqa: E402


def policy():
    return {
        "method": "camera_projected_advisory",
        "camera": None,
        "viewport_px": [1920, 1080],
        "texture_resolutions_px": [[1024, 1024], [2048, 2048]],
        "target_texels_per_screen_pixel": [1.0, 2.0],
        "spread_ratio_max": 2.0,
        "anisotropy_ratio_max": 1.5,
        "zone_mode": "material",
        "small_triangle_screen_px": 4.0,
        "min_zone_samples": 4,
        "min_visible_fraction": 0.1,
        "advisory": True,
        "notes": ["test"],
    }


def samples(ratio=1.25, measured=500.0, anisotropy=1.0, count=4):
    return [
        {
            "ratio": ratio,
            "measured_px_per_m": measured,
            "anisotropy_ratio": anisotropy,
        }
        for _ in range(count)
    ]


class DensityPolicyTests(unittest.TestCase):
    def test_policy_validation(self):
        self.assertTrue(dp.validate_policy(policy()))
        broken = copy.deepcopy(policy())
        broken["target_texels_per_screen_pixel"] = [2.0, 1.0]
        with self.assertRaises(dp.PolicyError):
            dp.validate_policy(broken)

    def test_summary_percentiles(self):
        summary = dp.summarize([1, 2, 3, 4, 5])
        self.assertEqual(summary["count"], 5)
        self.assertAlmostEqual(summary["p05"], 1.2)
        self.assertAlmostEqual(summary["median"], 3.0)
        self.assertAlmostEqual(summary["p95"], 4.8)

    def test_group_within_range_passes(self):
        result = dp.evaluate_group(samples(), policy())
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["findings"], [])

    def test_group_below_range_is_review(self):
        result = dp.evaluate_group(samples(ratio=0.5), policy())
        self.assertEqual(result["status"], "review")
        self.assertIn("texel_density_under", result["findings"])

    def test_group_above_range_is_review(self):
        result = dp.evaluate_group(samples(ratio=3.0), policy())
        self.assertEqual(result["status"], "review")
        self.assertIn("texel_density_over", result["findings"])

    def test_density_spread_is_review(self):
        values = samples(measured=100.0)
        values[-1]["measured_px_per_m"] = 400.0
        result = dp.evaluate_group(values, policy())
        self.assertEqual(result["status"], "review")
        self.assertIn("texel_density_inconsistent", result["findings"])

    def test_anisotropy_is_review(self):
        result = dp.evaluate_group(
            samples(anisotropy=2.0), policy())
        self.assertEqual(result["status"], "review")
        self.assertIn("texel_density_anisotropic", result["findings"])

    def test_small_group_is_unverified(self):
        result = dp.evaluate_group(samples(count=2), policy())
        self.assertEqual(result["status"], "unverified")
        self.assertIn("minimum is 4", result["reason"])

    def test_aggregate_and_exit_modes(self):
        self.assertEqual(dp.aggregate_status(["pass", "unverified"]), "partial")
        self.assertEqual(dp.aggregate_status(["pass", "review"]), "review")
        self.assertEqual(dp.exit_code({"errors": 1, "warnings": 0}, "none"), 0)
        self.assertEqual(dp.exit_code({"errors": 1, "warnings": 0}, "error"), 1)
        self.assertEqual(dp.exit_code({"errors": 0, "warnings": 1}, "error"), 0)
        self.assertEqual(dp.exit_code({"errors": 0, "warnings": 1}, "warning"), 1)


class Phase1bDocumentTests(unittest.TestCase):
    def test_profiles_require_density_policy(self):
        import json
        paths = sorted((ROOT / "tools" / "asset-pipeline" / "profiles").glob("*.json"))
        for path in paths:
            data = json.loads(path.read_text())
            self.assertEqual(data["schema_version"], "1.1.0")
            self.assertTrue(dp.validate_policy(data["texel_density"]))
            self.assertTrue(data["texel_density"]["advisory"])


if __name__ == "__main__":
    unittest.main()

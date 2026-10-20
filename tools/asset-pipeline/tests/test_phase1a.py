import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / "tools" / "asset-pipeline" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import validate_documents as vd  # noqa: E402


class Phase1aDocumentTests(unittest.TestCase):
    def setUp(self):
        self.profile_paths = sorted(
            (ROOT / "tools" / "asset-pipeline" / "profiles").glob("*.json"))
        self.provenance_path = (
            ROOT / "tools" / "asset-pipeline" / "examples" / "provenance.example.json")

    def test_profiles_are_versioned_and_complete(self):
        self.assertGreaterEqual(len(self.profile_paths), 3)
        ids = set()
        for path in self.profile_paths:
            data = json.loads(path.read_text())
            self.assertTrue(vd.validate_profile(data), path)
            self.assertNotIn(data["profile_id"], ids)
            ids.add(data["profile_id"])
        self.assertEqual(
            {"opaque_prop", "transparent_buddy", "mixed_architecture"}, ids)
        mixed = json.loads((ROOT / "tools" / "asset-pipeline" / "profiles" /
                            "mixed_architecture.json").read_text())
        self.assertIn("KHR_materials_emissive_strength",
                      mixed["web_delivery"]["required_extensions"])
        self.assertIn("Spiral staircase", mixed["deferred"])

    def test_provenance_example_is_valid(self):
        data = json.loads(self.provenance_path.read_text())
        self.assertTrue(vd.validate_provenance(data))
        self.assertIsNone(data["generation"])
        self.assertEqual(data["status"], "audit_only")

    def test_missing_profile_field_fails(self):
        data = json.loads(self.profile_paths[0].read_text())
        broken = copy.deepcopy(data)
        broken.pop("materials")
        with self.assertRaises(vd.DocumentError):
            vd.validate_profile(broken)

    def test_missing_provenance_field_fails(self):
        data = json.loads(self.provenance_path.read_text())
        broken = copy.deepcopy(data)
        broken.pop("source")
        with self.assertRaises(vd.DocumentError):
            vd.validate_provenance(broken)


if __name__ == "__main__":
    unittest.main()

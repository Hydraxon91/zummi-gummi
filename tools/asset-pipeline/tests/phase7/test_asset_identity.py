"""Pure identity helper tests; run with python3."""
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[2] / "scripts/asset_identity.py"
spec = importlib.util.spec_from_file_location("asset_identity", path)
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)


class Fake:
    def __init__(self, name):
        self.name = name
        self.props = {}

    def get(self, key, default=None):
        return self.props.get(key, default)

    def __setitem__(self, key, value):
        self.props[key] = value


class IdentityTests(unittest.TestCase):
    def test_assignment_and_uniqueness(self):
        a, b = Fake("A"), Fake("B")
        aid = identity.assign_asset_id(a, "asset-a")
        bid = identity.assign_asset_id(b, "asset-b")
        self.assertEqual((aid, bid), ("asset-a", "asset-b"))
        errors = []
        mapping = identity.object_ids([a, b], errors)
        self.assertEqual(mapping, {"A": "asset-a", "B": "asset-b"})
        self.assertEqual(errors, [])
        b["asset_id"] = "asset-a"
        identity.object_ids([a, b], errors)
        self.assertTrue(any("duplicate asset_id" in e for e in errors))

    def test_resolution(self):
        a, b = Fake("A"), Fake("B")
        identity.assign_asset_id(a, "asset-a")
        identity.assign_asset_id(b, "asset-b")
        errors = []
        self.assertEqual(identity.resolve_ids(["asset-b"], [a, b], errors), [b])
        self.assertEqual(errors, [])
        self.assertEqual(identity.resolve_ids(["missing"], [a, b], errors), [])
        self.assertTrue(any("missing" in e for e in errors))
        b["asset_id"] = "asset-a"
        errors = []
        identity.resolve_ids(["asset-a"], [a, b], errors)
        self.assertTrue(any("ambiguous" in e for e in errors))


if __name__ == "__main__":
    unittest.main()

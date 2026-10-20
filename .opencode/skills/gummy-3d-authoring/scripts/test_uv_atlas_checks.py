import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('checks', Path(__file__).with_name('uv_atlas_checks.py'))
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class AtlasTests(unittest.TestCase):
    def test_touching_is_not_overlap(self):
        self.assertEqual(checks.intersection_area([(0, 0), (1, 0), (0, 1)], [(1, 0), (1, 1), (0, 1)]), 0)

    def test_overlap_and_winding(self):
        a = [(0, 0), (1, 0), (0, 1)]
        self.assertAlmostEqual(checks.intersection_area(a, a[::-1]), 0.5)

    def test_cross_object_and_self_overlap(self):
        tri = (0, 0, 9, 0, 0, 9)
        result = checks.validate([{'id': 1, 'triangles': [tri, tri]}, {'id': 2, 'triangles': [tri]}], 10)
        self.assertEqual(result['overlaps'], [(1, 1), (1, 2)])

    def test_outside_and_degenerate(self):
        result = checks.validate([{'id': 1, 'triangles': [(0, 0, 10, 0, 0, 9), (1, 1, 1, 1, 1, 1)]}], 10)
        self.assertEqual(result['out_of_bounds'], [1])
        self.assertEqual(result['degenerate_triangles'], 1)


if __name__ == '__main__':
    unittest.main()

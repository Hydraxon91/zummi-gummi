"""Pure tests for the triangle overlap gate. No Blender required."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import uv_atlas_checks as checks


def square(x0, y0, x1, y1):
    return [
        (x0, y0, x1, y0, x1, y1),
        (x0, y0, x1, y1, x0, y1),
    ]


class AtlasChecksTest(unittest.TestCase):
    def test_separated_islands_pass(self):
        records = [{'id': 1, 'triangles': square(10, 10, 20, 20)},
                   {'id': 2, 'triangles': square(30, 30, 40, 40)}]
        result = checks.validate(records, 100)
        self.assertEqual(result['overlaps'], [])
        self.assertEqual(result['out_of_bounds'], [])
        self.assertEqual(result['degenerate_triangles'], 0)

    def test_overlapping_islands_are_reported(self):
        records = [{'id': 1, 'triangles': square(10, 10, 30, 30)},
                   {'id': 2, 'triangles': square(20, 20, 40, 40)}]
        result = checks.validate(records, 100)
        self.assertEqual(result['overlaps'], [(1, 2)])

    def test_adjacent_faces_do_not_overlap(self):
        records = [{'id': 1, 'triangles': [(10, 10, 20, 10, 10, 20)]},
                   {'id': 1, 'triangles': [(20, 10, 20, 20, 10, 20)]}]
        result = checks.validate(records, 100)
        self.assertEqual(result['overlaps'], [])

    def test_out_of_bounds_is_reported(self):
        records = [{'id': 7, 'triangles': square(90, 90, 120, 120)}]
        result = checks.validate(records, 100)
        self.assertEqual(result['out_of_bounds'], [7])

    def test_degenerate_triangle_is_counted(self):
        records = [{'id': 3, 'triangles': [(10, 10, 20, 10, 30, 10)]}]
        result = checks.validate(records, 100)
        self.assertEqual(result['degenerate_triangles'], 1)


if __name__ == '__main__':
    unittest.main()

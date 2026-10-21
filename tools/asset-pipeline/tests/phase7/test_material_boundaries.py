"""Run with python3; no Blender or third-party dependencies."""
import importlib.util
import math
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[2] / 'scripts/check_material_boundaries.py'
spec = importlib.util.spec_from_file_location('boundaries', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def ring():
    vertices = [(r * math.cos(i * math.tau / 16),
                 r * math.sin(i * math.tau / 16), 0)
                for r in (1, 2, 3) for i in range(16)]
    faces = [[r*16+i, r*16+(i+1)%16, (r+1)*16+(i+1)%16, (r+1)*16+i]
             for r in range(2) for i in range(16)]
    return dict(vertices=vertices, faces=faces, materials=[0]*16+[1]*16)


class Checks(unittest.TestCase):
    def test_clean_ring(self):
        report = module.analyze(ring())
        self.assertEqual(len(report['regions']), 2)
        self.assertEqual(len(report['boundaries'][0]['edges']), 16)
        self.assertEqual(report['boundaries'][0]['endpoints'], [])
        self.assertEqual(report['boundaries'][0]['branches'], [])

    def test_isolated_and_tooth(self):
        data = ring()
        data['materials'][3] = 2
        report = module.analyze(data)
        self.assertTrue(report['single_face_regions'])
        data = ring()
        data['materials'][3] = 1  # attached tooth: not necessarily topologically invalid
        report = module.analyze(data)
        self.assertGreater(len(report['boundaries'][0]['edges']), 16)
        self.assertIn('toothed', report['limitation'])

    def test_intentional_regions_and_scope(self):
        old = ring()
        data = ring()
        data['materials'][3] = 2  # could be an intentional accent
        self.assertEqual(module.analyze(data, old, [3])['comparison']['outside_scope_changes'], [])
        self.assertEqual(module.analyze(data, old)['comparison']['outside_scope_changes'], [3])
        data['vertices'][0] = (5, 5, 5)
        self.assertTrue(module.analyze(data, old)['comparison']['geometry_changed'])


if __name__ == '__main__':
    unittest.main()

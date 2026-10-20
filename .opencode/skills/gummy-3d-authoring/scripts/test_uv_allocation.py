"""Pure fixtures for model-independent allocation diagnostics."""
import unittest

from uv_allocation import triangle_metrics, validate_treatments


class AllocationTests(unittest.TestCase):
    def test_units_and_scale(self):
        p = [(0, 0), (1, 0), (0, 1)]
        a, b = triangle_metrics(p, 100), triangle_metrics(p, 200)
        self.assertEqual(a['area_px'], 5000)
        self.assertAlmostEqual(a['minimum_altitude_px'], 100 / 2**.5)
        self.assertEqual(b['area_px'], 4*a['area_px'])
        self.assertEqual(b['minimum_altitude_px'], 2*a['minimum_altitude_px'])

    def test_thin_not_zero(self):
        d = triangle_metrics([(0, 0), (1, 0), (1, .00001)], 4096)
        self.assertFalse(d['zero_area'])
        self.assertGreater(d['area_px'], 1)
        self.assertLess(d['minimum_altitude_px'], 1)

    def test_degenerate_bounds_nonfinite(self):
        self.assertTrue(triangle_metrics([(0, 0)]*3, 10)['zero_area'])
        self.assertTrue(triangle_metrics([(-.1, 0), (1, 0), (0, 1)], 10)['out_of_bounds'])
        with self.assertRaises(ValueError):
            triangle_metrics([(float('nan'), 0)]*3, 10)

    def test_explicit_accounting(self):
        objects = {'Part': {'fingerprint': 'abc', 'materials': ['Metal']}}
        policy = {'schema': 1, 'objects': {'Part': {'fingerprint': 'abc', 'treatment': 'pending'}}}
        self.assertFalse(validate_treatments(policy, objects)['ready_for_trial'])
        rule = policy['objects']['Part']
        rule.update(treatment='additional_sheet', sheet='details')
        self.assertEqual(validate_treatments(policy, objects)['sheets'], {'details': ['Part']})
        rule.update(treatment='preserve_existing_material', materials=['Metal'])
        self.assertEqual(validate_treatments(policy, objects)['material_only'], ['Part'])
        rule['materials'] = ['Wrong']
        with self.assertRaises(ValueError):
            validate_treatments(policy, objects)
        with self.assertRaises(ValueError):
            validate_treatments({'schema': 1, 'objects': {}}, objects)


if __name__ == '__main__':
    unittest.main()

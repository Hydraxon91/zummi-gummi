import unittest

from transfer_sampling import barycentric, pixel_correspondence


class PixelTests(unittest.TestCase):
    def test_expected_at_pixel_not_requested_uv(self):
        tri = [(0, 0), (1, 0), (0, 1)]
        pixel, expected = pixel_correspondence(tri, tri, (.6, .2, .2), 4)
        self.assertEqual(pixel, (0, 0))
        self.assertEqual(expected, (.125, .125))

    def test_sliver_centroid_rounds_outside(self):
        tri = [(.1, .10001), (.9, .10001), (.1, .10002)]
        self.assertIsNone(pixel_correspondence(tri, tri, (.6, .2, .2), 256))

    def test_degenerate_and_bounds(self):
        self.assertIsNone(barycentric((0, 0), [(0, 0)] * 3))
        self.assertIsNone(pixel_correspondence([(0, 0)] * 3, [(2, 2)] * 3, (1, 0, 0), 4))

    def test_rotated_layout(self):
        source = [(0, 0), (1, 0), (0, 1)]
        target = [(0, 1), (0, 0), (1, 1)]
        pixel, expected = pixel_correspondence(source, target, (.6, .2, .2), 4)
        centre = tuple((p + .5) / 4 for p in pixel)
        self.assertAlmostEqual(expected[0], 1 - centre[1])
        self.assertAlmostEqual(expected[1], centre[0])


if __name__ == '__main__':
    unittest.main()

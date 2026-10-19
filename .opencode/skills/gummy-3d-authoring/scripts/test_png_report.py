"""Pure Python fixtures; no Blender, filesystem writes or dependencies."""
import importlib.util
from pathlib import Path
import struct
import unittest
import zlib

spec = importlib.util.spec_from_file_location('png_report', Path(__file__).with_name('png_report.py'))
png = importlib.util.module_from_spec(spec)
spec.loader.exec_module(png)


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def fixture(color=2, pixels=b'\x12\x34\x56', method=0):
    header = struct.pack('>IIBBBBB', 1, 1, 8, color, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) +
            chunk(b'IDAT', zlib.compress(bytes([method]) + pixels)) + chunk(b'IEND', b''))


class PNGTests(unittest.TestCase):
    def test_supported_modes(self):
        for color, count in ((0, 1), (2, 3), (4, 2), (6, 4)):
            pixels = bytes(range(count))
            self.assertEqual(png.decode(fixture(color, pixels)), (1, 1, count, [pixels]))

    def test_filters(self):
        for method in range(5):
            self.assertEqual(png.decode(fixture(method=method))[3], [b'\x12\x34\x56'])

    def test_rgb_header_grayscale_payload_regression(self):
        with self.assertRaises(ValueError):
            png.decode(fixture(pixels=b'\0'))

    def test_asymmetric_two_row_filters(self):
        rows = [bytes((4, 30, 91, 200, 7, 12)), bytes((5, 70, 21, 9, 111, 240))]
        for method in range(5):
            encoded = bytearray()
            for y, row in enumerate(rows):
                encoded.append(method)
                for x, value in enumerate(row):
                    a = row[x - 3] if x >= 3 else 0
                    b = rows[y - 1][x] if y else 0
                    c = rows[y - 1][x - 3] if y and x >= 3 else 0
                    p = a + b - c
                    distance = [abs(p - a), abs(p - b), abs(p - c)]
                    predictors = (0, a, b, (a + b) // 2, (a, b, c)[distance.index(min(distance))])
                    encoded.append((value - predictors[method]) & 255)
            data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0)) +
                    chunk(b'IDAT', zlib.compress(encoded)) + chunk(b'IEND', b''))
            self.assertEqual(png.decode(data), (2, 2, 3, rows))

    def test_corruption(self):
        for data in (b'', fixture()[:-1], fixture() + b'x', fixture().replace(b'IDAT', b'IdAT'),
                     fixture(method=5), fixture(pixels=b'123456')):
            with self.assertRaises((ValueError, zlib.error)):
                png.decode(data)


if __name__ == '__main__':
    unittest.main()

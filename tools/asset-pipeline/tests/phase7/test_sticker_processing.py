"""Run with background Blender; synthetic colour/alpha positive and negative controls."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

import bpy
import numpy as np

path = Path(__file__).resolve().parents[2] / 'scripts/process_sticker_sheet.py'
spec = importlib.util.spec_from_file_location('sticker_processing', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Processing(unittest.TestCase):
    def fixture(self):
        rgb = np.full((16, 16, 3), .75, dtype=np.float32)
        rgb[3:13, 3:13] = .98
        rgb[4:12, 4:12] = [.3, .6, .2]
        rgb[7:9, 7:9] = .75  # enclosed background-like shading must not become a hole
        return rgb

    def test_holes_and_background(self):
        result = module.extract(self.fixture())
        self.assertEqual(result[:, :, 3].sum(), 100)
        self.assertTrue((result[7:9, 7:9, 3] == 1).all())
        self.assertTrue((result[:3, :, 3] == 0).all())
        np.testing.assert_array_equal(result[:, :, :3], self.fixture())

    def test_bad_crop_fails(self):
        with self.assertRaises(ValueError):
            module.extract(np.ones((8, 8, 3)))

    def test_grading_preserves_white_and_alpha(self):
        original = module.extract(self.fixture())
        graded = module.extract(self.fixture(), saturation=1.5, contrast=1.15)
        np.testing.assert_array_equal(original[:, :, 3], graded[:, :, 3])
        np.testing.assert_array_equal(original[3, 3, :3], graded[3, 3, :3])
        self.assertGreater(float(np.ptp(graded[4, 4, :3])),
                           float(np.ptp(original[4, 4, :3])))

    def test_saved_colour_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            source = bpy.data.images.new('ColourFixture', width=16, height=16, alpha=True)
            source.colorspace_settings.name = 'Non-Color'
            pixels = np.ones((16, 16, 4), dtype=np.float32)
            pixels[:, :, :3] = self.fixture()
            source.pixels = pixels[::-1].reshape(-1).tolist()
            source.file_format = 'PNG'
            raw = Path(directory)/'raw.png'
            out = Path(directory)/'out.png'
            source.filepath_raw = str(raw)
            source.save()
            bpy.data.images.remove(source)
            module.process(raw, out, [(0, 0, 16, 16)])
            image = bpy.data.images.load(str(out), check_existing=False)
            image.colorspace_settings.name = 'Non-Color'
            actual = np.array(image.pixels[:]).reshape(16, 16, 4)[::-1]
            np.testing.assert_allclose(actual[:, :, :3], self.fixture(), atol=1/255)
            self.assertEqual(actual[:, :, 3].sum(), 100)
            bpy.data.images.remove(image)


unittest.main(argv=['sticker-tests'])

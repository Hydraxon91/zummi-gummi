"""Blender integration check for reference_sheet.py.

Run with:
  Blender --background --factory-startup --python-exit-code 1 \
    --python tools/asset-pipeline/tests/phase7/test_reference_sheet_blender.py
"""
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

import bpy
import numpy as np

path = Path(__file__).resolve().parents[2] / "scripts/reference_sheet.py"
spec = importlib.util.spec_from_file_location("reference_sheet", path)
reference_sheet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference_sheet)


def make_sheet(path):
    image = bpy.data.images.new("test_sheet", width=64, height=40, alpha=True)
    pixels = np.zeros((40, 64, 4), dtype=np.float32)
    pixels[:, :, 3] = 1.0
    # Blender arrays are bottom-up. Mark the exact top-left/bottom-left pixels
    # of the front crop for an orientation check.
    pixels[40 - 1 - 4, 4] = [1.0, 0.0, 0.0, 1.0]   # crop top-left: red
    pixels[40 - 1 - 19, 4] = [0.0, 0.0, 1.0, 1.0]  # crop bottom-left: blue
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def base_view(name, projection, rect, origin):
    return {
        "name": name,
        "projection": projection,
        "rect": rect,
        "origin_px": origin,
    }


class ReferenceSheetBlenderTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="reference-sheet-test-"))
        self.sheet = self.root / "sheet.png"
        make_sheet(self.sheet)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def write_views(self, views, name="views.json"):
        path = self.root / name
        path.write_text(json.dumps({
            "schema": reference_sheet.VIEWS_SCHEMA,
            "views": views,
        }))
        return path

    def standard_views(self):
        calibration = {
            "p1": [4, 19], "p2": [24, 19],
            "distance_mm": 200.0, "label": "test width",
            "scale_authority": True,
        }
        return [
            base_view("front", "front", [4, 4, 20, 16], [14, 20]),
            base_view("side", "side", [28, 4, 20, 16], [30, 20]),
            base_view("look", "visual", [4, 24, 20, 10], [14, 30]),
        ], calibration

    def test_inspect_crop_build_and_verify(self):
        views, calibration = self.standard_views()
        views[0]["calibration"] = calibration
        views_path = self.write_views(views)
        out = self.root / "out"
        blend = out / "reference.blend"
        summary = reference_sheet.run(
            self.sheet, views_path, out, prefix="ref", build=blend, new_scene=True)

        self.assertEqual(summary["scale_mm_per_px"], 10.0)
        self.assertEqual(summary["authority"], "front")
        self.assertTrue(blend.exists())
        self.assertTrue((out / "ref_references.json").exists())
        self.assertTrue((out / "ref_front.png").exists())
        self.assertTrue((out / "ref_side.png").exists())
        self.assertTrue((out / "ref_look.png").exists())
        self.assertNotIn("REF_look", bpy.data.objects)

        manifest = json.loads((out / "ref_references.json").read_text())
        self.assertEqual(manifest["schema"], reference_sheet.SCHEMA)
        self.assertEqual(len(manifest["views"]), 3)
        front = manifest["views"][0]
        self.assertAlmostEqual(front["width_mm"], 200.0)
        self.assertAlmostEqual(front["height_mm"], 160.0)
        side = manifest["views"][1]
        self.assertAlmostEqual(side["width_mm"], 200.0)
        self.assertNotIn("calibration", side)

        crop = bpy.data.images.load(str(out / "ref_front.png"))
        try:
            self.assertEqual(tuple(crop.size), (20, 16))
            pixels = np.empty(20 * 16 * 4, dtype=np.float32)
            crop.pixels.foreach_get(pixels)
            pixels = pixels.reshape(16, 20, 4)
            self.assertEqual(tuple(pixels[15, 0]), (1.0, 0.0, 0.0, 1.0))
            self.assertEqual(tuple(pixels[0, 0]), (0.0, 0.0, 1.0, 1.0))
        finally:
            bpy.data.images.remove(crop)

        collection = bpy.data.collections["Reference"]
        self.assertTrue(collection.hide_render)
        self.assertEqual(len(collection.objects), 2)
        self.assertEqual(reference_sheet.verify_scene(views), [])
        front_obj = bpy.data.objects["REF_front"]
        self.assertTrue(all(front_obj.lock_location))
        self.assertTrue(all(front_obj.lock_rotation))
        self.assertTrue(all(front_obj.lock_scale))
        self.assertTrue(front_obj.hide_render)
        self.assertTrue(front_obj.show_in_front)
        self.assertAlmostEqual(front_obj["reference_width_mm"], 200.0)
        self.assertEqual(len(front_obj.data.vertices), 4)
        self.assertEqual(len(front_obj.data.polygons), 1)
        loop_uvs = [tuple(loop.uv) for loop in front_obj.data.uv_layers[0].data]
        self.assertEqual(loop_uvs, [(0.0, 1.0), (0.0, 0.0),
                                    (1.0, 0.0), (1.0, 1.0)])
        texture = next(node for node in front_obj.data.materials[0].node_tree.nodes
                       if node.type == "TEX_IMAGE")
        self.assertIsNotNone(texture.image.packed_file)

    def test_conflicting_view_scales_fail_before_outputs(self):
        views, _ = self.standard_views()
        views[0]["calibration"] = {
            "p1": [4, 19], "p2": [24, 19], "distance_mm": 200.0,
            "scale_authority": True,
        }
        views[1]["calibration"] = {
            "p1": [28, 19], "p2": [48, 19], "distance_mm": 220.0,
        }
        views_path = self.write_views(views)
        with self.assertRaises(reference_sheet.ReferenceSheetError):
            reference_sheet.run(self.sheet, views_path, self.root / "conflict")
        self.assertFalse((self.root / "conflict").exists())

    def test_build_requires_new_scene(self):
        views, calibration = self.standard_views()
        views[0]["calibration"] = calibration
        views_path = self.write_views(views)
        with self.assertRaises(reference_sheet.ReferenceSheetError):
            reference_sheet.run(
                self.sheet, views_path, self.root / "no-new",
                build=self.root / "no-new" / "reference.blend", new_scene=False)

    def test_out_of_bounds_rect_fails(self):
        views, calibration = self.standard_views()
        views[0]["rect"] = [50, 4, 20, 16]
        views[0]["calibration"] = calibration
        errors, _ = reference_sheet.validate_views(views, 64, 40)
        self.assertTrue(any("exceeds sheet bounds" in error for error in errors))


if __name__ == "__main__":
    # Blender's own command line must not be parsed by unittest.
    unittest.main(argv=[sys.argv[0]])

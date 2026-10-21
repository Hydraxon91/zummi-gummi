"""Pure reference-sheet geometry/validation tests; run with python3."""
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[2] / "scripts/reference_sheet.py"
spec = importlib.util.spec_from_file_location("reference_sheet", path)
reference_sheet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference_sheet)


def make_view(name="front", projection="front", rect=(0, 0, 100, 100),
              origin=(50, 100), calibration=None, **extra):
    view = {
        "name": name,
        "projection": projection,
        "rect": list(rect),
        "origin_px": list(origin),
        "origin_world_mm": [0.0, 0.0, 0.0],
        "plane_offset_mm": 0.0,
        "flip_u": False,
        "flip_v": False,
    }
    if calibration is not None:
        view["calibration"] = calibration
    view.update(extra)
    return view


class GeometryTests(unittest.TestCase):
    def test_front_plane_maps_u_to_x_and_v_to_up(self):
        geometry = reference_sheet.plane_geometry(make_view(), 10.0)
        self.assertEqual(geometry["width_mm"], 1000.0)
        self.assertEqual(geometry["height_mm"], 1000.0)
        self.assertEqual(geometry["corners_mm"][0], [-500.0, 0.0, 1000.0])
        self.assertEqual(geometry["corners_mm"][1], [500.0, 0.0, 1000.0])
        self.assertEqual(geometry["corners_mm"][2], [500.0, 0.0, 0.0])
        self.assertEqual(geometry["axes"], ["+X", "-Z"])
        self.assertEqual(geometry["normal"], [0.0, -1.0, 0.0])

    def test_side_plane_front_is_left_and_origin_is_shared(self):
        view = make_view("side", "side", (0, 0, 200, 100), (10, 100))
        geometry = reference_sheet.plane_geometry(view, 10.0)
        self.assertEqual(geometry["corners_mm"][0], [0.0, 100.0, 1000.0])
        self.assertEqual(geometry["corners_mm"][1], [0.0, -1900.0, 1000.0])
        self.assertEqual(geometry["corners_mm"][3], [0.0, 100.0, 0.0])
        self.assertEqual(geometry["axes"], ["-Y", "-Z"])

    def test_top_plane_uses_front_left_image_orientation(self):
        view = make_view("top", "top", (0, 0, 200, 100), (10, 50))
        geometry = reference_sheet.plane_geometry(view, 10.0)
        self.assertEqual(geometry["corners_mm"][0], [500.0, 100.0, 0.0])
        self.assertEqual(geometry["corners_mm"][1], [500.0, -1900.0, 0.0])
        self.assertEqual(geometry["corners_mm"][2], [-500.0, -1900.0, 0.0])
        self.assertEqual(geometry["axes"], ["-Y", "-X"])
        self.assertEqual(geometry["normal"], [0.0, 0.0, 1.0])

    def test_origin_world_and_plane_offset(self):
        view = make_view(origin=(50, 100), plane_offset_mm=25.0,
                         origin_world_mm=[1000.0, 2000.0, 3000.0])
        geometry = reference_sheet.plane_geometry(view, 10.0)
        self.assertEqual(geometry["location_mm"], [1000.0, 1975.0, 3000.0])
        self.assertEqual(geometry["corners_mm"][0], [-500.0, 0.0, 1000.0])

    def test_flip_mirrors_around_origin_without_changing_facing(self):
        view = make_view(flip_u=True)
        geometry = reference_sheet.plane_geometry(view, 10.0)
        self.assertEqual(geometry["corners_mm"][0], [500.0, 0.0, 1000.0])
        self.assertEqual(geometry["axes"], ["-X", "-Z"])
        self.assertEqual(geometry["normal"], [0.0, -1.0, 0.0])

    def test_visual_view_has_no_plane(self):
        with self.assertRaises(reference_sheet.ReferenceSheetError):
            reference_sheet.plane_geometry(make_view("look", "visual"), 10.0)


class ValidationTests(unittest.TestCase):
    def calibration(self, p1=(0, 100), p2=(100, 100), distance=1000,
                    authority=False):
        return {"p1": list(p1), "p2": list(p2), "distance_mm": distance,
                "scale_authority": authority}

    def test_rect_bounds(self):
        self.assertEqual(reference_sheet.validate_rect([0, 0, 100, 100], 100, 100),
                         [0, 0, 100, 100])
        with self.assertRaises(reference_sheet.ReferenceSheetError):
            reference_sheet.validate_rect([1, 0, 100, 100], 100, 100)
        with self.assertRaises(reference_sheet.ReferenceSheetError):
            reference_sheet.validate_rect([0, 0, 0, 100], 100, 100)
        with self.assertRaises(reference_sheet.ReferenceSheetError):
            reference_sheet.validate_rect([0.5, 0, 100, 100], 200, 200)

    def test_scale_authority_and_inheritance(self):
        views = [
            make_view("front", "front", calibration=self.calibration(authority=True)),
            make_view("side", "side", (100, 0, 100, 100), (150, 100)),
        ]
        errors, warnings = reference_sheet.validate_views(views, 200, 200)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])
        self.assertEqual(views[1]["mm_per_px"], 10.0)
        self.assertEqual(views[1]["scale_source"], "front")

    def test_conflicting_calibrations_are_rejected(self):
        views = [
            make_view("front", "front", calibration=self.calibration(authority=True)),
            make_view("side", "side", (0, 0, 100, 100), (50, 100),
                      calibration=self.calibration(distance=1100)),
        ]
        errors, _ = reference_sheet.validate_views(views, 200, 200)
        self.assertTrue(any("disagree" in error for error in errors))

    def test_multiple_calibrations_need_one_authority(self):
        views = [
            make_view("front", "front", calibration=self.calibration()),
            make_view("side", "side", (0, 0, 100, 100), (50, 100),
                      calibration=self.calibration()),
        ]
        errors, _ = reference_sheet.validate_views(views, 200, 200)
        self.assertTrue(any("exactly one" in error for error in errors))

    def test_missing_origin_is_rejected_for_a_plane(self):
        view = make_view()
        view.pop("origin_px")
        errors, _ = reference_sheet.validate_views([view], 200, 200)
        self.assertTrue(any("origin_px" in error for error in errors))

    def test_calibration_landmarks_need_distance(self):
        view = make_view(calibration=self.calibration(p1=(10, 10), p2=(10, 10)))
        errors, _ = reference_sheet.validate_views([view], 200, 200)
        self.assertTrue(any("less than one pixel" in error for error in errors))

    def test_visual_only_view_needs_no_calibration(self):
        view = make_view("look", "visual", (0, 0, 100, 100), (50, 100))
        view.pop("origin_px")
        errors, warnings = reference_sheet.validate_views([view], 200, 200)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_overlap_is_a_warning_not_an_error(self):
        views = [
            make_view("a", "front", (0, 0, 100, 100), (50, 100),
                      calibration=self.calibration(authority=True)),
            make_view("b", "side", (50, 0, 100, 100), (100, 100)),
        ]
        errors, warnings = reference_sheet.validate_views(views, 200, 200)
        self.assertEqual(errors, [])
        self.assertTrue(any("overlap" in warning for warning in warnings))

    def test_views_schema_and_names(self):
        document = {
            "schema": reference_sheet.VIEWS_SCHEMA,
            "views": [make_view("Front")],
        }
        with self.assertRaises(reference_sheet.ReferenceSheetError):
            reference_sheet.load_views(document)
        document["views"] = [make_view("front"), make_view("front")]
        with self.assertRaises(reference_sheet.ReferenceSheetError):
            reference_sheet.load_views(document)


if __name__ == "__main__":
    unittest.main()

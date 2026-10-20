"""Pure Python regression checks; import only the audited colour function via AST."""
import ast
from pathlib import Path
import unittest
from types import SimpleNamespace as NS

path = Path(__file__).with_name('uv_island_export.py')
tree = ast.parse(path.read_text())
node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'id_colour')
scope = {'BACKGROUND': (128, 128, 128)}
exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), 'exec'), scope)
colour = scope['id_colour']
node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'island_material')
exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), 'exec'), scope)
node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'triangle_health')
exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), 'exec'), scope)


class ColourTests(unittest.TestCase):
    def test_collapsed_uv_is_not_source_degeneracy(self):
        good = (0, 0, 10, 0, 0, 10)
        collapsed = (0, 0, 5, 0, 10, 0)
        self.assertEqual(scope['triangle_health']([collapsed], [1.0], 1280), (1, 0, 0, 0))
        self.assertEqual(scope['triangle_health']([collapsed], [0.0], 1280), (0, 1, 0, 0))
        self.assertEqual(scope['triangle_health']([collapsed], [1e-10], 1280), (0, 0, 1, 0))
        self.assertEqual(scope['triangle_health']([collapsed], [1.0], 1280, [0.0]), (0, 0, 0, 1))
        self.assertEqual(scope['triangle_health']([good], [1.0], 1280), (0, 0, 0, 0))
    def test_actual_face_slot(self):
        ob = NS(name='Fixture', data=NS(polygons=[NS(material_index=1), NS(material_index=0)]),
                material_slots=[NS(material=NS(name='Paint')), NS(material=NS(name='Rubber'))])
        self.assertEqual(scope['island_material'](ob, [0]), (1, 'Rubber'))
        with self.assertRaises(ValueError):
            scope['island_material'](ob, [0, 1])

    def test_current_asset_ids_unique(self):
        colours = [colour(i) for i in range(1, 5594)]
        self.assertEqual(len(set(colours)), 5593)
        self.assertNotIn(scope['BACKGROUND'], colours)

    def test_reserved_background_swap(self):
        index = (0x808080 * pow(0x9e3779, -1, 1 << 24)) % (1 << 24)
        self.assertEqual(colour(index), (0, 0, 0))
        self.assertNotEqual(colour(index - 1), colour(index))

    def test_bounds_and_repeatability(self):
        self.assertEqual(colour(0xffffff), colour(0xffffff))
        for i in (0, -1, 1 << 24, 1.5):
            with self.assertRaises(ValueError):
                colour(i)


if __name__ == '__main__':
    unittest.main()

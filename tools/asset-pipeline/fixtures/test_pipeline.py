"""Pure contract and deliberately failing GLB-binding fixtures; no Blender required."""
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.common import PipelineError
from pipeline.export import audit_glb, export_glb, read_glb_json
from pipeline.job import validate


class Contract(unittest.TestCase):
    def test_review_job(self):
        validate({'objects': ['Root'], 'out_dir': '.dev-shots/review',
                  'resolution': 2048, 'export': False}, 'bake')

    def test_bad_dimensions(self):
        for value in (True, -1, [900], '2048'):
            with self.assertRaises(PipelineError):
                validate({'objects': ['Root'], 'out_dir': 'x', 'resolution': value}, 'render')

    def test_export_requires_gate(self):
        with self.assertRaises(PipelineError):
            export_glb([], '/unused-test-output.glb')
        with self.assertRaises(PipelineError):
            validate({'objects': ['Root'], 'out_dir': 'x', 'export': 'x.glb'}, 'bake')

    def test_unknown_profile(self):
        with self.assertRaises(PipelineError):
            validate({'objects': ['Root'], 'out_dir': 'x', 'profile': 'guessed'}, 'check')

    def test_tangents_flag(self):
        validate({'objects': ['Root'], 'out_dir': 'x', 'tangents': True}, 'export')
        validate({'objects': ['Root'], 'out_dir': 'x', 'tangents': False}, 'export')
        with self.assertRaises(PipelineError):
            validate({'objects': ['Root'], 'out_dir': 'x', 'tangents': 'yes'}, 'export')

    def test_tile_material_shapes(self):
        base = {'objects': ['Root'], 'out_dir': 'x',
                'groups': [{'objects': '*', 'resolution': 256}]}
        validate(dict(base, tile_materials=['A']), 'hybrid')
        validate(dict(base, tile_materials={'A': {'base': 'corrected.png'}, 'B': None}), 'hybrid')
        with self.assertRaises(PipelineError):
            validate(dict(base, tile_materials={'A': 'corrected.png'}), 'hybrid')
        with self.assertRaises(PipelineError):
            validate(dict(base, tile_materials={'A': {'base': ''}}), 'hybrid')
        with self.assertRaises(PipelineError):
            validate(dict(base, tile_materials='A'), 'hybrid')


class ExportArguments(unittest.TestCase):
    """Authored tangents are opt-in because degenerate UVs produce zero-length ones."""

    def export_argv(self, tangents):
        captured = {}

        def fake_run(path, run_name=None):
            captured['argv'] = list(sys.argv)
            Path(sys.argv[sys.argv.index('--glb') + 1]).write_bytes(b'glTF')

        gate = {key: 'gate.json' for key in
                ('approval', 'construction_brief', 'candidate_ledger', 'evidence_report')}
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'out.glb'
            with mock.patch('runpy.run_path', side_effect=fake_run):
                export_glb([], target, gate=gate, tangents=tangents)
        return captured['argv']

    def test_default_omits_tangents(self):
        argv = self.export_argv(False)
        self.assertNotIn('--tangents', argv)
        self.assertIn('--approval', argv)

    def test_opt_in_adds_tangents(self):
        self.assertIn('--tangents', self.export_argv(True))


class GLBBindings(unittest.TestCase):
    def check_document(self, coordinate, attributes):
        document = {'asset': {'version': '2.0'}, 'materials': [
            {'name': 'Test', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0, 'texCoord': coordinate}}}],
            'images': [{'name': 'Image'}], 'textures': [{'source': 0}],
            'meshes': [{'primitives': [{'material': 0, 'attributes': attributes}]}]}
        encoded = json.dumps(document).encode()
        encoded += b' ' * (-len(encoded) % 4)
        data = b'glTF' + struct.pack('<II', 2, 20 + len(encoded))
        data += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'fixture.glb'
            path.write_bytes(data)
            return audit_glb(path)

    def test_good_binding(self):
        self.assertTrue(self.check_document(0, {'TEXCOORD_0': 0})['ok'])

    def test_negative_binding(self):
        self.assertFalse(self.check_document(-1, {'TEXCOORD_0': 0})['ok'])

    def test_wrong_uv_set(self):
        self.assertFalse(self.check_document(1, {'TEXCOORD_0': 0})['ok'])

    def test_truncated_header(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'bad.glb'
            path.write_bytes(b'glTF')
            with self.assertRaises(PipelineError):
                read_glb_json(path)


if __name__ == '__main__':
    unittest.main()

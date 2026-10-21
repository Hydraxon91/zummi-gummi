"""Pure tests for the reusable StableMaterials ComfyUI runner."""
import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

path = Path(__file__).resolve().parents[2] / "scripts/run_comfy_workflow_stable_materials.py"
spec = importlib.util.spec_from_file_location("stable_materials_runner", path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def template():
    graph = {
        "1": {"class_type": "LoadStableMaterials",
              "inputs": {"mode": "Standard (50 steps, quality)"}},
        "2": {"class_type": "StableMaterialsGenerate",
              "inputs": {"pipeline": ["1", 0], "prompt": "old", "negative_prompt": "old",
                         "seed": 1, "steps": 50, "guidance_scale": 7.5,
                         "tileable": True, "width": 1024, "height": 1024}},
    }
    titles = ["Save Base Color 1024", "Save Normal", "Save Height",
              "Save Roughness", "Save Metallic"]
    for index, title in enumerate(titles):
        graph[str(index + 3)] = {
            "class_type": "SaveImage",
            "inputs": {"images": ["2", index], "filename_prefix": "old"},
            "_meta": {"title": title},
        }
    return graph


def args(**extra):
    values = dict(job="", out_dir="", base_url=None, template=None, mode=None,
                  steps=None, cfg=None, size=None, seeds=None, material=None,
                  timeout=1, dry_run=True, continue_on_error=False)
    values.update(extra)
    return argparse.Namespace(**values)


class RunnerTests(unittest.TestCase):
    def test_infer_output_nodes(self):
        mapping = runner.infer_output_nodes(template())
        self.assertEqual(mapping, {
            "basecolor": "3", "normal": "4", "height": "5",
            "roughness": "6", "metallic": "7",
        })
        graph = template()
        del graph["7"]
        self.assertNotIn("metallic", runner.infer_output_nodes(graph))

    def test_build_graph_overrides_generation(self):
        settings = {"mode": "LCM (4 steps, fast)", "steps": 4, "cfg": 7.0,
                    "size": 512, "prompt_suffix": "Tiled.", "filename_prefix": "test"}
        material = {"id": "ivory", "prompt": "ivory plastic", "negative": "noise"}
        graph, tag = runner.build_graph(template(), runner.infer_output_nodes(template()),
                                        material, 42, settings)
        self.assertEqual(tag, "test_ivory_seed42")
        self.assertEqual(graph["1"]["inputs"]["mode"], "LCM (4 steps, fast)")
        gen = graph["2"]["inputs"]
        self.assertEqual(gen["prompt"], "ivory plastic Tiled.")
        self.assertEqual(gen["seed"], 42)
        self.assertEqual(gen["steps"], 4)
        self.assertEqual(gen["width"], 512)
        self.assertTrue(gen["tileable"])
        self.assertEqual(graph["3"]["inputs"]["filename_prefix"], "test_ivory_seed42_basecolor")

    def test_mode_override_uses_its_default_steps(self):
        job = {"mode": "Standard (50 steps, quality)", "steps": 50, "cfg": 7.5,
               "size": 1024}
        settings = runner.resolve_settings(
            job, args(mode="LCM (4 steps, fast)"))
        self.assertEqual(settings["steps"], 4)
        self.assertEqual(settings["mode"], "LCM (4 steps, fast)")

    def test_load_job_and_seed_inheritance(self):
        with tempfile.TemporaryDirectory() as root:
            job_path = Path(root) / "job.json"
            job_path.write_text(json.dumps({
                "template": "template.json",
                "seeds": [7],
                "materials": [
                    {"id": "a", "prompt": "a"},
                    {"id": "b", "prompt": "b", "seed": 9},
                ],
            }))
            job = runner.load_job(job_path)
            self.assertEqual(job["seeds"], [7])
            self.assertEqual(job["material_list"][1]["seed"], 9)

    def test_load_job_rejects_duplicates_and_bad_ids(self):
        with tempfile.TemporaryDirectory() as root:
            job_path = Path(root) / "job.json"
            job_path.write_text(json.dumps({
                "template": "template.json",
                "materials": [{"id": "a", "prompt": "a"}, {"id": "a", "prompt": "b"}],
            }))
            with self.assertRaises(runner.RunnerError):
                runner.load_job(job_path)
            job_path.write_text(json.dumps({
                "template": "template.json",
                "materials": [{"id": "A", "prompt": "a"}],
            }))
            with self.assertRaises(runner.RunnerError):
                runner.load_job(job_path)

    def test_dry_run_writes_graph_and_manifest(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            (root / "template.json").write_text(json.dumps(template()))
            job_path = root / "job.json"
            job_path.write_text(json.dumps({
                "template": "template.json",
                "seeds": [7],
                "materials": [{"id": "ivory", "prompt": "ivory plastic"}],
            }))
            out = root / "out"
            result, manifest = runner.run(args(job=str(job_path), out_dir=str(out)))
            self.assertEqual(result, out.resolve())
            self.assertEqual(manifest["status"], "dry_run")
            self.assertEqual(len(manifest["materials"]), 1)
            prompt_path = out / "api" / "stablematerials_ivory_seed7_prompt.json"
            self.assertTrue(prompt_path.exists())
            prompt = json.loads(prompt_path.read_text())
            self.assertEqual(prompt["2"]["inputs"]["seed"], 7)
            self.assertEqual(list((out / "raw").iterdir()), [])

    def test_rejects_second_manifest(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            (root / "template.json").write_text(json.dumps(template()))
            job_path = root / "job.json"
            job_path.write_text(json.dumps({
                "template": "template.json",
                "materials": [{"id": "ivory", "prompt": "ivory plastic"}],
            }))
            out = root / "out"
            runner.run(args(job=str(job_path), out_dir=str(out)))
            with self.assertRaises(runner.RunnerError):
                runner.run(args(job=str(job_path), out_dir=str(out)))


if __name__ == "__main__":
    unittest.main()

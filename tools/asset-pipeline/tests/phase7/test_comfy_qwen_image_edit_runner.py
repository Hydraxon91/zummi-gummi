"""Pure tests for the reusable Qwen Image 2.1 image-edit ComfyUI runner."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

path = Path(__file__).resolve().parents[2] / "scripts/run_comfy_workflow_qwen_image_edit.py"
spec = importlib.util.spec_from_file_location("qwen_image_edit_runner", path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def template(loaders=1, save_class="SaveImageAdvanced"):
    graph = {
        "u": {"class_type": "UNETLoader", "inputs": {"unet_name": "model.safetensors"}},
        "c": {"class_type": "CLIPLoader", "inputs": {"clip_name": "clip.safetensors"}},
        "v": {"class_type": "VAELoader", "inputs": {"vae_name": "vae.safetensors"}},
        "cache": {"class_type": "QwenImage21Cache", "inputs": {"model": ["u", 0]}},
        "edit": {"class_type": "TextEncodeQwenImage21",
                 "inputs": {"clip": ["c", 0], "vae": ["v", 0], "prompt": "old",
                            "negative_prompt": "old", "resolution": 0,
                            "images.image_1": ["load0", 0]}},
        "sampler": {"class_type": "KSampler",
                    "inputs": {"model": ["cache", 0], "positive": ["edit", 0],
                               "negative": ["edit", 1], "latent_image": ["edit", 2],
                               "seed": 1, "steps": 20, "cfg": 1.0,
                               "sampler_name": "euler", "scheduler": "simple",
                               "denoise": 1.0}},
        "decode": {"class_type": "VAEDecode",
                   "inputs": {"samples": ["sampler", 0], "vae": ["v", 0]}},
        "save": {"class_type": save_class,
                 "inputs": {"images": ["decode", 0], "filename_prefix": "old"}},
    }
    for index in range(loaders):
        graph[f"load{index}"] = {"class_type": "LoadImage",
                                 "inputs": {"image": f"old_{index}.png"}}
    return graph


def job_document(tmp, images, **extra):
    document = {
        "template": "template.json",
        "steps": 25,
        "cfg": 1.0,
        "resolution": 1024,
        "seeds": [7],
        "samples": [{"id": "sticker", "prompt": "paint", "images": images}],
    }
    document.update(extra)
    (Path(tmp) / "template.json").write_text(json.dumps(template()), encoding="utf-8")
    job_path = Path(tmp) / "job.json"
    job_path.write_text(json.dumps(document), encoding="utf-8")
    return job_path


class IntegerParsing(unittest.TestCase):
    def test_accepts_numeric_strings(self):
        self.assertEqual(runner._integer("42", "seed"), 42)
        self.assertEqual(runner._integer("-3", "seed"), -3)

    def test_rejects_non_numeric(self):
        with self.assertRaises(runner.RunnerError):
            runner._integer("abc", "seed")
        with self.assertRaises(runner.RunnerError):
            runner._integer(True, "seed")


class JobValidation(unittest.TestCase):
    def test_parses_images_and_string_seeds(self):
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "canvas.png"
            image.write_bytes(b"not-a-real-png")
            job = runner.load_job(job_document(tmp, [str(image)], seeds=["9", 10]))
            self.assertEqual(job["seeds"], [9, 10])
            self.assertEqual(job["resolution"], 1024)
            self.assertTrue(Path(job["samples"][0]["images"][0]["path"]).samefile(image))

    def test_rejects_bad_sample_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "canvas.png"
            image.write_bytes(b"x")
            document = {
                "template": "template.json",
                "samples": [{"id": "Bad Id", "prompt": "p", "images": [str(image)]}],
            }
            (Path(tmp) / "template.json").write_text(json.dumps(template()), encoding="utf-8")
            path = Path(tmp) / "job.json"
            path.write_text(json.dumps(document), encoding="utf-8")
            with self.assertRaises(runner.RunnerError):
                runner.load_job(path)

    def test_rejects_missing_image(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(runner.RunnerError):
                runner.load_job(job_document(tmp, [str(Path(tmp) / "absent.png")]))


class GraphPatching(unittest.TestCase):
    def sample(self, count):
        return {"prompt": "paint a sticker", "negative": "text",
                "images": [{"uploaded": f"up_{i}.png", "label": f"image_{i}"}
                           for i in range(1, count + 1)]}

    def test_attaches_images_and_clones_loader(self):
        graph = template(loaders=1)
        inputs, loaders = runner.attach_images(graph, self.sample(3)["images"])
        self.assertEqual(len(loaders), 3)
        self.assertEqual(inputs["images.image_1"], [loaders[0], 0])
        self.assertEqual(inputs["images.image_3"], [loaders[2], 0])
        self.assertEqual(graph[loaders[2]]["inputs"]["image"], "up_3.png")
        self.assertEqual(graph[loaders[2]]["class_type"], "LoadImage")

    def test_clears_stale_image_slots(self):
        graph = template(loaders=4)
        graph["edit"]["inputs"]["images.image_9"] = ["load3", 0]
        inputs, _ = runner.attach_images(graph, self.sample(2)["images"])
        self.assertNotIn("images.image_9", inputs)
        self.assertEqual(sorted(key for key in inputs if key.startswith("images.")),
                         ["images.image_1", "images.image_2"])

    def test_patches_settings(self):
        graph, _ = runner.patch_graph(template(), self.sample(2), 123,
                                     {"steps": 25, "cfg": 1.0, "resolution": 1024,
                                      "filename_prefix": "sticker_run"})
        self.assertEqual(graph["sampler"]["inputs"]["seed"], 123)
        self.assertEqual(graph["sampler"]["inputs"]["steps"], 25)
        self.assertEqual(graph["sampler"]["inputs"]["cfg"], 1.0)
        self.assertEqual(graph["edit"]["inputs"]["resolution"], 1024)
        self.assertEqual(graph["edit"]["inputs"]["prompt"], "paint a sticker")
        self.assertEqual(graph["save"]["inputs"]["filename_prefix"], "sticker_run")

    def test_requires_single_edit_node(self):
        graph = template()
        graph["edit2"] = dict(graph["edit"])
        with self.assertRaises(runner.RunnerError):
            runner.patch_graph(graph, self.sample(1), 1,
                               {"steps": 25, "cfg": 1.0, "resolution": 1024,
                                "filename_prefix": "x"})


class OutputCollection(unittest.TestCase):
    def test_scans_every_output_node(self):
        entry = {"outputs": {
            "12": {"images": [{"filename": "a.png", "subfolder": "", "type": "output"}]},
            "30": {"images": [{"filename": "b.png"}]},
            "40": {"text": ["ignored"]},
        }}
        found = runner.collect_images(entry)
        self.assertEqual([node for node, _ in found], ["12", "30"])
        self.assertEqual([image["filename"] for _, image in found], ["a.png", "b.png"])

    def test_ignores_entries_without_images(self):
        self.assertEqual(runner.collect_images({}), [])
        self.assertEqual(runner.collect_images({"outputs": {"1": {}}}), [])


if __name__ == "__main__":
    unittest.main()

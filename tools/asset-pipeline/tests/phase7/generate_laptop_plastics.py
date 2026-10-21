"""Deprecated laptop-material compatibility wrapper.

Use the reusable runner instead:

    python3 tools/asset-pipeline/scripts/run_comfy_workflow_stable_materials.py \
      --job tools/asset-pipeline/examples/laptop-plastics-aged.job.json ...

This wrapper remains only so old local commands that pass ``--out-dir`` continue to
reach the shared runner. It does not contain its own prompts or HTTP code.
"""
import sys
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PIPELINE / "scripts"))

from run_comfy_workflow_stable_materials import main  # noqa: E402


if __name__ == "__main__":
    arguments = sys.argv[1:]
    if "--job" not in arguments:
        arguments = [
            "--job",
            str(PIPELINE / "examples/laptop-plastics-aged.job.json"),
            *arguments,
        ]
    main(arguments)

"""Pure-Python checks for the construction brief/ledger gate."""

import importlib.util
import json
import shutil
import tempfile
from pathlib import Path

SCRIPT = (Path(__file__).resolve().parents[3] / "asset-pipeline" / "scripts"
          / "construction_gate.py")
spec = importlib.util.spec_from_file_location("construction_gate_test", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

root = Path(tempfile.mkdtemp(prefix="construction-gate-test-"))
try:
    brief = {
        "target": "test case",
        "target_ids": ["asset-a"],
        "method": "lofted sections",
        "alternative": "stacked primitives",
        "controls": ["ring table"],
        "risks": ["cap shrinkage"],
        "representative_test": "front rim closed",
        "detail_split": {
            "geometry": ["rim and hinge"],
            "material": ["colour only"],
            "basis": "close review view",
        },
        "decision": "proceed",
    }
    ledger = {"target_ids": ["asset-a"], "entries": [{
        "attempt": 1,
        "criterion": "closed rim",
        "hypothesis": "shared seam plan closes",
        "changed_control": "lid seam ring",
        "outcome": "thin seam",
    }]}
    closed_manifest = root / "closed.json"
    open_manifest = root / "open.json"
    closed_manifest.write_text("{}")
    open_manifest.write_text("{}")
    evidence = {
        "status": "pass",
        "manifests": [
            {"path": str(closed_manifest),
             "manifest_sha256": module.sha256_file(closed_manifest)},
            {"path": str(open_manifest),
             "manifest_sha256": module.sha256_file(open_manifest)},
        ],
        "scope": "not visual approval",
    }
    brief_path = root / "brief.json"
    ledger_path = root / "ledger.json"
    evidence_path = root / "evidence.json"
    source_blend = root / "source.blend"
    source_blend.write_text("source")
    evidence["blend"] = str(source_blend)
    evidence["source_sha256"] = module.sha256_file(source_blend)
    for path, data in ((brief_path, brief), (ledger_path, ledger),
                       (evidence_path, evidence)):
        path.write_text(json.dumps(data))

    report = module.run(brief_path, ledger_path, evidence_path, source_blend)
    assert report["status"] == "pass", report

    wrong_source = root / "wrong.blend"
    wrong_source.write_text("wrong")
    report = module.run(brief_path, ledger_path, evidence_path, wrong_source)
    assert report["status"] == "fail"
    assert any("source blend" in error for error in report["errors"])

    source_blend.write_text("changed")
    report = module.run(brief_path, ledger_path, evidence_path, source_blend)
    assert report["status"] == "fail"
    assert any("source hash is stale" in error for error in report["errors"])
    source_blend.write_text("source")

    evidence_path.write_text(json.dumps(dict(evidence, status="fail")))
    report = module.run(brief_path, ledger_path, evidence_path, source_blend)
    assert report["status"] == "fail"
    assert any("evidence report status" in error for error in report["errors"])

    evidence_path.write_text(json.dumps(evidence))
    brief_path.write_text(json.dumps(brief))

    missing = dict(brief)
    missing.pop("method")
    brief_path.write_text(json.dumps(missing))
    report = module.run(brief_path, ledger_path, evidence_path)
    assert report["status"] == "fail"
    assert any("method" in error for error in report["errors"])

    brief_path.write_text(json.dumps(brief))
    duplicate = {"entries": ledger["entries"] * 2}
    ledger_path.write_text(json.dumps(duplicate))
    report = module.run(brief_path, ledger_path, evidence_path)
    assert report["status"] == "fail"
    assert any("repeats attempt" in error for error in report["errors"])

    too_many = {"entries": [
        {**ledger["entries"][0], "attempt": index + 1} for index in range(8)]}
    ledger_path.write_text(json.dumps(too_many))
    report = module.run(brief_path, ledger_path, evidence_path)
    assert report["status"] == "fail"
    assert any("seven-attempt" in error for error in report["errors"])

    ledger_path.write_text(json.dumps(ledger))
    failed_evidence = dict(evidence, status="fail")
    evidence_path.write_text(json.dumps(failed_evidence))
    report = module.run(brief_path, ledger_path, evidence_path)
    assert report["status"] == "fail"
    assert any("evidence report status" in error for error in report["errors"])

    evidence_path.write_text(json.dumps(evidence))
    report = module.run(brief_path, ledger_path, evidence_path,
                        expected_ids=["asset-a"])
    assert report["status"] == "pass", report
    report = module.run(brief_path, ledger_path, evidence_path,
                        expected_ids=["asset-b"])
    assert report["status"] == "fail"
    assert any("target_ids" in error for error in report["errors"])
    without_ids = dict(brief)
    without_ids.pop("target_ids")
    brief_path.write_text(json.dumps(without_ids))
    report = module.run(brief_path, ledger_path, evidence_path,
                        expected_ids=["asset-a"])
    assert report["status"] == "fail"
    assert any("target_ids is required" in error for error in report["errors"])
finally:
    shutil.rmtree(root, ignore_errors=True)

print("TEST_CONSTRUCTION_GATE pass")

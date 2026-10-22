"""Validate a construction brief, candidate ledger and optional evidence report.

Documentation gate only: completeness does not establish method suitability, likeness,
contact or user acceptance.
"""

import argparse
import hashlib
import json
from pathlib import Path

BRIEF_FIELDS = ("target", "method", "alternative", "representative_test")
BRIEF_LISTS = ("controls", "risks")
DECISIONS = ("proceed", "revise", "stop", "pending")


def load_json(path, errors, label):
    if not path:
        errors.append(f"{label} path is missing")
        return None
    file_path = Path(path)
    if not file_path.is_file():
        errors.append(f"{label} not found: {path}")
        return None
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"{label} is not valid JSON: {exc}")
        return None


def validate_target_ids(data, label, errors, expected_ids=None):
    ids = data.get("target_ids") if isinstance(data, dict) else None
    if ids is not None:
        if (not isinstance(ids, list) or not ids
                or not all(isinstance(value, str) and value.strip() for value in ids)):
            errors.append(f"{label}.target_ids must be a non-empty string list")
        elif len(ids) != len(set(ids)):
            errors.append(f"{label}.target_ids contains duplicates")
        elif expected_ids is not None and set(ids) != set(expected_ids):
            errors.append(f"{label}.target_ids does not match the current targets")
    elif expected_ids is not None:
        errors.append(f"{label}.target_ids is required")


def validate_brief(data, errors, expected_ids=None):
    if not isinstance(data, dict):
        errors.append("construction brief must be an object")
        return
    validate_target_ids(data, "construction brief", errors, expected_ids)
    for field in BRIEF_FIELDS:
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"construction brief field is missing or empty: {field}")
    for field in BRIEF_LISTS:
        value = data.get(field)
        if (not isinstance(value, list) or not value
                or not all(isinstance(item, str) and item.strip() for item in value)):
            errors.append(f"construction brief field must be a non-empty string list: {field}")
    detail = data.get("detail_split")
    if not isinstance(detail, dict):
        errors.append("construction brief must include a detail_split object")
    else:
        for field in ("geometry", "material"):
            value = detail.get(field)
            if (not isinstance(value, list) or not value
                    or not all(isinstance(item, str) and item.strip() for item in value)):
                errors.append(
                    f"detail_split.{field} must be a non-empty string list")
        if not isinstance(detail.get("basis"), str) or not detail["basis"].strip():
            errors.append("detail_split.basis must state the intended viewing distance")
    if data.get("decision") not in DECISIONS:
        errors.append(f"construction brief decision must be one of {DECISIONS}")


def validate_ledger(data, errors, expected_ids=None):
    if not isinstance(data, dict):
        errors.append("candidate ledger must be an object")
        return
    validate_target_ids(data, "candidate ledger", errors, expected_ids)
    entries = data.get("entries")
    if not isinstance(entries, list) or not entries:
        errors.append("candidate ledger must contain a non-empty entries list")
        return
    seen = set()
    failures = {}
    continuation_attempts = {}
    for index, entry in enumerate(entries):
        label = f"candidate ledger entry {index + 1}"
        if not isinstance(entry, dict):
            errors.append(f"{label} must be an object")
            continue
        attempt = entry.get("attempt")
        criterion_key = entry.get("criterion")
        criterion_key = criterion_key if isinstance(criterion_key, str) else None
        if type(attempt) is not int or attempt < 1:
            errors.append(f"{label} attempt must be a positive integer")
        elif (criterion_key, attempt) in seen:
            errors.append(f"{label} repeats attempt {attempt}")
        else:
            seen.add((criterion_key, attempt))
        for field in ("criterion", "hypothesis", "changed_control", "outcome"):
            value = entry.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{label} field is missing or empty: {field}")
        kind, result = entry.get("kind"), entry.get("result")
        if kind not in ("construction", "repair") or result not in ("success", "failure"):
            errors.append(f"{label} requires explicit kind (construction/repair) and result (success/failure); legacy prose cannot establish budget compliance")
        elif kind == "repair":
            criterion = entry.get("criterion")
            if isinstance(criterion, str):
                if failures.get(criterion, 0) >= 7:
                    continuation_attempts[criterion] = continuation_attempts.get(criterion, 0) + 1
                if result == "failure":
                    failures[criterion] = failures.get(criterion, 0) + 1
    continuations = data.get("continuations", [])
    if not isinstance(continuations, list):
        errors.append("continuations must be a list")
        continuations = []
    allowances = {}
    for continuation in continuations:
        if (not isinstance(continuation, dict)
                or not all(isinstance(continuation.get(k), str) and continuation[k].strip()
                           for k in ("criterion", "approval", "hypothesis", "scope", "checks"))
                or type(continuation.get("additional_attempts")) is not int
                or continuation["additional_attempts"] < 1):
            errors.append("continuation requires criterion, approval reference, hypothesis, scope, checks and positive additional_attempts")
            continue
        criterion = continuation["criterion"]
        allowances[criterion] = allowances.get(criterion, 0) + continuation["additional_attempts"]
    for criterion, count in continuation_attempts.items():
        if count > allowances.get(criterion, 0):
            errors.append(f"{criterion}: exceeds the seven-attempt failed-repair budget plus approved continuations")


def validate_evidence(data, errors, source_blend=None):
    if not isinstance(data, dict):
        errors.append("evidence report must be an object")
        return
    if data.get("status") != "pass":
        errors.append("evidence report status is not pass")
    manifests = data.get("manifests")
    if not isinstance(manifests, list) or not manifests:
        errors.append("evidence report has no manifests")
        return
    for index, manifest in enumerate(manifests):
        label = f"evidence manifest {index + 1}"
        if not isinstance(manifest, dict):
            errors.append(f"{label} must be an object")
            continue
        path = manifest.get("path")
        if not path or not Path(path).is_file():
            errors.append(f"{label} is missing on disk: {path}")
            continue
        digest = manifest.get("manifest_sha256")
        if not digest:
            errors.append(f"{label} has no manifest_sha256")
        elif digest != sha256_file(path):
            errors.append(f"{label} hash is stale: {path}")
    if source_blend:
        recorded = data.get("blend")
        if not recorded:
            errors.append("evidence report has no source blend")
        elif Path(recorded).resolve() != Path(source_blend).resolve():
            errors.append("evidence report source blend does not match the current source")
        else:
            recorded_hash = data.get("source_sha256")
            if not recorded_hash:
                errors.append("evidence report has no source_sha256")
            elif recorded_hash != sha256_file(source_blend):
                errors.append("evidence source hash is stale")
    if not isinstance(data.get("scope"), str) or "not" not in data["scope"]:
        errors.append("evidence report must state its limited scope")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(brief_path, ledger_path, evidence_path=None, source_blend=None,
        expected_ids=None):
    errors = []
    brief = load_json(brief_path, errors, "construction brief")
    ledger = load_json(ledger_path, errors, "candidate ledger")
    evidence = load_json(evidence_path, errors, "evidence report") if evidence_path else None
    if brief is not None:
        validate_brief(brief, errors, expected_ids)
    if ledger is not None:
        validate_ledger(ledger, errors, expected_ids)
    if evidence_path and evidence is not None:
        validate_evidence(evidence, errors, source_blend)
    return {
        "tool": "construction_gate.py",
        "status": "pass" if not errors else "fail",
        "errors": errors,
        "brief": str(brief_path),
        "ledger": str(ledger_path),
        "evidence": str(evidence_path) if evidence_path else None,
        "source_blend": str(source_blend) if source_blend else None,
        "scope": "documentation and evidence completeness only; not visual or contact approval",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--brief", required=True)
    parser.add_argument("--ledger", required=True)
    parser.add_argument("--evidence", default="")
    parser.add_argument("--source-blend", default="",
                        help="Current source .blend that evidence must match")
    parser.add_argument("--out", required=True)
    parser.add_argument("--target-ids", default="")
    args = parser.parse_args()
    output = Path(args.out)
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite {output}")
    expected_ids = [value.strip() for value in args.target_ids.split(",")
                    if value.strip()] or None
    report = run(args.brief, args.ledger, args.evidence or None,
                 args.source_blend or None, expected_ids)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("CONSTRUCTION_GATE " + json.dumps({
        "out": str(output), "status": report["status"], "errors": report["errors"]}))
    if report["status"] != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()

"""Minimal dependency-free validation for asset-pipeline profiles and provenance."""

import argparse
import json
import sys
from pathlib import Path

PROFILE_REQUIRED = (
    "schema_version",
    "profile_id",
    "status",
    "description",
    "scope",
    "materials",
    "web_delivery",
    "verification",
    "limits",
    "deferred",
)
PROFILE_STATUS = {"draft", "provisional", "active", "deprecated"}
PROVENANCE_REQUIRED = (
    "schema_version",
    "asset_id",
    "source",
    "tool",
    "created_at",
    "status",
    "generation",
    "processing",
    "export",
    "verification",
)
PROVENANCE_STATUS = {"audit_only", "in_progress", "verified", "rejected"}


class DocumentError(ValueError):
    pass


def _require_keys(doc, keys, label):
    missing = [key for key in keys if key not in doc]
    if missing:
        raise DocumentError("%s missing required keys: %s" % (label, ", ".join(missing)))


def _require_type(value, expected, label):
    if not isinstance(value, expected):
        raise DocumentError("%s must be %s, got %s" % (label, expected, type(value).__name__))


def validate_profile(doc):
    _require_type(doc, dict, "profile")
    _require_keys(doc, PROFILE_REQUIRED, "profile")
    _require_type(doc["schema_version"], str, "profile.schema_version")
    _require_type(doc["profile_id"], str, "profile.profile_id")
    if doc["status"] not in PROFILE_STATUS:
        raise DocumentError("profile.status must be one of %s" % sorted(PROFILE_STATUS))
    _require_type(doc["description"], str, "profile.description")
    for key in ("scope", "materials", "web_delivery", "verification"):
        _require_type(doc[key], dict, "profile." + key)
    for key in ("limits", "deferred"):
        _require_type(doc[key], list, "profile." + key)
    _require_type(doc["materials"].get("model"), str, "profile.materials.model")
    _require_type(doc["web_delivery"].get("format"), str, "profile.web_delivery.format")
    _require_type(doc["web_delivery"].get("compression"), dict,
                  "profile.web_delivery.compression")
    _require_type(doc["web_delivery"].get("report"), list,
                  "profile.web_delivery.report")
    for key in ("structural", "visual", "performance", "evidence"):
        _require_type(doc["verification"].get(key), list,
                      "profile.verification." + key)
    return True


def validate_provenance(doc):
    _require_type(doc, dict, "provenance")
    _require_keys(doc, PROVENANCE_REQUIRED, "provenance")
    _require_type(doc["schema_version"], str, "provenance.schema_version")
    if doc["status"] not in PROVENANCE_STATUS:
        raise DocumentError("provenance.status must be one of %s" % sorted(PROVENANCE_STATUS))
    _require_type(doc["source"], dict, "provenance.source")
    _require_type(doc["tool"], dict, "provenance.tool")
    _require_type(doc["processing"], dict, "provenance.processing")
    _require_type(doc["export"], dict, "provenance.export")
    _require_type(doc["verification"], dict, "provenance.verification")
    _require_type(doc["created_at"], str, "provenance.created_at")
    _require_type(doc["tool"].get("name"), str, "provenance.tool.name")
    _require_type(doc["tool"].get("version"), str, "provenance.tool.version")
    _require_type(doc["export"].get("format"), str, "provenance.export.format")
    _require_type(doc["export"].get("validator"), dict, "provenance.export.validator")
    _require_keys(doc["source"], ("path", "sha256", "is_dirty", "units", "axes"),
                  "provenance.source")
    _require_keys(doc["export"], ("path", "sha256", "size_bytes", "format", "validator"),
                  "provenance.export")
    _require_keys(doc["verification"], ("status", "evidence", "warnings", "limitations"),
                  "provenance.verification")
    for key in ("evidence", "warnings", "limitations"):
        _require_type(doc["verification"].get(key), list,
                      "provenance.verification." + key)
    return True


def validate_file(path, kind):
    data = json.loads(Path(path).read_text())
    if kind == "profile":
        validate_profile(data)
    elif kind == "provenance":
        validate_provenance(data)
    else:
        raise DocumentError("Unknown kind: %s" % kind)
    return data


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", action="append", default=[])
    parser.add_argument("--provenance", action="append", default=[])
    args = parser.parse_args(argv)
    targets = [("profile", path) for path in args.profile]
    targets += [("provenance", path) for path in args.provenance]
    if not targets:
        root = Path(__file__).resolve().parents[1]
        targets = [("profile", str(path)) for path in sorted((root / "profiles").glob("*.json"))]
        example = root / "examples" / "provenance.example.json"
        if example.is_file():
            targets.append(("provenance", str(example)))
    failed = False
    for kind, path in targets:
        try:
            validate_file(path, kind)
            print("VALID", kind, path)
        except (DocumentError, OSError, json.JSONDecodeError) as exc:
            failed = True
            print("INVALID", kind, path, "-", exc)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

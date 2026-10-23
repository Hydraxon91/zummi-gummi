#!/usr/bin/env python3
"""Validate the G1/M18b translation-pilot fixture manifests.

This tool is deliberately dependency-free (Python standard library only). It
validates fixture data and provenance hashes; it does not port or execute any
game rule. The RNG and inheritance implementations are G2/G3 scope.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import sys
from pathlib import Path

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
FIXTURE_FILES = ("genome_inheritance.json", "wire_uid.json")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
DECISION_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
COMMIT = re.compile(r"^[0-9a-f]{7,40}$")

NUMERIC_GENES = ("size", "rigidity", "softness", "stretch")
EXPECTED_GENE_KEYS = {
    "color", "size", "rigidity", "softness", "stretch", "material", "hopPace",
}
EXPECTED_GENOME_NEGATIVES = {
    "draw-count", "changed-gene", "hybrid-target", "mutated-parent", "phenotype",
}
EXPECTED_WIRE_NEGATIVES = {
    "non-reciprocal-partner", "missing-actor", "duplicate-uid",
    "saved-live-adoption", "inactive-map-partner-prune",
}


def canonical_payload(manifest: dict) -> dict:
    return {key: value for key, value in manifest.items() if key != "manifestHash"}


def canonical_json(manifest: dict) -> str:
    return json.dumps(
        canonical_payload(manifest), sort_keys=True, separators=(",", ":")
    )


def manifest_hash(manifest: dict) -> str:
    return hashlib.sha256(canonical_json(manifest).encode("utf-8")).hexdigest()


def is_number(value) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def require(condition: bool, errors: list[str], message: str) -> None:
    if not condition:
        errors.append(message)


def check_common(manifest: dict, expected_id: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(manifest, dict):
        return ["manifest root is not a JSON object"]
    for key in ("fixtureVersion", "fixtureId", "fixtureKind", "manifestHash", "provenance", "policy", "negatives"):
        require(key in manifest, errors, f"missing top-level field {key}")
    require(manifest.get("fixtureVersion") == 1, errors, "fixtureVersion must be 1")
    require(manifest.get("fixtureId") == expected_id, errors, f"fixtureId must be {expected_id}")
    require(isinstance(manifest.get("fixtureKind"), str) and manifest["fixtureKind"], errors,
            "fixtureKind must be a non-empty string")
    declared = manifest.get("manifestHash")
    require(isinstance(declared, str) and bool(HEX64.match(declared)), errors,
            "manifestHash must be 64 lowercase hex characters")
    if isinstance(declared, str) and HEX64.match(declared):
        actual = manifest_hash(manifest)
        require(declared == actual, errors,
                f"manifestHash mismatch: declared {declared}, computed {actual}")

    provenance = manifest.get("provenance")
    if not isinstance(provenance, dict):
        errors.append("provenance must be an object")
    else:
        paths = provenance.get("repositoryPath")
        if isinstance(paths, str):
            paths_ok = bool(paths)
        else:
            paths_ok = isinstance(paths, list) and bool(paths) and all(
                isinstance(item, str) and item for item in paths
            )
        require(paths_ok, errors, "provenance.repositoryPath must be a path or non-empty path list")
        require(
            isinstance(provenance.get("sourceCases"), list)
            and bool(provenance["sourceCases"])
            and all(isinstance(item, str) and item for item in provenance["sourceCases"]),
            errors,
            "provenance.sourceCases must be a non-empty string list",
        )
        commit = provenance.get("baselineCommit")
        require(isinstance(commit, str) and bool(COMMIT.match(commit)), errors,
                "provenance.baselineCommit must be a 7-40 character lowercase commit id")
        date = provenance.get("fixtureDate")
        require(isinstance(date, str) and bool(DECISION_DATE.match(date)), errors,
                "provenance.fixtureDate must be YYYY-MM-DD")
        rule = provenance.get("canonicalHashRule")
        require(isinstance(rule, str) and "sort_keys=True" in rule and "manifestHash" in rule,
                errors, "provenance.canonicalHashRule must document the canonical hash rule")
        require(isinstance(provenance.get("dnaVersion"), int)
                or isinstance(provenance.get("actorSaveVersion"), int),
                errors, "provenance must record the relevant format version constant")

    policy = manifest.get("policy")
    if not isinstance(policy, dict):
        errors.append("policy must be an object")
    else:
        exact = policy.get("exactFields")
        require(isinstance(exact, list) and bool(exact) and all(
            isinstance(item, str) and item for item in exact
        ), errors, "policy.exactFields must be a non-empty string list")
        require(isinstance(policy.get("comparison"), str) and policy["comparison"], errors,
                "policy.comparison must be a non-empty string")

    negatives = manifest.get("negatives")
    if not isinstance(negatives, list) or not negatives:
        errors.append("negatives must be a non-empty list")
    else:
        for index, negative in enumerate(negatives):
            prefix = f"negatives[{index}]"
            if not isinstance(negative, dict):
                errors.append(f"{prefix} must be an object")
                continue
            require(isinstance(negative.get("id"), str) and negative["id"],
                    errors, f"{prefix}.id must be a non-empty string")
            require(isinstance(negative.get("category"), str) and negative["category"],
                    errors, f"{prefix}.category must be a non-empty string")
            require(negative.get("expectedToFail") is True,
                    errors, f"{prefix}.expectedToFail must be true")
    return errors


def check_genes(label: str, genes, errors: list[str]) -> None:
    if not isinstance(genes, dict):
        errors.append(f"{label} must be an object")
        return
    require(set(genes) == EXPECTED_GENE_KEYS, errors,
            f"{label} must contain exactly {sorted(EXPECTED_GENE_KEYS)}")
    require(isinstance(genes.get("color"), str) and genes.get("color"), errors,
            f"{label}.color must be a non-empty string")
    require(isinstance(genes.get("material"), str) and genes.get("material"), errors,
            f"{label}.material must be a non-empty string")
    for key in NUMERIC_GENES:
        require(is_number(genes.get(key)), errors, f"{label}.{key} must be finite numeric")
    pace = genes.get("hopPace")
    require(isinstance(pace, list) and len(pace) == 2 and all(is_number(v) for v in pace),
            errors, f"{label}.hopPace must be two finite numbers")


def check_genome_expected(label: str, expected, mixed: bool, errors: list[str]) -> None:
    if not isinstance(expected, dict):
        errors.append(f"{label} must be an object")
        return
    species = expected.get("species")
    require(isinstance(species, dict) and bool(species), errors,
            f"{label}.species must be a non-empty object")
    if isinstance(species, dict):
        require(all(isinstance(k, str) and is_number(v) and v > 0 for k, v in species.items()),
                errors, f"{label}.species values must be positive numbers")
        if mixed:
            require(set(species) == {"bear", "msn"}, errors,
                    f"{label}.species must contain bear and msn")
        else:
            require(species == {"bear": 1}, errors,
                    f"{label}.species must be exactly {{'bear': 1}}")
    check_genes(f"{label}.genes", expected.get("genes"), errors)
    if mixed:
        require(expected.get("hybridTarget") == "bear-msn", errors,
                f"{label}.hybridTarget must be bear-msn")
    else:
        require(expected.get("hybridTarget") is None, errors,
                f"{label}.hybridTarget must be null")
    require(expected.get("phenotype") == "softbody-bear", errors,
            f"{label}.phenotype must be softbody-bear")
    require(expected.get("drawCount") == 10, errors, f"{label}.drawCount must be 10")
    require(expected.get("parentsUnchanged") is True, errors,
            f"{label}.parentsUnchanged must be true")


def check_genome(manifest: dict, errors: list[str]) -> None:
    constants = manifest.get("constants")
    provenance = manifest.get("provenance")
    if not isinstance(constants, dict):
        errors.append("constants must be an object")
    else:
        require(constants.get("DNA_VERSION") == 1, errors, "constants.DNA_VERSION must be 1")
        require(constants.get("drawCount") == 10, errors, "constants.drawCount must be 10")
        require(constants.get("phenotype") == "softbody-bear", errors,
                "constants.phenotype must be softbody-bear")
    if isinstance(provenance, dict):
        require(provenance.get("dnaVersion") == 1, errors, "provenance.dnaVersion must be 1")

    parents = manifest.get("parents")
    if not isinstance(parents, dict):
        errors.append("parents must be an object")
    else:
        require(set(parents) == {"bearA", "bearB", "msnB"}, errors,
                "parents must contain bearA, bearB and msnB")
        for key, parent in parents.items():
            label = f"parents.{key}"
            if not isinstance(parent, dict):
                errors.append(f"{label} must be an object")
                continue
            require(parent.get("version") == 1, errors, f"{label}.version must be 1")
            require(isinstance(parent.get("species"), dict) and bool(parent["species"]), errors,
                    f"{label}.species must be a non-empty object")
            check_genes(f"{label}.genes", parent.get("genes"), errors)
            require(isinstance(parent.get("phenotype"), str) and parent["phenotype"], errors,
                    f"{label}.phenotype must be a non-empty string")
            require(parent.get("hybridTarget") is None, errors,
                    f"{label}.hybridTarget must be null")

    options = manifest.get("options")
    require(isinstance(options, dict) and options.get("mutation") == 0.04, errors,
            "options.mutation must be 0.04")

    seeded = manifest.get("seededRng")
    if not isinstance(seeded, dict):
        errors.append("seededRng must be an object")
    else:
        require(seeded.get("kind") == "lcg32", errors, "seededRng.kind must be lcg32")
        require(seeded.get("seed") == 11, errors, "seededRng.seed must be 11")
        require(seeded.get("multiplier") == 1664525, errors,
                "seededRng.multiplier must be 1664525")
        require(seeded.get("increment") == 1013904223, errors,
                "seededRng.increment must be 1013904223")
        require(seeded.get("modulus") == 4294967296, errors,
                "seededRng.modulus must be 4294967296")

    policy = manifest.get("policy")
    if isinstance(policy, dict):
        tolerance = policy.get("tolerance")
        if not isinstance(tolerance, dict):
            errors.append("policy.tolerance must be an object")
        else:
            require(tolerance.get("kind") == "absolute", errors,
                    "policy.tolerance.kind must be absolute")
            require(tolerance.get("value") == 1e-12, errors,
                    "policy.tolerance.value must be 1e-12")
            fields = set(tolerance.get("fields") or [])
            wanted = {
                "genes.size", "genes.rigidity", "genes.softness", "genes.stretch",
                "genes.hopPace[0]", "genes.hopPace[1]",
            }
            require(fields == wanted, errors,
                    "policy.tolerance.fields must cover the five numeric genes and both hopPace values")
        require(policy.get("singlePrecisionAccepted") is False, errors,
                "policy.singlePrecisionAccepted must be false")

    cases = manifest.get("cases")
    if not isinstance(cases, list) or len(cases) != 2:
        errors.append("cases must contain exactly the same-species and mixed-species cases")
        return
    seen = set()
    parents = manifest.get("parents") if isinstance(manifest.get("parents"), dict) else {}
    for index, case in enumerate(cases):
        label = f"cases[{index}]"
        if not isinstance(case, dict):
            errors.append(f"{label} must be an object")
            continue
        case_id = case.get("id")
        require(case_id in ("same-species", "mixed-species"), errors,
                f"{label}.id must be same-species or mixed-species")
        if isinstance(case_id, str):
            seen.add(case_id)
        require(case.get("parentA") in parents, errors, f"{label}.parentA must reference parents")
        require(case.get("parentB") in parents, errors, f"{label}.parentB must reference parents")
        fixed_rng = case.get("fixedRng")
        if not isinstance(fixed_rng, dict):
            errors.append(f"{label}.fixedRng must be an object")
        else:
            require(fixed_rng.get("kind") == "constant", errors,
                    f"{label}.fixedRng.kind must be constant")
            require(fixed_rng.get("value") == 0.5, errors,
                    f"{label}.fixedRng.value must be 0.5")
            require(fixed_rng.get("drawCount") == 10, errors,
                    f"{label}.fixedRng.drawCount must be 10")
        mixed = case_id == "mixed-species"
        check_genome_expected(f"{label}.fixedExpected", case.get("fixedExpected"), mixed, errors)
        check_genome_expected(f"{label}.seededExpected", case.get("seededExpected"), mixed, errors)
        if isinstance(case.get("fixedExpected"), dict) and isinstance(case.get("seededExpected"), dict):
            fixed_genes = case["fixedExpected"].get("genes") or {}
            seeded_genes = case["seededExpected"].get("genes") or {}
            require(fixed_genes.get("color") != seeded_genes.get("color"), errors,
                    f"{label}: seeded expected output must differ from the constant-RNG output")
    require(seen == {"same-species", "mixed-species"}, errors,
            "cases must cover same-species and mixed-species")

    negatives = manifest.get("negatives")
    categories = {
        item.get("category") for item in negatives
        if isinstance(item, dict) and isinstance(item.get("category"), str)
    } if isinstance(negatives, list) else set()
    missing = EXPECTED_GENOME_NEGATIVES - categories
    require(not missing, errors, f"negatives missing categories: {sorted(missing)}")


def check_wire_snapshot(label: str, snapshot, errors: list[str]) -> None:
    if not isinstance(snapshot, dict):
        errors.append(f"{label} must be an object")
        return
    require(snapshot.get("actorVersion") == 8, errors,
            f"{label}.actorVersion must be 8 for the fixture record")
    require(is_number(snapshot.get("uid")), errors, f"{label}.uid must be numeric")
    forbidden = snapshot.get("forbiddenKeys")
    require(isinstance(forbidden, list) and "ai" in forbidden and "mesh" in forbidden,
            errors, f"{label}.forbiddenKeys must exclude live ai/mesh handles")


def check_wire(manifest: dict, errors: list[str]) -> None:
    constants = manifest.get("constants")
    provenance = manifest.get("provenance")
    if isinstance(constants, dict):
        require(constants.get("ACTOR_SAVE_VERSION") == 9, errors,
                "constants.ACTOR_SAVE_VERSION must be 9")
        require(constants.get("SAVE_VERSION") == 1, errors, "constants.SAVE_VERSION must be 1")
        require(constants.get("fixtureRecordActorVersion") == 8, errors,
                "constants.fixtureRecordActorVersion must be 8")
    if isinstance(provenance, dict):
        require(provenance.get("actorSaveVersion") == 9, errors,
                "provenance.actorSaveVersion must be 9")
        require(provenance.get("fixtureRecordActorVersion") == 8, errors,
                "provenance.fixtureRecordActorVersion must be 8")

    records = manifest.get("records")
    if not isinstance(records, dict):
        errors.append("records must be an object")
        return
    require(set(records) == {"A", "B", "C"}, errors, "records must contain A, B and C")
    for key, uid in (("A", 1), ("B", 2), ("C", 3)):
        record = records.get(key)
        if not isinstance(record, dict):
            errors.append(f"records.{key} must be an object")
            continue
        require(record.get("uid") == uid, errors, f"records.{key}.uid must be {uid}")

    world = manifest.get("world")
    if not isinstance(world, dict):
        errors.append("world must be an object")
    elif not isinstance(world.get("field"), dict):
        errors.append("world.field must be an object")
    else:
        field_bears = world["field"].get("bears")
        require(field_bears == ["A", "B", "C"], errors,
                "world.field.bears must reference A, B and C in order")

    expected = manifest.get("expected")
    if not isinstance(expected, dict):
        errors.append("expected must be an object")
        return
    snapshot = expected.get("snapshot")
    if not isinstance(snapshot, dict) or set(snapshot) != {"A", "B", "C"}:
        errors.append("expected.snapshot must contain A, B and C")
    else:
        for key in ("A", "B", "C"):
            check_wire_snapshot(f"expected.snapshot.{key}", snapshot[key], errors)
        require(snapshot["A"].get("partnerUid") == 2, errors,
                "expected.snapshot.A.partnerUid must be 2")
        require(snapshot["A"].get("lastGiftDay") == 2, errors,
                "expected.snapshot.A.lastGiftDay must be 2")

    validation = expected.get("validation")
    if not isinstance(validation, dict):
        errors.append("expected.validation must be an object")
    else:
        for key in ("validateActorWorld", "validateGameRelationships"):
            item = validation.get(key)
            require(isinstance(item, dict) and item.get("errors") == [], errors,
                    f"expected.validation.{key}.errors must be []")

    apply_expected = expected.get("apply")
    if not isinstance(apply_expected, dict):
        errors.append("expected.apply must be an object")
    else:
        require(apply_expected.get("sets", {}).get("partnerUid") == 2, errors,
                "expected.apply.sets.partnerUid must be 2")
        require("carriedFood" in (apply_expected.get("deletes") or []), errors,
                "expected.apply.deletes must include carriedFood")
        require(set(apply_expected.get("preservesLive") or []) == {"ai", "mesh", "body"},
                errors, "expected.apply.preservesLive must cover ai, mesh and body")
        require("partner" in (apply_expected.get("doesNotAdopt") or []), errors,
                "expected.apply.doesNotAdopt must include partner")

    prune = expected.get("prune")
    if not isinstance(prune, list) or len(prune) != 2:
        errors.append("expected.prune must contain two outcomes")
    else:
        keep, remove = prune
        require(keep.get("id") == "all-live-uids" and keep.get("expectedChanged") is False,
                errors, "first prune case must keep all live UIDs unchanged")
        require(remove.get("id") == "partner-and-rival-removed"
                and remove.get("expectedChanged") is True, errors,
                "second prune case must remove partner and rival references")
        deletes = set(remove.get("deletes") or [])
        require({"partnerUid", "bonds.2", "rivals.3"} <= deletes, errors,
                "second prune case must delete partnerUid, bonds.2 and rivals.3")

    policy = manifest.get("policy")
    if isinstance(policy, dict):
        rounding = policy.get("rounding")
        if not isinstance(rounding, dict):
            errors.append("policy.rounding must be an object")
        else:
            require(rounding.get("digits") == 3, errors, "policy.rounding.digits must be 3")
            require(set(rounding.get("fields") or []) == {"x", "z"}, errors,
                    "policy.rounding.fields must be x and z")

    negatives = manifest.get("negatives")
    categories = {
        item.get("category") for item in negatives
        if isinstance(item, dict) and isinstance(item.get("category"), str)
    } if isinstance(negatives, list) else set()
    missing = EXPECTED_WIRE_NEGATIVES - categories
    require(not missing, errors, f"negatives missing categories: {sorted(missing)}")


def validate_manifest(manifest: dict, filename: str) -> list[str]:
    expected = {
        "genome_inheritance.json": ("genome-inheritance", check_genome),
        "wire_uid.json": ("wire-uid", check_wire),
    }
    fixture_id, checker = expected[filename]
    errors = check_common(manifest, fixture_id)
    if not isinstance(manifest, dict):
        return errors
    checker(manifest, errors)
    return errors


def load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_fixtures(fixture_dir: Path) -> tuple[dict[str, dict], list[str]]:
    manifests: dict[str, dict] = {}
    errors: list[str] = []
    for filename in FIXTURE_FILES:
        path = fixture_dir / filename
        if not path.is_file():
            errors.append(f"missing fixture file {path}")
            continue
        try:
            manifests[filename] = load_manifest(path)
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"cannot read {path}: {exc}")
    return manifests, errors


def command_validate(fixture_dir: Path) -> int:
    manifests, load_errors = load_fixtures(fixture_dir)
    fixtures = []
    total_errors = 0
    for filename in FIXTURE_FILES:
        if filename not in manifests:
            fixture_errors = [error for error in load_errors if filename in error]
            fixtures.append({"file": filename, "ok": False, "errors": fixture_errors})
            total_errors += len(fixture_errors)
            continue
        errors = validate_manifest(manifests[filename], filename)
        if errors:
            total_errors += len(errors)
        fixtures.append({"file": filename, "ok": not errors, "errors": errors})
    summary = {
        "command": "validate",
        "fixtureDir": str(fixture_dir),
        "fixtures": fixtures,
        "ok": total_errors == 0,
        "errorCount": total_errors,
    }
    print(json.dumps(summary, indent=2))
    return 0 if total_errors == 0 else 1


def mutate_case(manifest: dict, filename: str) -> None:
    if filename == "genome_inheritance.json":
        manifest["cases"][0]["fixedExpected"]["drawCount"] = 9
    else:
        manifest["records"]["A"]["uid"] = 99


def command_self_test(fixture_dir: Path) -> int:
    manifests, load_errors = load_fixtures(fixture_dir)
    results = []
    failures = len(load_errors)
    for filename in FIXTURE_FILES:
        if filename not in manifests:
            results.append({
                "file": filename,
                "probes": [],
                "ok": False,
                "errors": [error for error in load_errors if filename in error],
            })
            continue
        manifest = manifests[filename]
        file_results = []

        tampered_hash = copy.deepcopy(manifest)
        replacement = "0" * 64 if tampered_hash["manifestHash"] != "0" * 64 else "1" * 64
        tampered_hash["manifestHash"] = replacement
        hash_errors = validate_manifest(tampered_hash, filename)
        file_results.append({
            "probe": "tampered-manifest-hash",
            "rejected": bool(hash_errors),
            "errors": hash_errors,
        })
        failures += 0 if hash_errors else 1

        mutated_case = copy.deepcopy(manifest)
        mutate_case(mutated_case, filename)
        case_errors = validate_manifest(mutated_case, filename)
        file_results.append({
            "probe": "mutated-case-without-rehash",
            "rejected": bool(case_errors),
            "errors": case_errors,
        })
        failures += 0 if case_errors else 1

        semantically_mutated = copy.deepcopy(manifest)
        mutate_case(semantically_mutated, filename)
        semantically_mutated["manifestHash"] = manifest_hash(semantically_mutated)
        semantic_errors = validate_manifest(semantically_mutated, filename)
        file_results.append({
            "probe": "mutated-case-with-consistent-hash",
            "rejected": bool(semantic_errors),
            "errors": semantic_errors,
        })
        failures += 0 if semantic_errors else 1

        results.append({
            "file": filename,
            "probes": file_results,
            "ok": all(item["rejected"] for item in file_results),
            "errors": [],
        })

    summary = {
        "command": "self-test",
        "fixtureDir": str(fixture_dir),
        "fixtures": results,
        "ok": failures == 0,
        "failureCount": failures,
        "wroteFixtures": False,
    }
    print(json.dumps(summary, indent=2))
    return 0 if failures == 0 else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate G1/M18b translation-pilot fixture manifests (stdlib only)."
    )
    parser.add_argument("command", nargs="?", default="validate", choices=["validate"])
    parser.add_argument("--self-test", action="store_true",
                        help="prove validation rejects in-memory mutations without writing fixtures")
    parser.add_argument("--fixture-dir", type=Path, default=FIXTURE_DIR,
                        help="alternate fixture directory for tamper checks")
    args = parser.parse_args(argv)
    if args.self_test:
        return command_self_test(args.fixture_dir)
    return command_validate(args.fixture_dir)


if __name__ == "__main__":
    sys.exit(main())

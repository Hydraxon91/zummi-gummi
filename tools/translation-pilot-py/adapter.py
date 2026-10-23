"""Bounded live-object ↔ saved-UID adapter subset (G3/M18d).

This is an independent Python port of only the adapter behavior exercised by
the pinned ``wire_uid.json`` fixture:

* ``snapshotActor``'s relational/positional subset,
* ``validateActorWorld`` and ``validateGameRelationships``'s required
  collection shape, duplicate-UID and reciprocal-reference checks,
* ``applyCommonActorState``'s UID/lastGiftDay application and live-handle
  preservation, and
* ``pruneActorRefs`` with a game-wide UID set.

It is standard-library only and imports no JavaScript, game module, browser
API, renderer, physics body or save file. It is not a general save-format
implementation.
"""

from __future__ import annotations

import math
from collections.abc import Mapping

ACTOR_SAVE_VERSION = 9
SUPPORTED_ACTOR_VERSIONS = frozenset(range(1, 10))
STAGES = frozenset(("baby", "teen", "adult"))


def _is_number(value) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _is_positive_uid(value) -> bool:
    return _is_number(value) and value > 0 and math.floor(value) == value


def _finite(value):
    return float(value) if _is_number(value) else None


def _round_fixed(value, digits: int):
    """Approximate ``+Number(value).toFixed(digits)`` for fixture-shaped input."""

    number = _finite(value)
    if number is None:
        return 0.0
    return float(f"{number:.{digits}f}")


def _uid_key(value):
    if _is_positive_uid(value):
        return int(value)
    if isinstance(value, str):
        try:
            number = float(value.strip())
        except ValueError:
            return None
        if math.isfinite(number) and number > 0 and math.floor(number) == number:
            return int(number)
    return None


def normalize_partner_uid(value):
    """Port of ``normalizePartnerUid``: a positive whole UID or ``None``."""

    return _uid_key(value)


def normalize_rivals(value) -> dict:
    """Port of ``normalizeRivals`` for the relationship-record subset."""

    out: dict = {}
    if not isinstance(value, Mapping):
        return out
    for key, candidate in value.items():
        other = _uid_key(key)
        if other is None or not isinstance(candidate, Mapping):
            continue
        since_day = _finite(candidate.get("sinceDay"))
        since_hour = _finite(candidate.get("sinceHour"))
        if (
            since_day is None
            or since_day < 0
            or since_hour is None
            or since_hour < 0
            or since_hour > 24
        ):
            continue
        out[str(other)] = {
            "sinceDay": math.floor(since_day),
            "sinceHour": _round_fixed(since_hour, 3),
        }
    return out


def normalize_carried_food(value):
    """Port of ``normalizeCarriedFood`` for the fixture carried-portion shape."""

    if not isinstance(value, Mapping):
        return None
    food_id = value.get("id")
    kind = value.get("kind")
    if not isinstance(food_id, str) or not food_id:
        return None
    if not isinstance(kind, str) or not kind:
        return None
    satiation = _finite(value.get("satiation"))
    if satiation is None or satiation <= 0:
        return None
    return {"id": food_id, "kind": kind, "satiation": _round_fixed(satiation, 4)}


def _non_empty_mapping(value) -> bool:
    return isinstance(value, Mapping) and bool(value)


def _history_has_bond_delta(value) -> bool:
    if not isinstance(value, list):
        return False
    for event in value:
        if not isinstance(event, Mapping):
            continue
        if _is_number(event.get("bondBefore")) and _is_number(event.get("bondAfter")):
            return True
    return False


def _subset_actor_version(record: Mapping) -> int:
    """The packaging rule from ``snapshotActor`` for the fields in this subset."""

    mourning = record.get("mourning")
    history = record.get("history")
    guardian_uid = record.get("guardianUid")
    gift_day = _finite(record.get("lastGiftDay"))
    partner_uid = normalize_partner_uid(record.get("partnerUid"))
    rivals = normalize_rivals(record.get("rivals"))
    carried_food = normalize_carried_food(record.get("carriedFood"))
    advanced = (
        partner_uid is not None or bool(rivals) or carried_food is not None
    )
    if _non_empty_mapping(record.get("preferences")) or _non_empty_mapping(
        record.get("habits")
    ):
        return 9
    if advanced:
        return 8
    if gift_day is not None and gift_day >= 0:
        return 7
    if _history_has_bond_delta(history):
        return 6
    if record.get("stage") == "baby" and _is_positive_uid(guardian_uid):
        return 5
    if isinstance(mourning, list) and mourning:
        return 4
    if record.get("traits"):
        return 3
    return 2


def snapshot_actor(record):
    """Port of the ``snapshotActor`` subset exercised by ``wire_uid.json``.

    Only saved UID/relationship/portion fields and the documented rounded
    ``x``/``z`` position are emitted. Live ``ai``/``mesh``/``body``/``partner``
    handles are never transcribed.
    """

    if not isinstance(record, Mapping):
        return None

    gift_day = _finite(record.get("lastGiftDay"))
    gift_day = math.floor(gift_day) if gift_day is not None and gift_day >= 0 else None
    partner_uid = normalize_partner_uid(record.get("partnerUid"))
    rivals = normalize_rivals(record.get("rivals"))
    carried_food = normalize_carried_food(record.get("carriedFood"))
    bonds = record.get("bonds")

    out = {
        "actorVersion": _subset_actor_version(record),
        "uid": record.get("uid"),
        "stage": record.get("stage"),
        "x": _round_fixed(record.get("cx"), 3),
        "z": _round_fixed(record.get("cz"), 3),
    }
    if isinstance(bonds, Mapping) and bonds:
        out["bonds"] = {str(key): value for key, value in bonds.items()}
    if gift_day is not None:
        out["lastGiftDay"] = gift_day
    if partner_uid is not None:
        out["partnerUid"] = partner_uid
    if rivals:
        out["rivals"] = rivals
    if carried_food is not None:
        out["carriedFood"] = carried_food
    return out


def _validate_actor_shape(actor, where: str, errors: list) -> None:
    if not isinstance(actor, Mapping):
        errors.append(f"{where} is not an object")
        return
    if not _is_positive_uid(actor.get("uid")):
        errors.append(f"{where}.uid is invalid")
    version = actor.get("actorVersion")
    if version is not None and version not in SUPPORTED_ACTOR_VERSIONS:
        errors.append(f"{where}.actorVersion {version} is unsupported")
    if not _is_number(actor.get("x")) or not _is_number(actor.get("z")):
        errors.append(f"{where} position is invalid")
    stage = actor.get("stage")
    if stage is not None and stage not in STAGES:
        errors.append(f"{where}.stage is invalid")
    if "bonds" in actor and not isinstance(actor["bonds"], Mapping):
        errors.append(f"{where}.bonds is invalid")
    if "lastGiftDay" in actor:
        day = _finite(actor.get("lastGiftDay"))
        if day is None or day < 0:
            errors.append(f"{where}.lastGiftDay is invalid")
    if "carriedFood" in actor and normalize_carried_food(actor.get("carriedFood")) is None:
        errors.append(f"{where}.carriedFood is invalid")
    if "partnerUid" in actor:
        partner = normalize_partner_uid(actor.get("partnerUid"))
        if partner is None or partner == actor.get("uid"):
            errors.append(f"{where}.partnerUid is invalid")
        elif stage is not None and stage != "adult":
            errors.append(f"{where}.partnerUid requires stage adult")
    if "rivals" in actor:
        rivals = actor.get("rivals")
        if not isinstance(rivals, Mapping):
            errors.append(f"{where}.rivals is invalid")
        else:
            for key, entry in rivals.items():
                other = _uid_key(key)
                if (
                    other is None
                    or other == actor.get("uid")
                    or not isinstance(entry, Mapping)
                ):
                    errors.append(f"{where}.rivals.{key} is invalid")
                    continue
                day = _finite(entry.get("sinceDay"))
                hour = _finite(entry.get("sinceHour"))
                if day is None or day < 0 or hour is None or hour < 0 or hour > 24:
                    errors.append(f"{where}.rivals.{key} is invalid")


def validate_actor_world(world, where: str) -> list:
    """Validate the required world collection shape and per-world unique UIDs."""

    errors: list = []
    if not isinstance(world, Mapping):
        return [f"{where} is not an object"]

    seen = set()
    bears = world.get("bears")
    if not isinstance(bears, list):
        errors.append(f"{where}.bears is not an array")
    else:
        for index, actor in enumerate(bears):
            label = f"{where}.bears[{index}]"
            _validate_actor_shape(actor, label, errors)
            if isinstance(actor, Mapping):
                uid = actor.get("uid")
                if _is_positive_uid(uid):
                    key = int(uid)
                    if key in seen:
                        errors.append(f"{label}.uid {key} is duplicated in {where}")
                    seen.add(key)

    if "glass" in world:
        glass = world["glass"]
        if not isinstance(glass, list):
            errors.append(f"{where}.glass is not an array")
        else:
            for index, actor in enumerate(glass):
                label = f"{where}.glass[{index}]"
                _validate_actor_shape(actor, label, errors)
                if isinstance(actor, Mapping):
                    uid = actor.get("uid")
                    if _is_positive_uid(uid):
                        key = int(uid)
                        if key in seen:
                            errors.append(f"{label}.uid {key} is duplicated in {where}")
                        seen.add(key)
    return errors


def _collect_world_actors(worlds):
    entries = []
    if not isinstance(worlds, Mapping):
        return entries
    for world_id in ("field", "studio"):
        world = worlds.get(world_id)
        if not isinstance(world, Mapping):
            continue
        for collection_key in ("bears", "glass"):
            collection = world.get(collection_key)
            if not isinstance(collection, list):
                continue
            for actor in collection:
                if isinstance(actor, Mapping) and _is_positive_uid(actor.get("uid")):
                    entries.append((world_id, collection_key, int(actor["uid"]), actor))
    return entries


def validate_game_relationships(worlds) -> list:
    """Validate game-wide unique UIDs and reciprocal partnership/rivalry records."""

    errors: list = []
    if not isinstance(worlds, Mapping):
        return ["worlds is not an object"]

    by_uid: dict = {}
    for world_id, collection_key, uid, actor in _collect_world_actors(worlds):
        if uid in by_uid:
            errors.append(
                f"duplicate actor uid {uid} across {world_id}.{collection_key}"
            )
            continue
        by_uid[uid] = actor

    for uid, actor in by_uid.items():
        partner_uid = normalize_partner_uid(actor.get("partnerUid"))
        if partner_uid is not None:
            partner = by_uid.get(partner_uid)
            if partner is None:
                errors.append(
                    f"actor {uid}.partnerUid references missing actor {partner_uid}"
                )
            else:
                if normalize_partner_uid(partner.get("partnerUid")) != uid:
                    errors.append(f"actor {uid}.partnerUid is not reciprocal")
                if actor.get("stage") != "adult" or partner.get("stage") != "adult":
                    errors.append(f"actor {uid}.partnerUid requires adult partners")

        for key in normalize_rivals(actor.get("rivals")):
            other_uid = int(key)
            other = by_uid.get(other_uid)
            if other is None:
                errors.append(
                    f"actor {uid}.rivals references missing actor {other_uid}"
                )
            elif str(uid) not in normalize_rivals(other.get("rivals")):
                errors.append(f"actor {uid}.rivals.{other_uid} is not reciprocal")
    return errors


def apply_common_actor_state(target, record):
    """Apply only the UID/gift subset; live handles are neither replaced nor deleted."""

    if not isinstance(target, Mapping) or not isinstance(record, Mapping):
        return target

    gift_day = _finite(record.get("lastGiftDay"))
    if gift_day is not None and gift_day >= 0:
        target["lastGiftDay"] = math.floor(gift_day)
    else:
        target.pop("lastGiftDay", None)

    partner_uid = normalize_partner_uid(record.get("partnerUid"))
    if partner_uid is not None:
        target["partnerUid"] = partner_uid
    else:
        target.pop("partnerUid", None)

    rivals = normalize_rivals(record.get("rivals"))
    if rivals:
        target["rivals"] = rivals
    else:
        target.pop("rivals", None)

    # A carried portion is converted to a dropped portion by the app; it is
    # deliberately never restored onto the live actor.
    target.pop("carriedFood", None)

    # Saved ai/mesh/body/partner pointers are intentionally ignored. The live
    # object's handles remain untouched.
    return target


def _valid_uid_set(valid_uids) -> set:
    if isinstance(valid_uids, (set, frozenset)):
        return {int(uid) for uid in valid_uids if _is_positive_uid(uid)}
    return {int(uid) for uid in (valid_uids or []) if _is_positive_uid(uid)}


def prune_actor_refs(record, valid_uids):
    """Port of ``pruneActorRefs``; returns whether any reference changed."""

    if not isinstance(record, Mapping):
        return False
    valid = _valid_uid_set(valid_uids)
    changed = False

    for key in ("bonds", "playdates"):
        mapping = record.get(key)
        if isinstance(mapping, Mapping):
            for ref in list(mapping):
                ref_uid = _uid_key(ref)
                if ref_uid is None or ref_uid not in valid:
                    del mapping[ref]
                    changed = True

    history = record.get("history")
    if isinstance(history, list):
        kept = []
        for event in history:
            event_uid = event.get("uid") if isinstance(event, Mapping) else None
            if event_uid and _uid_key(event_uid) not in valid:
                changed = True
                continue
            kept.append(event)
        if len(kept) != len(history):
            record["history"] = kept
            changed = True

    if "guardianUid" in record and _uid_key(record.get("guardianUid")) not in valid:
        del record["guardianUid"]
        changed = True

    if "partnerUid" in record and _uid_key(record.get("partnerUid")) not in valid:
        del record["partnerUid"]
        changed = True

    rivals = record.get("rivals")
    if isinstance(rivals, Mapping):
        for key in list(rivals):
            if _uid_key(key) not in valid:
                del rivals[key]
                changed = True

    return changed

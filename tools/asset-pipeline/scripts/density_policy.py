"""Pure texel-density policy and percentile helpers. No bpy imports."""

import math

METHOD = "camera_projected_advisory"
ZONE_MODES = {"material", "object"}
FAIL_MODES = {"none", "error", "warning"}


class PolicyError(ValueError):
    pass


def _number(value, label, minimum=None, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PolicyError("%s must be a number" % label)
    if not math.isfinite(value):
        raise PolicyError("%s must be finite" % label)
    if minimum is not None and value < minimum:
        raise PolicyError("%s must be >= %s" % (label, minimum))
    if maximum is not None and value > maximum:
        raise PolicyError("%s must be <= %s" % (label, maximum))
    return float(value)


def _pair(value, label, integer=False, minimum=0.0):
    if not isinstance(value, list) or len(value) != 2:
        raise PolicyError("%s must be a two-item list" % label)
    items = []
    for item in value:
        if integer:
            if isinstance(item, bool) or not isinstance(item, int) or item < 1:
                raise PolicyError("%s values must be positive integers" % label)
            items.append(item)
        else:
            items.append(_number(item, label, minimum=minimum))
    return items


def validate_policy(policy):
    if not isinstance(policy, dict):
        raise PolicyError("texel_density must be an object")
    required = (
        "method", "camera", "viewport_px", "texture_resolutions_px",
        "target_texels_per_screen_pixel", "spread_ratio_max",
        "anisotropy_ratio_max", "zone_mode", "small_triangle_screen_px",
        "min_zone_samples", "min_visible_fraction", "advisory", "notes",
    )
    missing = [key for key in required if key not in policy]
    if missing:
        raise PolicyError("texel_density missing keys: %s" % ", ".join(missing))
    if policy["method"] != METHOD:
        raise PolicyError("texel_density.method must be %s" % METHOD)
    if policy["camera"] is not None:
        if not isinstance(policy["camera"], str) or not policy["camera"].strip():
            raise PolicyError("texel_density.camera must be null or a non-empty string")
    _pair(policy["viewport_px"], "texel_density.viewport_px", integer=True)
    resolutions = policy["texture_resolutions_px"]
    if not isinstance(resolutions, list) or not resolutions:
        raise PolicyError("texel_density.texture_resolutions_px must be a non-empty list")
    for resolution in resolutions:
        _pair(resolution, "texel_density.texture_resolutions_px[]", integer=True)
    low, high = _pair(
        policy["target_texels_per_screen_pixel"],
        "texel_density.target_texels_per_screen_pixel", minimum=0.0)
    if low <= 0.0:
        raise PolicyError("texel_density.target_texels_per_screen_pixel must be > 0")
    if low > high:
        raise PolicyError("texel_density.target_texels_per_screen_pixel low > high")
    spread_max = _number(policy["spread_ratio_max"],
                         "texel_density.spread_ratio_max", minimum=0.0)
    if spread_max <= 0.0:
        raise PolicyError("texel_density.spread_ratio_max must be > 0")
    _number(policy["anisotropy_ratio_max"], "texel_density.anisotropy_ratio_max",
            minimum=1.0)
    if policy["zone_mode"] not in ZONE_MODES:
        raise PolicyError("texel_density.zone_mode must be one of %s"
                          % sorted(ZONE_MODES))
    _number(policy["small_triangle_screen_px"],
            "texel_density.small_triangle_screen_px", minimum=0.0)
    samples = policy["min_zone_samples"]
    if isinstance(samples, bool) or not isinstance(samples, int) or samples < 1:
        raise PolicyError("texel_density.min_zone_samples must be an integer >= 1")
    _number(policy["min_visible_fraction"], "texel_density.min_visible_fraction",
            minimum=0.0, maximum=1.0)
    if not isinstance(policy["advisory"], bool):
        raise PolicyError("texel_density.advisory must be boolean")
    if not isinstance(policy["notes"], list) or not all(
            isinstance(item, str) for item in policy["notes"]):
        raise PolicyError("texel_density.notes must be a list of strings")
    return True


def percentile(values, q):
    if not values:
        return None
    if not 0.0 <= q <= 1.0:
        raise ValueError("q must be between 0 and 1")
    ordered = sorted(float(value) for value in values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * q
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] * (1.0 - fraction) + ordered[upper] * fraction


def summarize(values):
    clean = [float(value) for value in values if value is not None
             and math.isfinite(value)]
    if not clean:
        return {"count": 0, "min": None, "p05": None, "median": None,
                "p95": None, "max": None, "mean": None}
    return {
        "count": len(clean),
        "min": min(clean),
        "p05": percentile(clean, 0.05),
        "median": percentile(clean, 0.50),
        "p95": percentile(clean, 0.95),
        "max": max(clean),
        "mean": sum(clean) / len(clean),
    }


def evaluate_group(samples, policy, check_consistency=True):
    usable = [
        sample for sample in samples
        if sample.get("ratio") is not None
        and math.isfinite(float(sample["ratio"]))
    ]
    ratios = [float(sample["ratio"]) for sample in usable]
    measured = [float(sample["measured_px_per_m"]) for sample in usable
                if sample.get("measured_px_per_m") is not None]
    anisotropy = [float(sample["anisotropy_ratio"]) for sample in usable
                  if sample.get("anisotropy_ratio") is not None]
    result = {
        "status": "unverified",
        "sample_count": len(usable),
        "ratio": summarize(ratios),
        "measured_px_per_m": summarize(measured),
        "anisotropy_ratio": summarize(anisotropy),
        "spread_ratio": None,
        "findings": [],
    }
    if len(usable) < policy["min_zone_samples"]:
        result["reason"] = ("%s samples; minimum is %s"
                            % (len(usable), policy["min_zone_samples"]))
        return result

    low, high = policy["target_texels_per_screen_pixel"]
    if result["ratio"]["p05"] < low:
        result["findings"].append("texel_density_under")
    if result["ratio"]["p95"] > high:
        result["findings"].append("texel_density_over")

    if check_consistency and result["measured_px_per_m"]["p05"]:
        spread = (result["measured_px_per_m"]["p95"]
                  / result["measured_px_per_m"]["p05"])
        result["spread_ratio"] = spread
        if spread > policy["spread_ratio_max"]:
            result["findings"].append("texel_density_inconsistent")
    if (check_consistency and result["anisotropy_ratio"]["p95"] is not None
            and result["anisotropy_ratio"]["p95"]
            > policy["anisotropy_ratio_max"]):
        result["findings"].append("texel_density_anisotropic")

    result["status"] = "review" if result["findings"] else "pass"
    return result


def aggregate_status(statuses):
    if not statuses:
        return "unverified"
    if "review" in statuses:
        return "review"
    if "unverified" in statuses:
        return "partial" if "pass" in statuses else "unverified"
    return "pass"


def exit_code(summary, fail_on):
    if fail_on not in FAIL_MODES:
        raise ValueError("fail_on must be one of %s" % sorted(FAIL_MODES))
    if fail_on == "none":
        return 0
    if summary.get("errors", 0):
        return 1
    if fail_on == "warning" and summary.get("warnings", 0):
        return 1
    return 0

"""Pure genome-inheritance rule ported from ``src/dna.js`` (G2/M18c).

The module deliberately covers only the bear/msn subset needed by the pinned
G1 fixture. It is standard-library only and has no JavaScript, game-runtime or
browser dependency. Parent genomes are treated as immutable inputs; every
normalization returns fresh dictionaries and lists.
"""

from __future__ import annotations

import math
import random
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType

DNA_VERSION = 1

GENE_ORDER = (
    "color", "size", "rigidity", "softness", "stretch", "material", "hopPace",
)


@dataclass(frozen=True)
class GeneDef:
    id: str
    type: str
    min: float | None = None
    max: float | None = None
    mutation: float = 0.0
    fallback: object = None


_GENE_DEFS = (
    GeneDef("color", "color", fallback=None),
    GeneDef("size", "number", min=0.35, max=1.6, mutation=0.08, fallback=1),
    GeneDef("rigidity", "number", min=0.0, max=1.0, mutation=0.12, fallback=0),
    GeneDef("softness", "number", min=0.0, max=1.0, mutation=0.12, fallback=0),
    GeneDef("stretch", "number", min=0.0, max=2.0, mutation=0.18, fallback=0),
    GeneDef("material", "choice", fallback=None),
    GeneDef("hopPace", "range", min=0.2, max=3.0, mutation=1.0,
            fallback=(0.7, 1.8)),
)

GENE_DEFS = MappingProxyType({gene.id: gene for gene in _GENE_DEFS})


def _frozen_defaults(values: Mapping) -> MappingProxyType:
    return MappingProxyType(dict(values))


@dataclass(frozen=True)
class SpeciesDef:
    id: str
    phenotype: str
    loci: tuple[str, ...]
    defaults: MappingProxyType
    hybrids: MappingProxyType
    material: str


_BEAR = SpeciesDef(
    id="bear",
    phenotype="softbody-bear",
    loci=GENE_ORDER,
    defaults=_frozen_defaults({
        "color": "flavor",
        "size": 1,
        "rigidity": 0.35,
        "softness": 0.65,
        "stretch": 0.8,
        "material": "bearGummy",
        "hopPace": (0.7, 1.8),
    }),
    hybrids=MappingProxyType({"msn": "bear-msn"}),
    material="flavor",
)

_MSN = SpeciesDef(
    id="msn",
    phenotype="softbody-msn",
    loci=GENE_ORDER,
    defaults=_frozen_defaults({
        "color": "#86dd7d",
        "size": 1,
        "rigidity": 0.2,
        "softness": 0.8,
        "stretch": 1,
        "material": "msnGummy",
        "hopPace": (0.75, 1.75),
    }),
    hybrids=MappingProxyType({"bear": "bear-msn"}),
    material="msn",
)

SPECIES = MappingProxyType({"bear": _BEAR, "msn": _MSN})


class ConstantRng:
    """Deterministic RNG returning ``value`` for every draw."""

    def __init__(self, value: float = 0.5) -> None:
        self.value = value
        self.draws = 0

    def __call__(self) -> float:
        self.draws += 1
        return self.value


class Lcg32:
    """Pinned 32-bit linear-congruential RNG from the G1 manifest."""

    MULTIPLIER = 1664525
    INCREMENT = 1013904223
    MODULUS = 4294967296

    def __init__(self, seed: int = 11) -> None:
        self.state = int(seed) % self.MODULUS
        self.draws = 0

    def __call__(self) -> float:
        self.state = (
            self.state * self.MULTIPLIER + self.INCREMENT
        ) % self.MODULUS
        self.draws += 1
        return self.state / self.MODULUS


def _clamp(value: float, low: float, high: float) -> float:
    return low if value < low else (high if value > high else value)


def _js_number(value: object) -> float:
    """Best-effort JavaScript ``Number(value)`` for fixture-shaped inputs."""

    if value is None:
        return math.nan
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return 0.0
        try:
            return float(text)
        except ValueError:
            return math.nan
    return math.nan


def _js_round(value: float) -> int:
    """JavaScript ``Math.round``: halves round toward positive infinity."""

    return math.floor(value + 0.5)


def _truthy_number(value: object, fallback: float) -> float:
    number = _js_number(value)
    if math.isnan(number) or number == 0:
        return float(fallback)
    return number


def _coerce_rng(rng: object):
    if rng is None:
        return random.random
    if callable(rng):
        return rng
    method = getattr(rng, "random", None)
    if callable(method):
        return method
    raise TypeError("rng must be callable or expose random()")


def normalize_weights(value: object) -> dict[str, float]:
    """Port of ``normalizeWeights`` limited to the known bear/msn species."""

    out: dict[str, float] = {}
    total = 0.0
    if isinstance(value, Mapping):
        for species_id, raw in value.items():
            if species_id not in SPECIES:
                continue
            weight = _js_number(raw)
            if not math.isfinite(weight) or weight <= 0:
                continue
            out[species_id] = weight
            total += weight
    if total <= 0:
        return {"bear": 1}
    for species_id in list(out):
        out[species_id] = out[species_id] / total
    return out


def dominant_species(weights: Mapping[str, float]) -> SpeciesDef:
    """Port of ``dominantSpecies``; the first strictly-greatest key wins."""

    species_id = "bear"
    best = -1.0
    for candidate, weight in weights.items():
        if weight > best:
            best = weight
            species_id = candidate
    return SPECIES.get(species_id, SPECIES["bear"])


def _top_species_id(weights: Mapping[str, float]) -> str:
    items = list(weights.items())
    items.sort(key=lambda item: item[1], reverse=True)
    return items[0][0] if items else "bear"


def normalize_color(value: object, fallback: object) -> object:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def normalize_hop_pace(value: object, fallback) -> list[float]:
    source = value if isinstance(value, (list, tuple)) else fallback
    fallback_list = list(fallback) if isinstance(fallback, (list, tuple)) else [0.7, 1.8]

    def item(index: int):
        if isinstance(source, (list, tuple)) and len(source) > index:
            return source[index]
        return None

    lo = _clamp(_truthy_number(item(0), fallback_list[0]), 0.2, 3)
    hi = _clamp(_truthy_number(item(1), fallback_list[1]), 0.2, 3)
    return [lo, hi] if lo <= hi else [hi, lo]


def blend_color(a: object, b: object, rng) -> object:
    def parse(value: object):
        if not isinstance(value, str):
            return None
        hex_value = value.replace("#", "", 1)
        if len(hex_value) == 3:
            hex_value = "".join(ch + ch for ch in hex_value)
        if len(hex_value) != 6:
            return None
        if any(ch not in "0123456789abcdefABCDEF" for ch in hex_value):
            return None
        return [int(hex_value[index:index + 2], 16) for index in (0, 2, 4)]

    channel_a = parse(a)
    channel_b = parse(b)
    if channel_a is None or channel_b is None:
        return a if rng() < 0.5 else b
    mixed = []
    for index in range(3):
        start = channel_a[index]
        end = channel_b[index]
        value = _js_round(start + (end - start) * (0.35 + rng() * 0.3))
        mixed.append(int(_clamp(value, 0, 255)))
    return "#" + "".join(f"{value:02x}" for value in mixed)


def _default_for_gene(gene: GeneDef, defaults: Mapping, species: SpeciesDef):
    if gene.id == "color":
        return normalize_color(defaults.get("color"), gene.fallback)
    if gene.id == "material":
        return defaults.get("material") or species.material or gene.fallback
    if gene.type == "range":
        value = defaults.get(gene.id)
        return value if isinstance(value, (list, tuple)) else gene.fallback
    return defaults[gene.id] if gene.id in defaults else gene.fallback


def _normalize_gene(gene: GeneDef, value: object, fallback: object):
    if gene.type == "number":
        number = _js_number(value)
        if math.isfinite(number):
            return _clamp(number, gene.min, gene.max)
        return _clamp(float(fallback), gene.min, gene.max)
    if gene.type == "color":
        return normalize_color(value, fallback)
    if gene.type == "choice":
        return value if isinstance(value, str) else fallback
    return normalize_hop_pace(value, fallback)


def normalize_genome(input_genome: Mapping | None = None) -> dict:
    """Port of ``normalizeGenome`` for the bear/msn loci subset."""

    source = input_genome if isinstance(input_genome, Mapping) else {}
    weights = normalize_weights(source.get("species"))
    species = dominant_species(weights)
    defaults = species.defaults
    genes = dict(defaults)
    supplied = source.get("genes")
    if isinstance(supplied, Mapping):
        genes.update(supplied)

    out_genes: dict[str, object] = {}
    for gene_id in species.loci:
        gene = GENE_DEFS[gene_id]
        out_genes[gene_id] = _normalize_gene(
            gene,
            genes.get(gene_id),
            _default_for_gene(gene, defaults, species),
        )

    return {
        "version": DNA_VERSION,
        "species": weights,
        "genes": out_genes,
        "phenotype": source.get("phenotype") or species.phenotype or None,
        "hybridTarget": (
            source.get("hybridTarget")
            if isinstance(source.get("hybridTarget"), str)
            else None
        ),
    }


def default_genome(species_id: str = "bear", genes: Mapping | None = None) -> dict:
    """Port of ``defaultGenome`` with the approved ``genes`` override shape."""

    species = SPECIES.get(species_id) if isinstance(species_id, str) else None
    if species is None:
        species = SPECIES["bear"]
    merged = dict(species.defaults)
    if isinstance(genes, Mapping):
        merged.update(genes)
    return normalize_genome({
        "version": DNA_VERSION,
        "species": {species.id: 1},
        "genes": merged,
        "phenotype": species.phenotype,
        "hybridTarget": None,
    })


def _species_for(value: object) -> SpeciesDef | None:
    if isinstance(value, SpeciesDef):
        return value
    if isinstance(value, str):
        return SPECIES.get(value)
    if isinstance(value, Mapping):
        candidate = value.get("id")
        if isinstance(candidate, str):
            return SPECIES.get(candidate)
    return None


def hybrid_target_for(a: object, b: object) -> str | None:
    """Port of ``hybridTargetFor`` using the bear/msn hybrid map."""

    species_a = _species_for(a)
    species_b = _species_for(b)
    if species_a is None or species_b is None:
        return None
    direct = species_a.hybrids.get(species_b.id)
    if direct is not None:
        return direct
    return species_b.hybrids.get(species_a.id)


def _inherit_gene(gene: GeneDef, a, b, high, low, rng, mutation: float):
    if gene.type == "number":
        value = (a + b) * 0.5 + (rng() * 2 - 1) * (mutation * gene.mutation)
        return _clamp(value, gene.min, gene.max)
    if gene.type == "color":
        return blend_color(a, b, rng)
    if gene.type == "choice":
        return high if rng() < 0.5 else low
    lo = _clamp(
        (a[0] + b[0]) * 0.5 + (rng() * 2 - 1) * mutation,
        gene.min,
        gene.max,
    )
    hi = _clamp(
        (a[1] + b[1]) * 0.5 + (rng() * 2 - 1) * mutation,
        gene.min,
        gene.max,
    )
    return [lo, hi] if lo <= hi else [hi, lo]


def combine_genomes(parent_a, parent_b, mutation: float = 0.04, rng=None) -> dict:
    """Port of ``combineGenomes`` for bear/msn with an injected RNG."""

    draw = _coerce_rng(rng)
    if (
        isinstance(mutation, (int, float))
        and not isinstance(mutation, bool)
        and math.isfinite(float(mutation))
    ):
        amount = max(0.0, float(mutation))
    else:
        amount = 0.04

    a = normalize_genome(parent_a)
    b = normalize_genome(parent_b)

    union_ids = list(a["species"])
    for species_id in b["species"]:
        if species_id not in a["species"]:
            union_ids.append(species_id)
    merged = {
        species_id: a["species"].get(species_id, 0) * 0.5
        + b["species"].get(species_id, 0) * 0.5
        for species_id in union_ids
    }
    species = normalize_weights(merged)
    species_def = dominant_species(species)

    # The honest high/low split for choice genes follows the dominant species.
    # When a and b tie on that species, the first parent wins, matching the
    # stable sort in the JavaScript rule.
    a_top = _top_species_id(a["species"])
    b_top = _top_species_id(b["species"])
    high = a if a_top == species_def.id else b
    low = b if high is a else a

    genes = dict(high["genes"])
    for gene_id in species_def.loci:
        gene = GENE_DEFS[gene_id]
        genes[gene_id] = _inherit_gene(
            gene,
            a["genes"][gene_id],
            b["genes"][gene_id],
            high["genes"][gene_id],
            low["genes"][gene_id],
            draw,
            amount,
        )

    target = hybrid_target_for(a_top, b_top)
    return normalize_genome({
        "version": DNA_VERSION,
        "species": species,
        "genes": genes,
        "phenotype": species_def.phenotype,
        "hybridTarget": target,
    })

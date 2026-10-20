"""Shared Phase 5 material prompts (kept within a 77-token CLIP limit)."""

NEGATIVE = (
    "text, watermark, UI, border, frame, margin, shadow, lighting, reflection, "
    "highlight, perspective, object, background, visible seam, gradient, vignette, "
    "banding, mosaic, tile grid, grout, cracks, stones, pattern"
)

UNIFORM = "Uniform brightness; opposite edges match when tiled."

CRATE_MATERIALS = [
    {
        "id": "crate_teal",
        "label": "Teal painted metal crate panel",
        "prompt": (
            "Flat albedo texture of smooth satin teal painted metal crate panel, "
            "fine paint microtexture, uniform colour, no tiles, no grout, no cracks, "
            "no pattern, no lighting, no shadows, no objects, no text, no border."
        ),
    },
    {
        "id": "crate_silver",
        "label": "Silver brushed metal crate trim",
        "prompt": (
            "Flat albedo texture of neutral silver brushed metal crate trim, fine "
            "horizontal grain, uniform satin finish, no pattern, no scratches, no tiles, "
            "no lighting, no shadows, no objects, no text, no border."
        ),
    },
]

MATERIALS = [
    {
        "id": "painted_teal_panel",
        "label": "Painted teal architectural panel",
        "prompt": (
            "Flat albedo texture of a smooth muted turquoise blue-green painted plaster wall, "
            "fine matte plaster grain, uniform colour, no tiles, no grout, no cracks, "
            "no pattern, no lighting, no shadows, no objects, no text, no border."
        ),
    },
    {
        "id": "pale_ceramic",
        "label": "Pale warm ceramic surface",
        "prompt": (
            "Flat albedo texture of a pale warm-white glazed ceramic surface, fine "
            "even speckle, uniform glaze, no tiles, no grout, no cracks, no pattern, no "
            "lighting, no shadows, no objects, no text, no border."
        ),
    },
    {
        "id": "brushed_silver",
        "label": "Brushed silver trim",
        "prompt": (
            "Flat albedo texture of neutral light-grey brushed metal, fine "
            "horizontal grain, uniform satin finish, no pattern, no scratches, no tiles, "
            "no lighting, no shadows, no objects, no text, no border."
        ),
    },
]

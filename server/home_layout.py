"""
The home's layout, written for someone who cannot see the room.

A real deployment configures this once (like a floor plan in a home app); here
it matches the 3D simulator's geometry (simulator/src/config/house.js and the
room files). Vision says *what* an object is resting on and *what is next to
it*; this map turns that into *which* piece of furniture and *how to walk
there* - directions a vision model cannot reliably give on its own, because
left and right in a camera picture are not the person's left and right.

Every route starts in the room's main doorway, facing into the room.
One step is about 70 cm.
"""

from __future__ import annotations

GUIDES: dict[str, dict] = {
    "bedroom": {
        "entrance": "the bedroom door",
        "surfaces": [
            {
                "label": "the bedside table on the left of the bed, by the big window",
                "names": ("nightstand", "bedside", "night stand"),
                "cues": ("window", "curtain", "wardrobe", "left"),
                "height": "about knee height",
                "route": "From the bedroom door, walk straight ahead toward the far wall, about seven steps, "
                         "with the wardrobe on your left. Then turn right and go about four steps along the "
                         "far wall - the table is right in front of you, beside the head of the bed.",
            },
            {
                "label": "the bedside table on the far side of the bed, near the bathroom door",
                "names": ("nightstand", "bedside", "night stand"),
                "cues": ("bathroom", "right", "far side"),
                "height": "about knee height",
                "route": "From the bedroom door, walk diagonally right toward the bathroom door, about seven "
                         "steps, passing the bench at the foot of the bed on your left. Then turn left and "
                         "follow the side of the bed to the far wall, about three steps - the table is on your left.",
            },
            {
                "label": "the bench at the foot of the bed",
                "names": ("bench",),
                "cues": (),
                "height": "a little below knee height",
                "route": "From the bedroom door, the bench is about five steps ahead and to your right, "
                         "across the foot of the bed.",
            },
            {
                "label": "the bed",
                "names": ("bed", "pillow", "blanket", "duvet"),
                "cues": (),
                "height": "about knee height",
                "route": "From the bedroom door, the bed is ahead of you and to the right, with its head "
                         "against the far wall.",
            },
        ],
        "obstacles": "There's a rug in the middle of the floor and a padded bench across the foot of the bed.",
    },
    "living": {
        "entrance": "the hall door",
        "surfaces": [
            {
                "label": "the coffee table in front of the sofa",
                "names": ("coffee table",),
                "cues": (),
                "height": "just below knee height",
                "route": "From the hall door, walk straight ahead about three steps, with the small side "
                         "table on your left. Then turn left and go about three steps past the end of the "
                         "sofa - the coffee table is in front of the sofa, in the middle of the rug.",
            },
            {
                "label": "the small side table at the right-hand end of the sofa",
                "names": ("side table", "end table"),
                "cues": (),
                "height": "about knee height",
                "route": "From the hall door, the side table is about two steps ahead and slightly to your "
                         "left, at the end of the sofa.",
            },
            {
                "label": "the sofa",
                "names": ("sofa", "couch", "cushion"),
                "cues": (),
                "height": "seat at about knee height",
                "route": "From the hall door, the sofa is ahead and to your left, with its back toward you.",
            },
            {
                "label": "the console table against the wall behind the sofa",
                "names": ("console",),
                "cues": (),
                "height": "about hip height",
                "route": "From the hall door, the console table is immediately to your left, against the "
                         "same wall as the door.",
            },
            {
                "label": "the TV stand on the far wall",
                "names": ("tv stand", "entertainment", "tv unit", "media"),
                "cues": (),
                "height": "about knee height",
                "route": "From the hall door, the TV stand is straight across the room against the far wall, "
                         "about eight steps; go around the left of the sofa and coffee table.",
            },
        ],
        "obstacles": "There's a rug under the coffee table, and a standing fan further along the right-hand side of the room.",
    },
    "kitchen": {
        "entrance": "the kitchen door",
        "surfaces": [
            {
                "label": "the round dining table",
                "names": ("dining table", "table"),
                "cues": (),
                "height": "about waist height",
                "route": "From the kitchen door, the dining table is straight ahead, about three steps, "
                         "with a chair on each side.",
            },
            {
                "label": "the counter along the left-hand wall",
                "names": ("counter", "worktop", "countertop"),
                "cues": (),
                "height": "about waist height",
                "route": "From the kitchen door, turn left and walk about three steps to the counter that "
                         "runs along the left-hand wall.",
            },
            {
                "label": "the fridge in the far right-hand corner",
                "names": ("fridge", "refrigerator"),
                "cues": (),
                "height": "",
                "route": "From the kitchen door, walk ahead past the right side of the dining table, about "
                         "six steps; the fridge is against the right-hand wall at the far end.",
            },
            {
                "label": "the cooker on the right-hand wall",
                "names": ("cooker", "stove", "oven", "hob"),
                "cues": (),
                "height": "about waist height",
                "route": "From the kitchen door, the cooker is about three steps ahead and to your right, "
                         "against the right-hand wall.",
            },
        ],
        "obstacles": "Chairs stand on both sides of the dining table.",
    },
}


def guide_for(room: str, surface_text: str, cue_text: str = "") -> dict | None:
    """
    The layout entry for the surface an object is on, or None.

    `surface_text` is what vision said the object rests on ("on the
    nightstand"); `cue_text` is everything else it said about the spot
    ("next to the lamp, by the window"), used to tell twin surfaces apart.
    """
    guide = GUIDES.get(room)
    if not guide:
        return None
    surface_text = (surface_text or "").lower()
    cue_text = (cue_text or "").lower()
    matches = [s for s in guide["surfaces"] if any(n in surface_text for n in s["names"])]
    if not matches:
        return None
    if len(matches) > 1:
        scored = sorted(matches, key=lambda s: -sum(c in cue_text or c in surface_text for c in s["cues"]))
        matches = scored
    return {**matches[0], "room": room, "entrance": guide["entrance"], "obstacles": guide["obstacles"]}

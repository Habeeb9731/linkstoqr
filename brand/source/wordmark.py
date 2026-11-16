"""Outline "Links to QR" in Inter Bold as SVG path data, with a custom Q whose tail is a square module.

Usage: wordmark.py <Inter-Bold.ttf> <out.json>
Writes {"d": path data (y down, baseline at y=0, x from 0), "width", "cap", "tail": [x, y, size], "upm"} in font units.
"""
import json
import sys

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

TEXT = "Links to QR"
TRACKING = -0.01  # em; Inter Bold at display size wants slightly tighter spacing

font = TTFont(sys.argv[1])
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
hmtx = font["hmtx"]
cap = font["OS/2"].sCapHeight

# Kerning from the GPOS pair table would need shaping; use the font's legacy/class kerning via a simple lookup.
def kern(left, right):
    try:
        from fontTools.ttLib.tables import otTables  # noqa: F401
        gpos = font["GPOS"].table
    except KeyError:
        return 0
    for lookup in gpos.LookupList.Lookup:
        if lookup.LookupType not in (2, 9):
            continue
        for sub in lookup.SubTable:
            if lookup.LookupType == 9:
                sub = sub.ExtSubTable
            if not hasattr(sub, "Coverage") or getattr(sub, "Format", None) not in (1, 2):
                continue
            cov = sub.Coverage.glyphs
            if left not in cov:
                continue
            if sub.Format == 1:
                ps = sub.PairSet[cov.index(left)]
                for rec in ps.PairValueRecord:
                    if rec.SecondGlyph == right and rec.Value1 is not None:
                        return getattr(rec.Value1, "XAdvance", 0) or 0
            elif sub.Format == 2:
                c1 = sub.ClassDef1.classDefs.get(left, 0)
                c2 = sub.ClassDef2.classDefs.get(right, 0)
                rec = sub.Class1Record[c1].Class2Record[c2]
                if rec.Value1 is not None:
                    v = getattr(rec.Value1, "XAdvance", 0) or 0
                    if v:
                        return v
    return 0


svg = SVGPathPen(None)
x = 0.0
names = [cmap[ord(ch)] for ch in TEXT]
tail = None
for i, name in enumerate(names):
    ch = TEXT[i]
    draw_name = cmap[ord("O")] if ch == "Q" else name
    if ch != " ":
        rec = DecomposingRecordingPen(glyphs)
        glyphs[draw_name].draw(rec)
        # flip y so the path is y-down with the baseline at 0
        rec.replay(TransformPen(svg, (1, 0, 0, -1, x, 0)))
        if ch == "Q":
            # The Q is drawn as the O; the caller adds the square tail. Report the O's box (y-down, baseline 0).
            bp = BoundsPen(glyphs)
            glyphs[draw_name].draw(bp)
            xmin, ymin, xmax, ymax = bp.bounds
            tail = [x + xmin, -ymax, x + xmax, -ymin]
    adv = hmtx[draw_name][0]
    nxt = names[i + 1] if i + 1 < len(names) else None
    x += (0.05 * upm if ch == "Q" else 0)  # room for the square tail
    x += adv + (kern(name, nxt) if nxt else 0) + (TRACKING * upm if nxt else 0)

json.dump({"d": svg.getCommands(), "width": x, "cap": cap, "upm": upm, "o_box": tail}, open(sys.argv[2], "w"))
print(f"width {x:.0f} units, cap height {cap}, upm {upm}, O box {tail}")

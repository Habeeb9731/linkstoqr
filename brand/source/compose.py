"""Compose the Links to QR master artwork (symbol, horizontal, stacked, wordmark) from the symbol geometry and the
outlined Inter Bold wordmark. Usage: compose.py <wordmark.json> <out_dir>"""
import json
import os
import re
import sys

INK = "#17181A"
ORANGE = "#E8431A"

wm = json.load(open(sys.argv[1]))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)

# Symbol (v4): frame band 36 with the corner opened; the centre square steps out across the corner (gap 16).
FRAME = "M34 34 H202 V134 H166 V70 H70 V166 H134 V202 H34 Z"
SQUARE = (150, 150, 72)  # x, y, side
SYMBOL_BOX = (34, 34, 222, 222)

CAP = 100.0  # wordmark cap height in lockup units
S = CAP / wm["cap"]
# Q tail: proportions mirror the symbol (square starts ~70 % across the bowl and steps past its edge).
ox0, oy0, ox1, oy1 = wm["o_box"]
ow, oh = ox1 - ox0, oy1 - oy0
TAIL_SIDE = 0.33 * ow
TAIL_X = ox0 + 0.86 * ow - TAIL_SIDE / 2
TAIL_Y = oy0 + 0.96 * oh - TAIL_SIDE / 2


def num(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def scale_path(d, s, dx, dy):
    """Scale and translate absolute path data (SVGPathPen output uses absolute M/L/Q/C/Z)."""
    tokens = re.findall(r"[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?", d)
    res, i, cmd = [], 0, None
    while i < len(tokens):
        t = tokens[i]
        if re.match(r"[A-Za-z]", t):
            cmd = t
            res.append(t)
            i += 1
            continue
        if cmd in "HV":
            v = float(t)
            res.append(num(v * s + (dx if cmd == "H" else dy)))
            i += 1
        else:
            x, y = float(tokens[i]), float(tokens[i + 1])
            res.append(f"{num(x * s + dx)} {num(y * s + dy)}")
            i += 2
    return " ".join(res)


def wordmark(dx, baseline, colours=True):
    letters = scale_path(wm["d"], S, dx, baseline)
    tx, ty, side = TAIL_X * S + dx, TAIL_Y * S + baseline, TAIL_SIDE * S
    tail_fill = ORANGE if colours else INK
    return (f'<g id="wordmark"><path fill="{INK}" d="{letters}"/>'
            f'<rect fill="{tail_fill}" x="{num(tx)}" y="{num(ty)}" width="{num(side)}" height="{num(side)}"/></g>')


def symbol(dx=0, dy=0, k=1.0):
    frame = scale_path(FRAME, k, dx, dy)
    x, y, side = SQUARE
    return (f'<g id="symbol"><path fill="{INK}" d="{frame}"/>'
            f'<rect fill="{ORANGE}" x="{num(x * k + dx)}" y="{num(y * k + dy)}" width="{num(side * k)}" '
            f'height="{num(side * k)}"/></g>')


def write(name, w, h, body, title="Links to QR logo"):
    with open(os.path.join(out, name), "w") as fh:
        fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {num(w)} {num(h)}" width="{num(w)}" '
                 f'height="{num(h)}" role="img"><title>{title}</title>{body}</svg>\n')


# Symbol on the 256 canvas.
write("linkstoqr-symbol.svg", 256, 256, symbol())

# Wordmark only: tight box, padding = 0.24 cap.
pad = 24
wm_w = wm["width"] * S
tail_bottom = TAIL_Y * S + TAIL_SIDE * S
write("linkstoqr-wordmark.svg", wm_w + 2 * pad, CAP + max(tail_bottom, 0) + 2 * pad,
      wordmark(pad, pad + CAP))

# Horizontal: symbol box 188 tall on a 256-high canvas; gap = 1.5 × frame band (54); cap height centred on the
# frame (34..202), so the escaping square hangs below like the Q's tail.
sym_w = SYMBOL_BOX[2] - SYMBOL_BOX[0]
gap = 54
baseline = (34 + 202) / 2 + CAP / 2
total_w = 34 + sym_w + gap + wm_w + 34
write("linkstoqr-horizontal.svg", total_w, 256, symbol(0, 0) + wordmark(34 + sym_w + gap, baseline))

# Stacked: symbol centred above, wordmark below; gap = frame band.
stack_w = max(256, wm_w + 68)
sym_dx = (stack_w - 256) / 2
wm_dx = (stack_w - wm_w) / 2
stack_baseline = 222 + 36 + CAP + 8
write("linkstoqr-stacked.svg", stack_w, stack_baseline + 34 + 8,
      symbol(sym_dx, 0) + wordmark(wm_dx, stack_baseline))

# Small-size symbol (favicon source): same drawing, cropped tighter so it fills the 16 px square.
# On-dark artwork: frame and letters white, the escaping square stays orange (4.65 : 1 on #121315).
for name in ["linkstoqr-symbol", "linkstoqr-horizontal", "linkstoqr-stacked", "linkstoqr-wordmark"]:
    with open(os.path.join(out, name + ".svg")) as fh:
        svg = fh.read()
    with open(os.path.join(out, name + "-on-dark.svg"), "w") as fh:
        fh.write(svg.replace(f'fill="{INK}"', 'fill="#FFFFFF"'))

k = 256 / sym_w * 0.94
off = (256 - sym_w * k) / 2 - SYMBOL_BOX[0] * k
write("linkstoqr-symbol-small.svg", 256, 256, symbol(off, off, k).replace('id="symbol"', 'id="symbol-small"'))
print("wrote", sorted(os.listdir(out)))

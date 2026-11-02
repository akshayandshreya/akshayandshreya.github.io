#!/usr/bin/env python3
"""The site's own aripan (QA r1 D1): the invitation's Mithila aripan with the four corner motifs redrawn.

The invitation's corner "buds" (an almond with one dot inside on a curled stem, set at 45 degrees) read as fish at
display size, and fish in the four corners is exactly the classic Maithil aripan layout, so a Maithili guest sees a
fish first. The owner's rule is no fish anywhere. Each corner now holds a closed lotus bud (kali) on a straight stem,
pointing along the diagonal towards the corner: the sepal cup, the centre petal with two veins and a side petal's tip
on either side (no dot inside), and three sindoor dots in a triangle beyond its tip. Everything else is the invitation's own aripan, the same ribbons in
a new order (QA r1 D2: the draw-on runs from the centre outwards, the lotus petals in opposite pairs), so the brush
phases of the seeded generator differ slightly from the invitation's file.

Reads the invitation's motif library (read-only) and writes the line and paint SVGs next to this file:
    python3 -I tools/motifs/aripan_site.py [/path/to/WeddingInvite2]
    -> tools/motifs/src/aripan_line.svg, tools/motifs/src/aripan_paint.svg
tools/motifs/optimize.mjs (line art) and tools/plates/export.mjs (the ghost sprite) prefer these files to the
invitation's.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
INVITE = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('WEDDING_INVITE_SRC') or os.path.join(HERE, '..', '..', '..', 'WeddingInvite2'))
sys.path.insert(0, os.path.join(INVITE, 'assets', 'motifs', 'tools'))

from mlib import Motif, C, arc, frame, fmt, d_poly, f_gouache, f_wash, f_brush, g  # noqa: E402
from motifs_a import petal  # noqa: E402


def corner_bud(m, cx, cy, ang):
    """A closed lotus bud (kali) on a straight stem, its tip towards the corner (frame u = outwards along the diagonal):
    the sepal cup, the centre petal with two veins and a side petal's tip peeking out on either side, like the
    invitation's own lotus bud; then three sindoor dots in a triangle beyond the tip."""
    d = (math.sin(math.radians(ang)), -math.cos(math.radians(ang)))
    F = frame((cx + d[0] * 318, cy + d[1] * 318), ang)
    # stem: straight, from just outside the double circle to the cup
    m.s([F(0, 0), F(24, 0.6), F(50, 0)], 4.5, a=0.1, b=0.4, w0=0.5, w1=0.2)
    # the sepals: one cup under the bud, open towards the tip
    m.s([F(68, -29), F(56, -20), F(50, 0), F(56, 20), F(68, 29)], 4, a=0.2, b=0.3, w0=0.3, w1=0.2)
    for s in (-1, 1):
        # a side petal: its outer edge from the foot to a pointed tip, then the short return behind the centre petal
        m.s([F(54, 6 * s), F(64, 27 * s), F(90, 34 * s), F(116, 30 * s), F(134, 24 * s)], 4.5, a=0.12, b=0.4, w0=0.5, w1=0.1)
        m.s([F(134, 24 * s), F(121, 15 * s), F(108, 10 * s)], 3.4, a=0.2, b=0.5, w0=0.5, w1=0.1)
    for s in (-1, 1):
        # the centre petal: two edges meeting at the bud's tip
        m.s([F(58, 3 * s), F(80, 19 * s), F(108, 19 * s), F(134, 8 * s), F(154, 0)], 5, a=0.12, b=0.4, w0=0.5, w1=0.1)
    for s in (-1, 1):
        m.s([F(84, 5 * s), F(110, 6 * s), F(132, 2 * s)], 2.6, a=0.2, b=0.6, w0=0.6, w1=0.05)
    # three sindoor dots in a triangle beyond the tip, the apex towards the corner
    dots = [F(196, 0), F(178, -16), F(178, 16)]
    for x, y in dots:
        m.dot(x, y, 5.5)
    return dots


def aripan():
    m = Motif('aripan', 1000, 1000, 'Mithila aripan (pithar line work): ashtadal lotus in a double-lined square', ink='#7a3326')
    cx, cy = 500, 500
    S = 400
    sq = lambda s: [(cx - s, cy - s), (cx + s, cy - s), (cx + s, cy + s), (cx - s, cy + s)]
    P = lambda r, a: (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
    # Drawing order (the order of the ribbons is the draw-on order, QA r1 D2): from the centre outwards, the lotus
    # petals in opposite pairs (top and bottom, right and left, then the diagonals), so a half-drawn aripan is always
    # a smaller whole flower and never three petals on one side; then the circles, the square border, the corners.
    m.dot(cx, cy, 7)
    m.raw(arc(cx, cy, 24, -90, 268, step=2.5), 4, a=0.1, b=0.2, w0=0.5, w1=0.4)
    m.raw(arc(cx, cy, 40, -90, 268, step=2.5), 6, a=0.1, b=0.2, w0=0.5, w1=0.4)
    # ashtadal kamal: 8 double-outlined petals
    for i in (0, 4, 2, 6, 1, 5, 3, 7):
        a = i * 45 - 90
        l, r, poly, pv = petal(P(46, a), a + 90, 222, 132)
        m.raw(l, 7, a=0.12, b=0.4, w0=0.5, w1=0.12)
        m.raw(r, 7, a=0.12, b=0.4, w0=0.5, w1=0.12)
        l2, r2, _, _ = petal(P(66, a), a + 90, 168, 92)
        m.raw(l2, 4, a=0.12, b=0.4, w0=0.5, w1=0.12)
        m.raw(r2, 4, a=0.12, b=0.4, w0=0.5, w1=0.12)
        # kachni hatching inside the inner petal
        for k in range(3):
            u = 70 + k * 30
            m.s([pv(u, -0.2 * 92 * (1 - u / 260)), pv(u + 10, 0), pv(u, 0.2 * 92 * (1 - u / 260))], 2.6, a=0.2, b=0.4, w0=0.6, w1=0.3)
    # sindoor dots between petals
    for i in (0, 4, 2, 6, 1, 5, 3, 7):
        m.dot(*P(256, i * 45 - 67.5), 7)
    # double circle
    for r, w in ((282, 5), (300, 6)):
        for q in range(2):
            m.raw(arc(cx, cy, r, q * 180 - 88, q * 180 + 90, step=2.5), w, a=0.08, b=0.15, w0=0.5, w1=0.4)

    def side_strokes(s, w):
        c = sq(s)
        for i in range(4):
            a, b = c[i], c[(i + 1) % 4]
            pts = [a, ((a[0] * 2 + b[0]) / 3 + (2 if i % 2 else 0), (a[1] * 2 + b[1]) / 3 + (0 if i % 2 else 2)), ((a[0] + b[0] * 2) / 3, (a[1] + b[1] * 2) / 3), b]
            m.s(pts, w, a=0.06, b=0.12, w0=0.6, w1=0.5, swell=0.04)
    side_strokes(S, 6)
    side_strokes(S + 26, 6)
    # triangle (zig-zag) band between the two squares - the classic Mithila double border
    c1, c2 = sq(S + 26), sq(S)
    for i in range(4):
        a1, b1 = c1[i], c1[(i + 1) % 4]
        a2, b2 = c2[i], c2[(i + 1) % 4]
        N = 16
        pts = []
        for k in range(N + 1):
            t = k / N
            o = (a1[0] + (b1[0] - a1[0]) * t, a1[1] + (b1[1] - a1[1]) * t) if k % 2 == 0 else (a2[0] + (b2[0] - a2[0]) * t, a2[1] + (b2[1] - a2[1]) * t)
            pts.append(o)
        m.s(pts, 3.6, spline=False, a=0.05, b=0.1, w0=0.6, w1=0.5, swell=0.02)
    # corner lotus buds (site, QA r1 D1): towards each corner of the square, never a fish
    corner_dots = []
    for ang in (315, 135, 45, 225):
        corner_dots += corner_bud(m, cx, cy, ang)

    parts = []
    gnd = [f'<rect x="30" y="30" width="940" height="940" rx="14" style="fill:{C("ground", "#c4a274")}"/>',
           m.rib([(60, 300), (500, 200), (940, 330)], 220, 'ground-sh', 0.18, w0=0.3, w1=0.2),
           m.rib([(80, 760), (500, 840), (920, 700)], 200, 'ground-sh', 0.16, w0=0.3, w1=0.2)]
    parts.append(g('aripan-ground', [g(None, gnd, filt='aripan-wash')]))
    # turmeric fill inside the inner petals, vermilion centre
    fills = []
    for i in range(8):
        a = i * 45 - 90
        _, _, poly, _ = petal(P(66, a), a + 90, 168, 92)
        fills.append(m.fill(poly, 'marigold-hi', 0.75, spline=False))
    fills.append(f'<circle cx="500" cy="500" r="40" style="fill:{C("red")}" opacity=".85"/>')
    parts.append(g('aripan-fills', fills, filt='aripan-gouache'))
    paste = []
    for (Pp, poly, mw) in m.strokes:
        paste.append(f'<path d="{d_poly(poly)}"/>')
    parts.append(g('aripan-paste', f'<g style="fill:{C("ivory")}">{"".join(paste)}</g>', filt='aripan-gouache'))
    dots = [f'<circle cx="{fmt(P(256, i*45-67.5)[0])}" cy="{fmt(P(256, i*45-67.5)[1])}" r="8" style="fill:{C("red")}"/>' for i in range(8)]
    dots += [f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="6.5" style="fill:{C("red")}"/>' for x, y in corner_dots]
    parts.append(g('aripan-sindoor', dots, filt='aripan-gouache'))
    fil = [f_gouache('aripan-gouache', disp=3, tex=0.86), f_wash('aripan-wash', 1.6, 6), f_brush('aripan-brush')]
    return m.line_svg(), m.paint_svg('\n'.join(parts), fil), m


if __name__ == '__main__':
    line, paint, m = aripan()
    out = os.path.join(HERE, 'src')
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'aripan_line.svg'), 'w') as f:
        f.write(line)
    with open(os.path.join(out, 'aripan_paint.svg'), 'w') as f:
        f.write(paint)
    print(f'aripan (site): strokes={len(m.strokes)} line={len(line) // 1024} KB paint={len(paint) // 1024} KB -> {out}')

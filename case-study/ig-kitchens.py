"""Story-led post images from the 26 Sep shoot (no product claims). 1080x1350."""
import matplotlib.pyplot as plt
from matplotlib.image import imread
from brand import *

def slide(path, out, lines, kicker, sub, top=True):
    img = imread(path); h, w = img.shape[:2]; t = 1350 / 1080
    ch = min(h, int(w * t)); cw = int(ch / t); x0 = (w - cw) // 2
    img = img[h - ch:, x0:x0 + cw] if top else img[:ch, x0:x0 + cw]
    fig = plt.figure(figsize=(7.2, 9)); ax = fig.add_axes([0, 0, 1, 1]); ax.imshow(img); ax.axis("off")
    y0 = .73 if top else 0
    fig.add_artist(plt.Rectangle((0, y0), 1, .27, transform=fig.transFigure, color=INK, alpha=.9))
    fig.text(.07, y0 + .225, kicker, color=TERRACOTTA, fontsize=10, weight="bold")
    for i, l in enumerate(lines): fig.text(.07, y0 + .16 - i * .055, l, family=DISPLAY, fontsize=25, color=PAPER)
    fig.text(.07, y0 + .035, sub, family=SERIF, fontsize=15, style="italic", color=TERRACOTTA)
    fig.savefig(out, dpi=150); plt.close(fig)

slide("photos/shoot-desk.jpg", "ig-kitchens-1.png", ["I RAN 120+ KITCHENS", "ACROSS MULTIPLE FOOD BRANDS."], "THE REAL WORLD TAUGHT ME", "Next: 100 brands, one operating system.")

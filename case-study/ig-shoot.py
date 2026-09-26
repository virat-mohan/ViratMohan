"""Pay with a Post carousel from the 26 Sep content shoot. 1080x1350 each."""
import matplotlib.pyplot as plt
from matplotlib.image import imread
from brand import *

def photo_slide(path, out, lines, kicker, sub=None, top=False):
    img = imread(path); h, w = img.shape[:2]
    target = 1350 / 1080
    # crop to 4:5 from the top-centre
    ch = min(h, int(w * target)); cw = int(ch / target)
    x0 = (w - cw) // 2; img = img[h - ch:, x0:x0 + cw] if top else img[:ch, x0:x0 + cw]
    fig = plt.figure(figsize=(7.2, 9))
    ax = fig.add_axes([0, 0, 1, 1]); ax.imshow(img); ax.axis("off")
    y0 = .73 if top else 0
    band = plt.Rectangle((0, y0), 1, .27, transform=fig.transFigure, color=INK, alpha=.9); fig.add_artist(band)
    fig.text(.07, y0 + .225, kicker, color=TERRACOTTA, fontsize=10, weight="bold")
    for i, l in enumerate(lines):
        fig.text(.07, y0 + .16 - i * .055, l, family=DISPLAY, fontsize=25, color=PAPER)
    if sub: fig.text(.07, y0 + .035, sub, family=SERIF, fontsize=15, style="italic", color=TERRACOTTA)
    fig.savefig(out, dpi=150); plt.close(fig)

photo_slide("photos/shoot-desk.jpg", "ig-shoot-1.png",
            ["SOMEONE BOUGHT SUNGLASSES", "WITHOUT PAYING MONEY."], "PAY WITH A POST", "They paid with a post. Swipe →", top=True)
photo_slide("photos/shoot-bts.jpg", "ig-shoot-2.png",
            ["2 OF THE FIRST 4", "CUSTOMERS CHOSE IT."], "FROM MY CONTENT SHOOT", "Let's talk.")

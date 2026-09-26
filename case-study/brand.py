"""viratmohan.com look for case-study images. Tokens mirror src/styles/global.css."""
from pathlib import Path
import matplotlib; matplotlib.use("Agg")
from matplotlib import font_manager as fm, pyplot as plt

PAPER, INK, DIM, GOLD, TERRACOTTA, LINE = "#f4ead4", "#1a1410", "#5a4c3c", "#d4af37", "#d9714b", "#17130f24"
for f in (Path(__file__).parent / "fonts").glob("*.ttf"):
    fm.fontManager.addfont(str(f))
# DejaVu fallback supplies ₹, which the latin font subsets lack.
DISPLAY, SERIF, SANS = ["Anton", "DejaVu Sans"], ["Instrument Serif", "DejaVu Serif"], ["Inter", "DejaVu Sans"]
plt.rcParams.update({"font.family": SANS, "text.color": INK, "axes.labelcolor": DIM,
                     "xtick.color": DIM, "ytick.color": DIM, "figure.facecolor": PAPER, "axes.facecolor": PAPER})

def frame(fig, kicker, title, dek, source):
    fig.text(.06, .925, kicker.upper(), color=TERRACOTTA, fontsize=12, weight="bold")
    fig.text(.06, .845, title.upper(), family=DISPLAY, fontsize=34, color=INK)
    fig.text(.06, .8, dek, family=SERIF, fontsize=17, color=DIM, style="italic")
    fig.add_artist(plt.Line2D([.06, .94], [.78, .78], color=GOLD, lw=1.2))
    fig.text(.06, .07, source, color=DIM, fontsize=8.5, linespacing=1.3)
    fig.text(.06, .03, "viratmohan.com/devshop", color=INK, fontsize=10, weight="bold")

def clean(ax):
    for s in ax.spines.values(): s.set_visible(False)
    ax.tick_params(length=0); ax.grid(axis="y", color=LINE); ax.set_axisbelow(True)

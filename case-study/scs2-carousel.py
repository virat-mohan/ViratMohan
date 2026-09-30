"""SCS 2 — white-label carousel for Instagram (1080x1350, 4:5). Real numbers from the brand's own Meta
Ads Manager (status note dated 28 Sep 2026), brand name withheld per Virat's rule. Percentage/multiple
only — no rupee figures, since the real spend here is tiny and reads as unimpressive; the ROAS swing
is the genuinely strong number."""
import matplotlib.pyplot as plt
from brand import *

before, after = 0.7, 2.1  # Meta ROAS (x), 3 days before autopilot vs 3 days since 26 Sep 2026

def slide(n):
    fig = plt.figure(figsize=(7.2, 9)); fig.text(.08, .945, "RESULT 02 · DEVSHOP RETAIL OS", color=TERRACOTTA, fontsize=10, weight="bold")
    fig.text(.92, .945, f"{n}/2", color=DIM, fontsize=10, ha="right"); fig.text(.08, .035, "viratmohan.com/devshop", fontsize=9, weight="bold")
    return fig

# Slide 1: the hook
fig = slide(1)
fig.text(.08, .86, "RETAIL OS TOOK OVER THE ADS", family=DISPLAY, fontsize=27)
fig.text(.08, .81, "FROM A HUMAN.", family=DISPLAY, fontsize=27)
fig.text(.05, .47, f"+{after/before-1:.0%}", family=DISPLAY, fontsize=170, color=TERRACOTTA)
fig.text(.08, .41, "META RETURN ON AD SPEND", family=DISPLAY, fontsize=30)
fig.text(.08, .365, "in the first 3 days.", family=SERIF, fontsize=20, color=DIM, style="italic")
fig.add_artist(plt.Line2D([.08, .92], [.3, .3], color=GOLD, lw=1.2))
fig.text(.08, .2, "Swipe for what changed →", family=SERIF, fontsize=15, style="italic")
fig.savefig("scs2-carousel-1.png", dpi=150)

# Slide 2: the proof — ROAS before/after as a multiple, plus what actually changed (no daily order
# series exists for this brand the way it does for SCS 1, so the second slide is the ROAS bar + the
# real operational changes instead of a day-by-day chart).
fig = slide(2)
fig.text(.08, .86, "A GIFTING & CATERING BRAND,", family=DISPLAY, fontsize=24)
fig.text(.08, .82, "ADS ON A STRICT 4X RULE.", family=DISPLAY, fontsize=24)
ax = fig.add_axes([.14, .5, .3, .28]); clean(ax)
ax.bar(["Before", "After"], [before, after], color=[INK, TERRACOTTA], width=.55)
ax.set_ylim(0, 2.6)
for i, v in enumerate([before, after]):
    ax.text(i, v + .08, f"{v:.1f}x", ha="center", fontsize=13, weight="bold", family=DISPLAY)
ax.set_ylabel("Meta ROAS (x)", fontsize=9); ax.tick_params(labelsize=9)
bullets = ["Loss-making ad sets paused; the ones that convert stay live",
           "Every rupee re-targeted at past customers, not cold traffic alone",
           "Budget scales only above the 4x rule — never on hope"]
y = .46
for b in bullets:
    fig.text(.52, y, "→", family=DISPLAY, fontsize=13, color=TERRACOTTA)
    fig.text(.565, y, b, fontsize=11.5, color=INK, wrap=True)
    y -= .07
fig.add_artist(plt.Line2D([.08, .92], [.31, .31], color=GOLD, lw=1.2))
fig.text(.08, .235, "Retail OS picks the campaigns, sets the budget", family=DISPLAY, fontsize=18)
fig.text(.08, .2, "and kills what doesn't sell. No human media buyer.", family=DISPLAY, fontsize=18)
fig.text(.08, .13, "Let's talk.", family=SERIF, fontsize=20, style="italic", color=TERRACOTTA)
fig.text(.08, .075, "Source: brand's Meta Ads Manager, 3-day windows immediately before and after autopilot\nwent on, 26 Sep 2026 — a small window, early days. Revenue not shown.", fontsize=6.5, color=DIM)
fig.savefig("scs2-carousel-2.png", dpi=150)

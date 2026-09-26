"""White-label SCS carousel for Instagram (1080x1350, 4:5). Same data as travaholic.py, brand name removed."""
from datetime import datetime as D, timedelta as T
import matplotlib.dates as md, matplotlib.pyplot as plt
from brand import *

o = {11: 1399, 12: 1399, 14: 1259, 19: 2965, 22: 1526, 23: 2890, 26: 4197}
days = [D(2026, 9, d) for d in range(11, 27)]; rev = [o.get(d.day, 0) for d in days]; auto = D(2026, 9, 24)
before, after = 11438 / 13, 4197 / 3

def slide(n):
    fig = plt.figure(figsize=(7.2, 9)); fig.text(.08, .945, "SCS · DEVSHOP RETAIL OS", color=TERRACOTTA, fontsize=10, weight="bold")
    fig.text(.92, .945, f"{n}/2", color=DIM, fontsize=10, ha="right"); fig.text(.08, .035, "viratmohan.com/devshop", fontsize=9, weight="bold")
    return fig

# Slide 1: the hook
fig = slide(1)
fig.text(.08, .86, "A D2C CAP BRAND HANDED", family=DISPLAY, fontsize=27)
fig.text(.08, .81, "ITS ADS TO AUTOPILOT.", family=DISPLAY, fontsize=27)
fig.text(.05, .47, f"+{after/before-1:.0%}", family=DISPLAY, fontsize=170, color=TERRACOTTA)
fig.text(.08, .41, "MORE SALES PER DAY", family=DISPLAY, fontsize=32)
fig.text(.08, .365, "in the first 3 days.", family=SERIF, fontsize=20, color=DIM, style="italic")
fig.add_artist(plt.Line2D([.08, .92], [.3, .3], color=GOLD, lw=1.2))
for i, (b, s) in enumerate([("₹880 → ₹1,399", "revenue per day"), ("₹4,197", "biggest day ever")]):
    fig.text(.08 + i * .47, .215, b, family=DISPLAY, fontsize=24, color=TERRACOTTA if i == 0 else INK)
    fig.text(.08 + i * .47, .18, s, fontsize=10, color=DIM)
fig.text(.08, .1, "Swipe for the daily numbers →", family=SERIF, fontsize=15, style="italic")
fig.savefig("scs-carousel-1.png", dpi=150)

# Slide 2: the proof
fig = slide(2)
fig.text(.08, .86, "EVERY DAY SINCE THE FIRST ORDER", family=DISPLAY, fontsize=24)
fig.text(.08, .82, "Dashed lines: average revenue per day, before vs after.", family=SERIF, fontsize=13, color=DIM, style="italic")
ax = fig.add_axes([.11, .4, .83, .38]); clean(ax)
ax.axvspan(auto - T(.5), days[-1] + T(.7), color=GOLD, alpha=.16, lw=0)
ax.bar(days, rev, color=[TERRACOTTA if d >= auto else INK for d in days], width=.66)
for x0, x1, v, c in [(days[0], D(2026, 9, 23), before, DIM), (auto, days[-1], after, TERRACOTTA)]:
    ax.hlines(v, x0 - T(.4), x1 + T(.4), colors=c, lw=2, ls="--")
ax.text(days[-1] + T(.6), 4900, "AUTOPILOT ON", family=DISPLAY, color=TERRACOTTA, fontsize=12, ha="right")
ax.text(days[-1], 4197 + 100, "₹4,197", ha="center", fontsize=8.5, weight="bold")
ax.set_ylim(0, 5400); ax.set_xlim(days[0] - T(.7), days[-1] + T(.7))
ax.set_xticks(days[::3]); ax.xaxis.set_major_formatter(md.DateFormatter("%d %b")); ax.tick_params(labelsize=8.5)
ax.set_ylabel("₹ per day", fontsize=9)
fig.add_artist(plt.Line2D([.08, .92], [.31, .31], color=GOLD, lw=1.2))
fig.text(.08, .235, "Retail OS picks the campaigns, sets the budget", family=DISPLAY, fontsize=18)
fig.text(.08, .2, "and kills what doesn't sell. No agency, no guesswork.", family=DISPLAY, fontsize=18)
fig.text(.08, .13, "Want this for your brand? DM \"AUTOPILOT\".", family=SERIF, fontsize=16, style="italic", color=TERRACOTTA)
fig.text(.08, .075, "Source: brand's order database, non-cancelled orders, 11–26 Sep 2026. Before: ₹11,438 over 13 days.\nAfter: ₹4,197 over 3 days (1 order). ROAS not shown.", fontsize=6.5, color=DIM)
fig.savefig("scs-carousel-2.png", dpi=150)

from datetime import datetime as D, timedelta as T
import matplotlib.dates as md, matplotlib.pyplot as plt
from brand import *

# Non-cancelled orders by day, Travaholic Caps Supabase `orders`, pulled 26 Sep 2026.
o = {11: 1399, 12: 1399, 14: 1259, 19: 2965, 22: 1526, 23: 2890, 26: 4197}
days = [D(2026, 9, d) for d in range(11, 27)]; rev = [o.get(d.day, 0) for d in days]; auto = D(2026, 9, 24)
before, after = 11438 / 13, 4197 / 3            # ₹/day, 11–23 Sep vs 24–26 Sep
lift = after / before - 1                        # +59%

fig = plt.figure(figsize=(12, 13.5))
fig.text(.06, .955, "SCS · SUCCESSFUL CASE STUDY · DEVSHOP RETAIL OS", color=TERRACOTTA, fontsize=13, weight="bold")
fig.text(.06, .905, "TRAVAHOLIC CAPS WENT ON AUTOPILOT.", family=DISPLAY, fontsize=36, color=INK)
fig.text(.045, .7, f"+{lift:.0%}", family=DISPLAY, fontsize=190, color=TERRACOTTA)
fig.text(.62, .815, "MORE SALES", family=DISPLAY, fontsize=40, color=INK); fig.text(.62, .775, "PER DAY", family=DISPLAY, fontsize=40, color=INK)
fig.text(.62, .72, "in the first 3 days after\nRetail OS took over the ads", family=SERIF, fontsize=19, color=DIM, style="italic")
fig.add_artist(plt.Line2D([.06, .94], [.685, .685], color=GOLD, lw=1.5))

stats = [("₹880 → ₹1,399", "revenue per day,\nbefore vs after"),
         ("₹4,197", "biggest day ever,\n+42% on the previous best"),
         ("4 CAPS", "largest single order,\n2.9× the average basket")]
for i, (big, small) in enumerate(stats):
    x = .06 + i * .305
    fig.text(x, .615, big, family=DISPLAY, fontsize=31, color=INK if i else TERRACOTTA)
    fig.text(x, .565, small, fontsize=11.5, color=DIM, linespacing=1.35)
fig.add_artist(plt.Line2D([.06, .94], [.535, .535], color=GOLD, lw=1.5))

ax = fig.add_axes([.08, .16, .86, .33]); clean(ax)
ax.axvspan(auto - T(.5), days[-1] + T(.7), color=GOLD, alpha=.16, lw=0)
ax.bar(days, rev, color=[TERRACOTTA if d >= auto else INK for d in days], width=.66)
for d, r in zip(days, rev):
    if r: ax.text(d, r + 90, f"₹{r:,}", ha="center", fontsize=10, weight="bold")
for x0, x1, v, c in [(days[0], D(2026, 9, 23), before, DIM), (auto, days[-1], after, TERRACOTTA)]:
    ax.hlines(v, x0 - T(.4), x1 + T(.4), colors=c, lw=2, ls="--")
ax.text(days[-1] + T(.6), 5150, "AUTOPILOT ON · 24 SEP", family=DISPLAY, color=TERRACOTTA, fontsize=14, ha="right")
ax.set_ylim(0, 5600); ax.set_xlim(days[0] - T(.7), days[-1] + T(.7))
ax.set_xticks(days); ax.xaxis.set_major_formatter(md.DateFormatter("%d\n%b"))
ax.set_ylabel("Revenue per day (₹) · dashed = average")

fig.text(.06, .065, "Source: Travaholic Caps order database, non-cancelled orders, 11–26 Sep 2026 (26 Sep partial). Before: ₹11,438 over 13 days, 8 orders.\n"
         "After: ₹4,197 over 3 days, 1 order. Autopilot = Performance Marketing Manager release (commit a8a10c7); the order's visit was tagged Instagram.\n"
         "Previous best day: ₹2,965 (19 Sep). Average basket before: ₹1,430. ROAS not shown: ad spend is held in Meta Ads Manager.",
         color=DIM, fontsize=8.5, linespacing=1.4)
fig.text(.06, .025, "viratmohan.com/devshop", color=INK, fontsize=11, weight="bold")
fig.savefig(__file__.replace(".py", "-scs.png"), dpi=150)

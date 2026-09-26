from datetime import datetime as D, timedelta as T
import matplotlib.dates as md, matplotlib.pyplot as plt
from brand import *

# Non-cancelled orders by day, Travaholic Caps Supabase `orders`, pulled 26 Sep 2026.
o = {11: 1399, 12: 1399, 14: 1259, 19: 2965, 22: 1526, 23: 2890, 26: 4197}
days = [D(2026, 9, d) for d in range(11, 27)]; rev = [o.get(d.day, 0) for d in days]; auto = D(2026, 9, 24)

fig = plt.figure(figsize=(12, 8))
frame(fig, "SCS · Successful Case Study · DevShop Retail OS", "Travaholic Caps: ₹15,635 in 16 days",
      "9 orders from the first sale. After ads went on autopilot, its biggest day yet.",
      "Source: Travaholic Caps order database, non-cancelled orders by day, 11–26 Sep 2026 (26 Sep is a partial day).\n"
      "Autopilot date: Performance Marketing Manager release (commit a8a10c7). The 26 Sep order's visit was tagged Instagram.\n"
      "Ad spend and ROAS not shown: daily spend is held in Meta Ads Manager.")
ax = fig.add_axes([.08, .22, .86, .5]); clean(ax)
ax.axvspan(auto - T(.5), days[-1] + T(.7), color=GOLD, alpha=.16, lw=0)
ax.bar(days, rev, color=[TERRACOTTA if d >= auto else INK for d in days], width=.66)
for d, r in zip(days, rev):
    if r: ax.text(d, r + 90, f"₹{r:,}", ha="center", fontsize=10.5, weight="bold")
ax.text(days[-1] + T(.6), 5150, "AUTOPILOT ADS ON · 24 SEP", family=DISPLAY, color=TERRACOTTA, fontsize=14, ha="right")
ax.set_ylim(0, 5600); ax.set_xlim(days[0] - T(.7), days[-1] + T(.7))
ax.set_xticks(days); ax.xaxis.set_major_formatter(md.DateFormatter("%d\n%b"))
ax.set_ylabel("Revenue per day (₹)")
fig.savefig(__file__.replace(".py", "-scs.png"), dpi=150)

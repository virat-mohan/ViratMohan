from datetime import datetime as D, timedelta as T
import matplotlib.dates as md, matplotlib.pyplot as plt
from brand import *

# Non-cancelled orders by day, Travaholic Caps Supabase `orders`, pulled 26 Sep 2026.
o = {11: 1399, 12: 1399, 14: 1259, 19: 2965, 22: 1526, 23: 2890, 26: 4197}
days = [D(2026, 9, d) for d in range(11, 27)]; rev = [o.get(d.day, 0) for d in days]; auto = D(2026, 9, 24)

fig = plt.figure(figsize=(12, 8))
frame(fig, "SCS · Successful Case Study · DevShop Retail OS", "Travaholic Caps: +59% sales per day on autopilot",
      "Average revenue per day, before vs after ads went on autopilot.",
      "Source: Travaholic Caps order database, non-cancelled orders by day, 11–26 Sep 2026 (26 Sep is a partial day).\n"
      "Autopilot date: Performance Marketing Manager release (commit a8a10c7). The 26 Sep order's visit was tagged Instagram.\n"
      "Before: ₹11,438 over 13 days (11–23 Sep). After: ₹4,197 over 3 days (24–26 Sep, one order). ROAS not shown: ad spend is in Meta Ads Manager.")
ax = fig.add_axes([.08, .2, .86, .42]); clean(ax)
ax.axvspan(auto - T(.5), days[-1] + T(.7), color=GOLD, alpha=.16, lw=0)
ax.bar(days, rev, color=[TERRACOTTA if d >= auto else INK for d in days], width=.66)
for d, r in zip(days, rev):
    if r: ax.text(d, r + 90, f"₹{r:,}", ha="center", fontsize=10.5, weight="bold")
ax.text(days[-1] + T(.6), 5150, "AUTOPILOT ADS ON · 24 SEP", family=DISPLAY, color=TERRACOTTA, fontsize=14, ha="right")
ax.set_ylim(0, 5600); ax.set_xlim(days[0] - T(.7), days[-1] + T(.7))
ax.set_xticks(days); ax.xaxis.set_major_formatter(md.DateFormatter("%d\n%b"))
ax.set_ylabel("Revenue per day (₹)")
for x0,x1,v in [(days[0],D(2026,9,23),880),(auto,days[-1],1399)]:
    ax.hlines(v,x0-T(.4),x1+T(.4),colors=GOLD if v>1000 else DIM,lw=2,ls="--")
fig.text(.06,.685,"₹880/day",family=DISPLAY,fontsize=30,color=DIM,va="bottom")
fig.text(.06,.665,"BEFORE · 11–23 SEP",fontsize=9,color=DIM,weight="bold")
fig.text(.26,.685,"₹1,399/day",family=DISPLAY,fontsize=30,color=TERRACOTTA,va="bottom")
fig.text(.26,.665,"AFTER · 24–26 SEP",fontsize=9,color=TERRACOTTA,weight="bold")
fig.savefig(__file__.replace(".py", "-scs.png"), dpi=150)

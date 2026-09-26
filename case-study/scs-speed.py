"""Two speed SCS drafts (DevShop demos, Retail OS plans). Data: ViratMohan.com Supabase, pulled 26 Sep 2026."""
import matplotlib.pyplot as plt
from brand import *

def slide(n, tag):
    fig = plt.figure(figsize=(7.2, 9))
    fig.text(.08, .945, f"NEW SUCCESSFUL CASE STUDY (SCS) · {tag}", color=TERRACOTTA, fontsize=9.5, weight="bold")
    fig.text(.92, .945, f"{n}/2", color=DIM, fontsize=10, ha="right")
    fig.text(.08, .035, "viratmohan.com/scs", fontsize=9, weight="bold")
    return fig

def hook(name, tag, l1, l2, big, sub, dek, stats):
    fig = slide(1, tag)
    fig.text(.08, .86, l1, family=DISPLAY, fontsize=27); fig.text(.08, .81, l2, family=DISPLAY, fontsize=27)
    fig.text(.06, .5, big, family=DISPLAY, fontsize=150, color=TERRACOTTA)
    fig.text(.08, .43, sub, family=DISPLAY, fontsize=30); fig.text(.08, .385, dek, family=SERIF, fontsize=18, color=DIM, style="italic")
    fig.add_artist(plt.Line2D([.08, .92], [.32, .32], color=GOLD, lw=1.2))
    for i, (b, s) in enumerate(stats):
        fig.text(.08 + i * .47, .235, b, family=DISPLAY, fontsize=24, color=TERRACOTTA if i == 0 else INK)
        fig.text(.08 + i * .47, .2, s, fontsize=10, color=DIM)
    fig.text(.08, .11, "Swipe for every run →", family=SERIF, fontsize=15, style="italic")
    fig.savefig(f"{name}-1.png", dpi=150)

def proof(name, tag, title, labels, secs, unit_note, line1, line2, source, limit=None):
    fig = slide(2, tag)
    fig.text(.08, .86, title, family=DISPLAY, fontsize=24)
    fig.text(.08, .82, unit_note, family=SERIF, fontsize=13, color=DIM, style="italic")
    ax = fig.add_axes([.2, .4, .72, .38]); clean(ax); ax.grid(axis="x", color=LINE); ax.grid(axis="y", visible=False)
    y = range(len(secs))[::-1]
    ax.barh(list(y), secs, color=TERRACOTTA, height=.6)
    fmt = lambda s: f"{s:.1f}s" if s < 10 else f"{s:.0f}s" if s < 120 else f"{int(s//60)}m {int(s%60):02d}s"
    top = max(max(secs), limit or 0)
    for yi, s in zip(y, secs):
        inside = s > top * .8
        ax.text(s - top * .02 if inside else s + top * .02, yi, fmt(s), va="center", ha="right" if inside else "left", fontsize=10, weight="bold", color=PAPER if inside else INK)
    if limit: ax.axvline(limit, color=INK, ls="--", lw=1.5); ax.text(limit, len(secs) - .3, " 2 MIN", family=DISPLAY, fontsize=12, va="bottom")
    ax.set_yticks(list(y)); ax.set_yticklabels(labels, fontsize=9.5); ax.set_xlim(0, top * 1.15); ax.set_xticks([]); ax.tick_params(labelsize=8.5)
    fig.add_artist(plt.Line2D([.08, .92], [.31, .31], color=GOLD, lw=1.2))
    fig.text(.08, .235, line1, family=DISPLAY, fontsize=18); fig.text(.08, .2, line2, family=DISPLAY, fontsize=18)
    fig.text(.08, .13, "Let's talk.", family=SERIF, fontsize=20, style="italic", color=TERRACOTTA)
    fig.text(.08, .075, source, fontsize=6.5, color=DIM)
    fig.savefig(f"{name}-2.png", dpi=150)

# SCS 2: DevShop demos. submissions.created_at -> first generations.created_at
demo = [2.4, 102.5, 101.2, 48.5, 114.5, 101.5]
hook("scs-devshop-demo", "DEVSHOP", "DESCRIBE A BUSINESS PROBLEM.", "GET A WORKING DEMO BACK.",
     "6/6", "DEMOS IN UNDER 2 MINUTES", "Not a mockup. A working demo, every time so far.",
     [("1m 41s", "typical time to demo"), ("2.4s", "fastest")])
proof("scs-devshop-demo", "DEVSHOP", "EVERY DEMO, TIMED", [f"Demo {i}" for i in range(1, 7)], demo,
      "Seconds from problem submitted to working demo.", "No specs, no decks, no discovery calls.", "Problem in, demo out.",
      "Source: DevShop submissions vs generations, 6 Sep – 17 Sep 2026, all 6 runs. Typical = median.", limit=120)

# SCS 3: Retail OS plans. applications.created_at -> design direction / business plan
hook("scs-retailos-plan", "RETAIL OS", "APPLY WITH A BRAND IDEA.", "GET A BUSINESS PLAN BACK.",
     "91s", "TO A FULL BUSINESS PLAN", "Forecast P&L and design direction, before your chai cools.",
     [("52s", "design direction"), ("2 of 3", "brands under 2.5 min")])
proof("scs-retailos-plan", "RETAIL OS", "EVERY APPLICATION, TIMED",
      ["A · design", "A · plan", "B · design", "B · plan", "C · design", "C · plan"],
      [52, 91, 106, 132, 1532, 1569], "Time from application to output.",
      "Design direction and a forecast P&L,", "built for your brand, not a template.",
      "Source: Retail OS applications vs design directions and business plans, 23–24 Sep 2026.\nBrand C took 26 min. One earlier application has no plan yet.")

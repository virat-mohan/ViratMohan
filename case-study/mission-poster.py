"""Mission, vision and culture fundamentals poster, viratmohan.com style. 1600x2200."""
import matplotlib.pyplot as plt
from brand import *

W, H = 8, 11
fig = plt.figure(figsize=(W, H))
# colour hairline like the site nav
for i, c in enumerate([GOLD, "#e91e8c", "#3e6fa6", TERRACOTTA]):
    fig.add_artist(plt.Rectangle((i / 4, .988), .25, .012, transform=fig.transFigure, color=c))

fig.text(.08, .945, "VIRAT MOHAN · DEVSHOP", color=TERRACOTTA, fontsize=10, weight="bold")

fig.text(.08, .895, "MISSION", color=DIM, fontsize=9, weight="bold")
for i, l in enumerate(["GIVE ANY FOUNDER A WORKING", "ONLINE BUSINESS IN 7 DAYS,", "RUN FOR THEM."]):
    fig.text(.08, .855 - i * .04, l, family=DISPLAY, fontsize=27, color=INK)
fig.text(.08, .73, "With results they can see every Monday, proven in public with real numbers.",
         family=SERIF, fontsize=13.5, style="italic", color=DIM)

fig.add_artist(plt.Line2D([.08, .92], [.705, .705], color=GOLD, lw=1.2))
fig.text(.08, .675, "VISION", color=DIM, fontsize=9, weight="bold")
for i, l in enumerate(["A NEW, MORE EFFICIENT WAY", "FOR THE WORLD TO DO BUSINESS."]):
    fig.text(.08, .635 - i * .04, l, family=DISPLAY, fontsize=27, color=TERRACOTTA)
fig.text(.08, .55, "One operating system running thousands of brands better than a full team each,",
         family=SERIF, fontsize=13.5, style="italic", color=DIM)
fig.text(.08, .528, "paid only from the value it creates, and sharing that value with everyone who helps.",
         family=SERIF, fontsize=13.5, style="italic", color=DIM)

fig.add_artist(plt.Line2D([.08, .92], [.5, .5], color=GOLD, lw=1.2))
fig.text(.08, .47, "HOW I WORK", color=DIM, fontsize=9, weight="bold")
items = [
    ("Fair practice", "Standard terms, published openly. No hidden fees."),
    ("Transparency", "Every number visible. Every claim sourced."),
    ("Collective growth", "Founders, customers, partners and staff all win together."),
    ("Positive impact", "Small makers become real brands. Local jobs grow."),
    ("Efficiency", "Machines do the routine. People do what needs people."),
    ("Plain language", "Anyone understands us in one read."),
    ("Keep promises", "Live in 7 days. Honest numbers. Always."),
]
for i, (t, d) in enumerate(items):
    col, row = i % 2, i // 2
    x = .08 + col * .45; y = .425 - row * .088
    fig.text(x, y, f"{i+1:02d}", family=DISPLAY, fontsize=20, color=TERRACOTTA)
    fig.text(x + .055, y + .004, t.upper(), family=DISPLAY, fontsize=15, color=INK)
    fig.text(x + .055, y - .026, d, fontsize=9.2, color=DIM, wrap=True)

fig.text(.08, .045, "viratmohan.com", fontsize=10, weight="bold", color=INK)
fig.text(.92, .045, "Let's talk.", family=SERIF, fontsize=16, style="italic", color=TERRACOTTA, ha="right")
fig.savefig("mission-poster.png", dpi=200)

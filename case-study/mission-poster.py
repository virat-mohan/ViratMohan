"""Passion, mission, vision and how I work, viratmohan.com style. 1600x2600."""
import matplotlib.pyplot as plt
from brand import *
import io, cairosvg
from matplotlib.image import imread
def icon(slug):
    return imread(io.BytesIO(cairosvg.svg2png(url=f'../public/icons/values/{slug}.svg', output_width=160, output_height=160)), format='png')

fig = plt.figure(figsize=(8, 13))
for i, c in enumerate([GOLD, "#e91e8c", "#3e6fa6", TERRACOTTA]):
    fig.add_artist(plt.Rectangle((i / 4, .99), .25, .01, transform=fig.transFigure, color=c))
L = .08
def label(y, t): fig.text(L, y, t, color=DIM, fontsize=9, weight="bold")
def rule(y): fig.add_artist(plt.Line2D([L, .92], [y, y], color=GOLD, lw=1.2))

fig.text(L, .958, "VIRAT MOHAN · DEVSHOP", color=TERRACOTTA, fontsize=10, weight="bold")

label(.92, "PASSION")
for i, l in enumerate(["I love taking something good that someone made,", "and building the machine that gets it to the world."]):
    fig.text(L, .888 - i * .03, l, family=SERIF, fontsize=21, style="italic", color=INK)
rule(.81)

label(.785, "MISSION")
for i, l in enumerate(["GIVE ANY FOUNDER A WORKING", "ONLINE BUSINESS IN 7 DAYS,", "RUN FOR THEM."]):
    fig.text(L, .75 - i * .034, l, family=DISPLAY, fontsize=27, color=INK)
fig.text(L, .645, "With results they can see every Monday, proven in public with real numbers.", family=SERIF, fontsize=13.5, style="italic", color=DIM)
rule(.62)

label(.595, "VISION")
for i, l in enumerate(["A NEW, MORE EFFICIENT WAY", "FOR THE WORLD TO DO BUSINESS."]):
    fig.text(L, .56 - i * .034, l, family=DISPLAY, fontsize=27, color=TERRACOTTA)
fig.text(L, .49, "One operating system running thousands of brands better than a full team each,", family=SERIF, fontsize=13.5, style="italic", color=DIM)
fig.text(L, .471, "paid only from the value it creates, and sharing that value with everyone who helps.", family=SERIF, fontsize=13.5, style="italic", color=DIM)
rule(.445)

label(.42, "HOW I WORK")
items = [("Fair practice", "Standard terms, published openly. No hidden fees."),
         ("Transparency", "Every number visible. Every claim sourced."),
         ("Collective growth", "Founders, customers, partners, staff win together."),
         ("Positive impact", "Small makers become real brands. Local jobs grow."),
         ("Efficiency", "Machines do the routine. People do what needs people."),
         ("Plain language", "Anyone understands me in one read."),
         ("Keep promises", "Live in 7 days. Honest numbers. Always.")]
for i, (t, d) in enumerate(items):
    x = L + (i % 2) * .44; y = .375 - (i // 2) * .075
    ax = fig.add_axes([x, y - .012, .045, .045 * 8 / 13]); ax.imshow(icon(t.lower().replace(' ', '-'))); ax.axis('off')
    fig.text(x + .055, y + .004, f"{i+1:02d}  " + t.upper(), family=DISPLAY, fontsize=15, color=INK)
    fig.text(x + .055, y - .022, d, fontsize=8.8, color=DIM)

fig.text(L, .04, "viratmohan.com/mission", fontsize=10, weight="bold", color=INK)
fig.text(.92, .04, "Let's talk.", family=SERIF, fontsize=16, style="italic", color=TERRACOTTA, ha="right")
fig.savefig("mission-poster.png", dpi=200)

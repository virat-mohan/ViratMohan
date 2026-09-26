"""Instagram post: Pay with a Post story, with Virat's photo. 1080x1350."""
import matplotlib.pyplot as plt
from matplotlib.image import imread
from brand import *

fig = plt.figure(figsize=(7.2, 9))
fig.text(.08, .945, "PAY WITH A POST", color=TERRACOTTA, fontsize=11, weight="bold")
ax = fig.add_axes([.08, .44, .84, .47]); ax.imshow(imread("../src/assets/vm1.png")); ax.axis("off")
fig.text(.08, .345, "LAST WEEK, SOMEONE BOUGHT", family=DISPLAY, fontsize=26)
fig.text(.08, .3, "SUNGLASSES WITHOUT PAYING MONEY.", family=DISPLAY, fontsize=26)
fig.text(.08, .235, "They paid with a post.", family=SERIF, fontsize=24, style="italic", color=TERRACOTTA)
fig.text(.08, .17, "2 of the first 4 customers chose it over paying.", fontsize=12, color=DIM)
fig.text(.08, .1, "Let's talk.", family=SERIF, fontsize=20, style="italic", color=INK)
fig.text(.08, .035, "viratmohan.com", fontsize=9, weight="bold")
fig.savefig("ig-pwap.png", dpi=150)

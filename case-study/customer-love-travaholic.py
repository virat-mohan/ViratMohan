"""Customer Love #1 — Travaholic Caps. One branded image: a real customer photo from
travaholic.in, dressed as a DevShop post (actual DevShop logo, not just text) that flexes
the business and asks people to show a portfolio brand some love."""
from PIL import Image, ImageDraw, ImageFont, ImageOps
import os

IMGDIR = "/private/tmp/claude-501/-Users-viratmohan-Virat-Mohan-Website/d2dcb77b-657b-47cd-ac9f-9ab273c67e7b/images"
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
ANTON = os.path.join(FONT_DIR, "anton-latin-400-normal.ttf")
SANS_B = os.path.join(FONT_DIR, "inter-latin-700-normal.ttf")
SANS = os.path.join(FONT_DIR, "inter-latin-400-normal.ttf")
LOGO = "/Users/viratmohan/Virat Mohan Website/src/assets/screenshots/devshop-logo-transparent.png"

PAPER, INK, DIM, GOLD, TERRACOTTA = "#f4ead4", "#1a1410", "#5a4c3c", "#d4af37", "#d9714b"
W, H = 1080, 1350

def font(p, s): return ImageFont.truetype(p, s)

def wrap_lines(d, text, f, max_w):
    words = text.split(" "); lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= max_w: cur = t
        else: lines.append(cur); cur = w
    lines.append(cur); return lines

def draw_wrapped(d, xy, text, f, fill, max_w, spacing=1.1):
    x, y = xy; lh = int(f.size * spacing)
    for i, ln in enumerate(wrap_lines(d, text, f, max_w)):
        d.text((x, y + i*lh), ln, font=f, fill=fill)

def load_cover(path, w, h, focus=0.4, trim_top=0, trim_bottom=0):
    im = Image.open(path).convert("RGB")
    if trim_top or trim_bottom:
        im = im.crop((0, trim_top, im.width, im.height - trim_bottom))
    return ImageOps.fit(im, (w, h), Image.LANCZOS, centering=(0.5, focus))

def gradient_top_bottom(img, top_h=230, bottom_frac=0.5):
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for y in range(top_h):
        a = int(140 * (1 - y / top_h))
        d.line([(0, y), (W, y)], fill=(15, 12, 9, a))
    start = int(H * (1 - bottom_frac))
    for y in range(start, H):
        t = (y - start) / (H - start)
        a = int(235 * (t ** 1.15))
        d.line([(0, y), (W, y)], fill=(15, 12, 9, a))
    return Image.alpha_composite(img, overlay)

photo = load_cover(os.path.join(IMGDIR, "travaholic-khardungla-ladakh.jpg"), W, H, 0.5, trim_top=280, trim_bottom=150).convert("RGBA")
photo = gradient_top_bottom(photo)
d = ImageDraw.Draw(photo)

# DevShop logo on its own paper plate (top-left) — so the logo's dark grey half stays legible
# on any photo behind it, instead of floating loose on the image.
logo = Image.open(LOGO).convert("RGBA")
logo_w = 300
logo_h = int(logo.height * (logo_w / logo.width))
logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
plate_pad = 22
plate = Image.new("RGBA", (logo_w + plate_pad*2, logo_h + plate_pad*2), (244, 234, 212, 245))
plate.paste(logo, (plate_pad, plate_pad), logo)
photo.paste(plate, (56, 56), plate)

d.text((56 + plate.width + 20, 56 + plate.height//2 - 16), "CUSTOMER LOVE", font=font(SANS_B, 26), fill=PAPER)

y = H - 470
d.text((56, y), "TRAVAHOLIC CAPS", font=font(ANTON, 60), fill=PAPER)
y += 76
draw_wrapped(d, (56, y), "Already running on my Retail OS — real store, real orders, not a demo.", font(SANS, 29), (244, 234, 212, 235), W-112, spacing=1.25)
y += 90
d.line([56, y, W-56, y], fill=(244, 234, 212, 90), width=1)
y += 28
d.text((56, y), "10% OFF — DEVSHOP10", font=font(ANTON, 44), fill=GOLD)
y += 64
draw_wrapped(d, (56, y), "Show a portfolio brand some love — shop at travaholic.in", font(SANS_B, 26), PAPER, W-112, spacing=1.2)
y += 42
draw_wrapped(d, (56, y), "Follow the brand: @travaholiccaps", font(SANS, 24), (244, 234, 212, 210), W-112, spacing=1.2)
y += 60
draw_wrapped(d, (56, y), "Photo: a real Travaholic customer, Khardung La, Ladakh — from travaholic.in", font(SANS, 19), (244, 234, 212, 160), W-112, spacing=1.3)

photo.convert("RGB").save(os.path.join(IMGDIR, "customer-love-travaholic-1.jpg"), quality=92)
print("done")

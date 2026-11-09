#!/usr/bin/env python3
"""Wyszukiwanie w wideo opisem tekstowym (CLIP) – „znajdź moment, w którym jest robot”.

CLIP zamienia obrazy i teksty na wektory w tej samej przestrzeni. Wystarczy policzyć wektor
dla co-sekundowej klatki filmu i dla zapytania, a potem znaleźć najbardziej podobne.
Bez trenowania, bez etykiet – działa na dowolne pojęcia („czerwony samochód nocą”, „ktoś je pizzę”).

Model openai/clip-vit-base-patch32 (~150 M parametrów) to „mały” model jak na dzisiejsze
standardy: 1 minuta filmu przy 1 kl./s indeksuje się na CPU w kilka sekund.
Zapytania najlepiej działają po angielsku.

Przykład:
    python search.py film.mp4 "a robot" "two people arguing on a bridge" "a city skyline"

pip install torch transformers pillow
"""
import argparse

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from _common import Timer, hms, out_path, read_frames


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("queries", nargs="+", help="opisy szukanych momentów")
    ap.add_argument("--fps", type=float, default=1.0, help="ile klatek na sekundę indeksować")
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--gap", type=float, default=3.0, help="min. odstęp (s) między wynikami – bez sąsiednich klatek")
    ap.add_argument("--model", default="openai/clip-vit-base-patch32")
    args = ap.parse_args()

    import torch
    from transformers import CLIPModel, CLIPProcessor

    model = CLIPModel.from_pretrained(args.model).eval()
    proc = CLIPProcessor.from_pretrained(args.model)

    times, thumbs, feats = [], [], []
    t = Timer("clip-index")
    batch: list[Image.Image] = []

    def flush():
        with torch.inference_mode():
            px = proc(images=batch, return_tensors="pt")
            f = model.get_image_features(**px)
            f = f if isinstance(f, torch.Tensor) else f.pooler_output
            feats.append(torch.nn.functional.normalize(f, dim=-1))
        batch.clear()

    for ts, frame in read_frames(args.input, fps=args.fps, width=448):
        img = Image.fromarray(frame)
        times.append(ts)
        thumbs.append(img)
        batch.append(img)
        if len(batch) == 16:
            flush()
        t.tick(10)
    if batch:
        flush()
    t.done()
    img_f = torch.cat(feats)

    with torch.inference_mode():
        tx = proc(text=args.queries, return_tensors="pt", padding=True)
        txt_f = model.get_text_features(**tx)
        txt_f = txt_f if isinstance(txt_f, torch.Tensor) else txt_f.pooler_output
        txt_f = torch.nn.functional.normalize(txt_f, dim=-1)
    sims = (txt_f @ img_f.T).numpy()  # [zapytania × klatki]

    tw, th = 300, int(300 * thumbs[0].height / thumbs[0].width)
    label_w = 260
    sheet = Image.new("RGB", (label_w + args.top * (tw + 8) + 8, len(args.queries) * (th + 8) + 8), (17, 19, 29))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 17)
        small = ImageFont.truetype("DejaVuSans.ttf", 15)
    except OSError:
        font = small = ImageFont.load_default()
    for qi, q in enumerate(args.queries):
        order = []
        for i in np.argsort(-sims[qi]):  # najlepsze dopasowania, ale nie z tej samej chwili
            if all(abs(times[i] - times[j]) >= args.gap for j in order):
                order.append(i)
            if len(order) == args.top:
                break
        print(f"\n„{q}”")
        y = 8 + qi * (th + 8)
        draw.multiline_text((12, y + 8), "\n".join(_wrap(q, 22)), font=font, fill=(230, 233, 245))
        for k, i in enumerate(order):
            print(f"   {hms(times[i])}  podobieństwo {sims[qi, i]:.3f}")
            x = label_w + 8 + k * (tw + 8)
            sheet.paste(thumbs[i].resize((tw, th)), (x, y))
            tag = f"{hms(times[i])}  ·  {sims[qi, i]:.2f}"
            draw.rectangle((x, y + th - 26, x + tw, y + th), fill=(0, 0, 0))
            draw.text((x + 8, y + th - 23), tag, font=small, fill=(250, 204, 21))
    dest = out_path(args.input, "szukaj", ".jpg")
    sheet.save(dest, quality=88)
    print(f"\n✓ {dest}")


def _wrap(text: str, n: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > n and cur:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    return lines + [cur]


if __name__ == "__main__":
    main()

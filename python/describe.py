#!/usr/bin/env python3
"""Automatyczny opis scen i rozdziały (PySceneDetect + SmolVLM2-256M).

SmolVLM2-256M-Video to jeden z najmniejszych modeli wizyjno-językowych (VLM): 256 M parametrów,
~1 GB RAM, działa na CPU. Patrzy na klatkę i pisze, co widzi. W połączeniu z wykrywaniem scen
daje automatyczne opisy ujęć, rozdziały do YouTube’a, tekst alternatywny i metadane do archiwum.

Przykład:
    python describe.py film.mp4                     # → film_opis.md (scena po scenie)
    python describe.py film.mp4 --prompt "What objects are visible? Answer briefly."

pip install torch transformers num2words scenedetect opencv-python-headless pillow
"""
import argparse
import json
import time

from PIL import Image

from _common import hms, out_path, probe, read_frames

MODEL = "HuggingFaceTB/SmolVLM2-256M-Video-Instruct"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--prompt", default="Describe this film frame in one short sentence.")
    ap.add_argument("--threshold", type=float, default=27.0, help="próg wykrywania cięć")
    ap.add_argument("--max-scenes", type=int, default=40)
    ap.add_argument("--model", default=MODEL)
    args = ap.parse_args()

    import torch
    from scenedetect import ContentDetector, detect
    from transformers import AutoModelForImageTextToText, AutoProcessor

    sec = lambda tc: tc.seconds if hasattr(type(tc), "seconds") else tc.get_seconds()  # noqa: E731
    scenes = [(sec(a), sec(b)) for a, b in detect(args.input, ContentDetector(threshold=args.threshold))]
    if not scenes:
        scenes = [(0.0, probe(args.input).duration)]
    scenes = scenes[: args.max_scenes]

    processor = AutoProcessor.from_pretrained(args.model)
    model = AutoModelForImageTextToText.from_pretrained(args.model, dtype=torch.float32).eval()

    rows = []
    t0 = time.perf_counter()
    for i, (a, b) in enumerate(scenes, 1):
        mid = (a + b) / 2
        _, frame = next(read_frames(args.input, start=mid, max_frames=1, width=512))
        messages = [{"role": "user", "content": [
            {"type": "image", "image": Image.fromarray(frame)},
            {"type": "text", "text": args.prompt},
        ]}]
        inputs = processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=True,
                                               return_dict=True, return_tensors="pt")
        with torch.inference_mode():
            out = model.generate(**inputs, max_new_tokens=48, do_sample=False)
        text = processor.batch_decode(out[:, inputs["input_ids"].shape[1]:], skip_special_tokens=True)[0].strip()
        rows.append({"scena": i, "start": round(a, 2), "koniec": round(b, 2), "opis": text})
        print(f"{hms(a)}  Scena {i}: {text}")
    print(f"{len(rows)} scen opisanych w {time.perf_counter() - t0:.1f} s")

    md = [f"# Opis: {args.input}", "", "| Czas | Scena | Opis |", "|---|---|---|"]
    md += [f"| {hms(r['start'])} | {r['scena']} | {r['opis']} |" for r in rows]
    md += ["", "## Rozdziały (YouTube)", ""] + [f"{hms(r['start'])[:5]} {r['opis'][:60]}" for r in rows]
    dest = out_path(args.input, "opis", ".md")
    dest.write_text("\n".join(md) + "\n", encoding="utf-8")
    dest.with_suffix(".json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ {dest}")


if __name__ == "__main__":
    main()

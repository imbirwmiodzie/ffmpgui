#!/usr/bin/env python3
"""Detekcja, śledzenie, segmentacja i poza ciała (Ultralytics YOLO).

Modele „nano” mają 2–3 M parametrów (5–6 MB) i działają na CPU w kilkunastu klatkach/s:
  yolo11n.pt       – detekcja 80 klas COCO (osoba, samochód, pies, butelka…)
  yolo11n-seg.pt   – segmentacja: dokładny kształt obiektu zamiast prostokąta
  yolo11n-pose.pt  – 17 punktów szkieletu człowieka (analiza ruchu, sport, fitness)
Tryb śledzenia (ByteTrack) nadaje obiektom stałe ID między klatkami – można je liczyć.

Przykład:
    python detect.py film.mp4                         # → film_detect.mp4 + film_detect.json
    python detect.py film.mp4 --task pose --width 960
    python detect.py film.mp4 --classes person car    # tylko wybrane klasy

pip install ultralytics   (licencja AGPL-3.0)
"""
import argparse
import json
from collections import Counter, defaultdict

import numpy as np

from _common import Timer, VideoWriter, out_path, probe, read_frames

MODELS = {"detect": "yolo11n.pt", "segment": "yolo11n-seg.pt", "pose": "yolo11n-pose.pt"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--task", choices=MODELS, default="detect")
    ap.add_argument("--model", help="własne wagi (np. yolo11s.pt albo wytrenowany model)")
    ap.add_argument("--classes", nargs="*", help="nazwy klas do pokazania, np. person car dog")
    ap.add_argument("--conf", type=float, default=0.35, help="próg pewności")
    ap.add_argument("--width", type=int, default=854, help="szerokość przetwarzania (mniej = szybciej)")
    ap.add_argument("--no-track", action="store_true", help="bez śledzenia (bez stałych ID)")
    args = ap.parse_args()

    from ultralytics import YOLO

    model = YOLO(args.model or MODELS[args.task])
    names = model.names
    keep = None
    if args.classes:
        keep = [i for i, n in names.items() if n in args.classes]

    info = probe(args.input)
    out = out_path(args.input, args.task, ".mp4")
    seen_ids: dict[str, set] = defaultdict(set)
    per_frame = Counter()
    writer = None
    t = Timer(f"yolo-{args.task}")
    for ts, frame in read_frames(args.input, width=args.width):
        bgr = frame[:, :, ::-1]
        kw = dict(conf=args.conf, classes=keep, verbose=False)
        r = (model.predict(bgr, **kw) if args.no_track else model.track(bgr, persist=True, **kw))[0]
        if r.boxes is not None and len(r.boxes):
            cls = r.boxes.cls.int().tolist()
            ids = r.boxes.id.int().tolist() if r.boxes.id is not None else [None] * len(cls)
            for c, i in zip(cls, ids):
                per_frame[names[c]] += 1
                if i is not None:
                    seen_ids[names[c]].add(i)
        annotated = np.ascontiguousarray(r.plot()[:, :, ::-1])  # BGR → RGB
        if writer is None:
            h, w = annotated.shape[:2]
            writer = VideoWriter(out, w, h, info.fps, audio_from=args.input)
        writer.write(annotated)
        t.tick()
    writer.close()
    el = t.done()

    summary = {
        "plik": args.input,
        "model": args.model or MODELS[args.task],
        "klatki": t.n,
        "kl_na_s": round(t.n / el, 1),
        "unikalne_obiekty": {k: len(v) for k, v in sorted(seen_ids.items())},
        "wystapienia_w_klatkach": dict(per_frame.most_common()),
    }
    out.with_suffix(".json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"✓ {out}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Auto-reframe: poziome 16:9 → pionowe 9:16 (Reels/TikTok/Shorts) z kadrem podążającym za ludźmi.

Zwykłe kadrowanie (crop) wycina zawsze środek – a bohater często stoi z boku. Tutaj YOLO
znajduje osoby w każdej klatce, a „wirtualna kamera” płynnie przesuwa się za nimi
(wygładzanie + martwa strefa, żeby kadr nie drgał). Tak działa „auto-reframe” w edytorach wideo.

Przykład:
    python reframe.py film.mp4                      # → film_9x16.mp4
    python reframe.py film.mp4 --aspect 1:1
    python reframe.py film.mp4 --preview            # podgląd: oryginał z ramką kadru + wynik

pip install ultralytics
"""
import argparse

import cv2
import numpy as np

from _common import Timer, VideoWriter, out_path, probe, read_frames


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--aspect", default="9:16", help="proporcje wyniku, np. 9:16, 4:5, 1:1")
    ap.add_argument("--smooth", type=float, default=0.08, help="szybkość kamery (0.02 = leniwa, 0.3 = nerwowa)")
    ap.add_argument("--deadzone", type=float, default=0.06, help="martwa strefa jako ułamek szerokości")
    ap.add_argument("--preview", action="store_true", help="zapisz podgląd z ramką kadru")
    args = ap.parse_args()

    from ultralytics import YOLO

    model = YOLO("yolo11n.pt")
    info = probe(args.input)
    W, H = info.width, info.height
    a, b = (float(x) for x in args.aspect.split(":"))
    cw = int(round(H * a / b / 2) * 2)
    if cw > W:
        raise SystemExit("Docelowe proporcje są szersze niż wideo – nie ma czego kadrować w poziomie.")
    out = out_path(args.input, "preview" if args.preview else args.aspect.replace(":", "x"), ".mp4")

    cam = W / 2
    target = W / 2
    writer = None
    t = Timer("reframe")
    for _, frame in read_frames(args.input):
        r = model.predict(frame[:, :, ::-1], classes=[0], conf=0.4, verbose=False)[0]
        if len(r.boxes):
            xyxy = r.boxes.xyxy.cpu().numpy()
            area = (xyxy[:, 2] - xyxy[:, 0]) * (xyxy[:, 3] - xyxy[:, 1])
            centers = (xyxy[:, 0] + xyxy[:, 2]) / 2
            target = float(np.average(centers, weights=area))  # większe (bliższe) osoby ważą więcej
        if abs(target - cam) > args.deadzone * W:
            cam += (target - cam) * args.smooth
        x0 = int(np.clip(cam - cw / 2, 0, W - cw))
        crop = frame[:, x0:x0 + cw]
        if args.preview:
            left = frame.copy()
            cv2.rectangle(left, (x0, 0), (x0 + cw - 1, H - 1), (124, 92, 255), 4)
            for bx in (r.boxes.xyxy.cpu().numpy() if len(r.boxes) else []):
                cv2.rectangle(left, (int(bx[0]), int(bx[1])), (int(bx[2]), int(bx[3])), (74, 222, 128), 2)
            img = np.hstack([left, np.full((H, 8, 3), 255, np.uint8), crop])
        else:
            img = crop
        if writer is None:
            writer = VideoWriter(out, img.shape[1], img.shape[0], info.fps, audio_from=args.input)
        writer.write(np.ascontiguousarray(img))
        t.tick()
    writer.close()
    t.done()
    print(f"✓ {out}")


if __name__ == "__main__":
    main()

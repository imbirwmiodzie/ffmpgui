#!/usr/bin/env python3
"""Anonimizacja: automatyczne rozmywanie twarzy (OpenCV + YuNet).

YuNet to detektor twarzy o wielkości ~230 KB (!) i ~75 tys. parametrów. Działa w czystym OpenCV,
bez PyTorcha, w dziesiątkach klatek/s na CPU. Idealny do RODO-friendly publikacji nagrań:
monitoring, nagrania z ulicy, materiały z wydarzeń.

Przykład:
    python anonymize.py film.mp4                       # → film_anon.mp4 (rozmycie)
    python anonymize.py film.mp4 --mode pixel --boxes  # pikselizacja + podgląd ramek

pip install opencv-python-headless
"""
import argparse

import cv2
import numpy as np

from _common import Timer, VideoWriter, download, out_path, probe, read_frames

YUNET = "https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--mode", choices=["blur", "pixel", "box"], default="blur")
    ap.add_argument("--score", type=float, default=0.6, help="próg pewności detektora")
    ap.add_argument("--pad", type=float, default=0.25, help="margines wokół twarzy (ułamek rozmiaru)")
    ap.add_argument("--boxes", action="store_true", help="narysuj ramki (podgląd działania)")
    ap.add_argument("--hold", type=int, default=6, help="ile klatek „pamiętać” twarz po zgubieniu (bez mrugania)")
    args = ap.parse_args()

    info = probe(args.input)
    det = cv2.FaceDetectorYN.create(str(download(YUNET)), "", (info.width, info.height), args.score, 0.3, 5000)
    out = out_path(args.input, "anon", ".mp4")
    memory: list[tuple[np.ndarray, int]] = []  # (ramka, ile klatek jeszcze trzymać)
    faces_total = 0
    t = Timer("yunet")
    with VideoWriter(out, info.width, info.height, info.fps, audio_from=args.input) as vw:
        for _, frame in read_frames(args.input):
            img = frame.copy()
            _, faces = det.detect(img[:, :, ::-1].copy())
            boxes = [] if faces is None else [f[:4] for f in faces]
            faces_total += len(boxes)
            memory = [(b, n - 1) for b, n in memory if n > 1] + [(b, args.hold) for b in boxes]
            for b, _ in memory:
                x, y, w, h = b
                px, py = w * args.pad, h * args.pad
                x0, y0 = max(int(x - px), 0), max(int(y - py), 0)
                x1, y1 = min(int(x + w + px), info.width), min(int(y + h + py), info.height)
                roi = img[y0:y1, x0:x1]
                if roi.size == 0:
                    continue
                if args.mode == "blur":
                    k = max(31, (max(roi.shape[:2]) // 2) | 1)
                    img[y0:y1, x0:x1] = cv2.GaussianBlur(roi, (k, k), 0)
                elif args.mode == "pixel":
                    small = cv2.resize(roi, (8, 8), interpolation=cv2.INTER_AREA)
                    img[y0:y1, x0:x1] = cv2.resize(small, roi.shape[1::-1], interpolation=cv2.INTER_NEAREST)
                else:
                    img[y0:y1, x0:x1] = 0
                if args.boxes:
                    cv2.rectangle(img, (x0, y0), (x1, y1), (124, 92, 255), 2)
            vw.write(img)
            t.tick()
    t.done()
    print(f"Wykryto twarzy (suma po klatkach): {faces_total}")
    print(f"✓ {out}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Usuwanie / podmiana tła za ludźmi (MediaPipe Image Segmenter).

Model „selfie multiclass” (16 MB) dzieli każdy piksel na: tło, włosy, skórę ciała, skórę twarzy,
ubranie i inne. Łączymy wszystko poza tłem w maskę osoby – bez green screenu.
Lżejsza wersja „selfie_segmenter” ma tylko 250 KB (do wideorozmów, osoba blisko kamery).

Przykład:
    python background.py film.mp4                         # tło rozmyte (jak w Zoomie)
    python background.py film.mp4 --bg color --color 20,24,40
    python background.py film.mp4 --bg image --image plaza.jpg
    python background.py film.mp4 --bg green              # zielone tło do dalszego kluczowania

pip install mediapipe opencv-python-headless
"""
import argparse

import cv2
import numpy as np

from _common import Timer, VideoWriter, download, out_path, probe, read_frames

MODELS = {
    "multiclass": "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
    "selfie": "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--model", choices=MODELS, default="multiclass")
    ap.add_argument("--bg", choices=["blur", "color", "green", "image"], default="blur")
    ap.add_argument("--color", default="18,20,32", help="kolor tła R,G,B dla --bg color")
    ap.add_argument("--image", help="obraz tła dla --bg image")
    ap.add_argument("--smooth", type=float, default=0.6, help="wygładzanie maski w czasie (0–0.95)")
    args = ap.parse_args()

    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision

    # segmenter zamykamy jawnie na końcu (seg.close())
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=str(download(MODELS[args.model]))),
        running_mode=vision.RunningMode.VIDEO,
        output_confidence_masks=True,
    ))

    info = probe(args.input)
    W, H = info.width, info.height
    if args.bg == "image":
        bg_img = cv2.cvtColor(cv2.resize(cv2.imread(args.image), (W, H)), cv2.COLOR_BGR2RGB)
    elif args.bg in ("color", "green"):
        rgb = (0, 177, 64) if args.bg == "green" else tuple(int(c) for c in args.color.split(","))
        bg_img = np.zeros((H, W, 3), np.uint8)
        bg_img[:] = rgb

    out = out_path(args.input, f"bg_{args.bg}", ".mp4")
    prev = None
    t = Timer("mediapipe-seg")
    with VideoWriter(out, W, H, info.fps, audio_from=args.input) as vw:
        for ts, frame in read_frames(args.input):
            res = seg.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(frame)),
                                        int(ts * 1000))
            masks = res.confidence_masks
            if len(masks) > 1:   # multiclass: kanał 0 = tło
                person = 1.0 - masks[0].numpy_view()
            else:                # selfie: jedna maska „osoba”
                person = masks[0].numpy_view()
            person = cv2.resize(person.squeeze().astype(np.float32), (W, H))
            if prev is not None:  # wygładzanie w czasie → mniej migotania krawędzi
                person = args.smooth * prev + (1 - args.smooth) * person
            prev = person
            alpha = np.clip((person - 0.3) / 0.4, 0, 1)[..., None]
            if args.bg == "blur":
                back = cv2.GaussianBlur(frame, (0, 0), 18)
            else:
                back = bg_img
            vw.write((frame * alpha + back * (1 - alpha)).astype(np.uint8))
            t.tick()
    t.done()
    seg.close()
    print(f"✓ {out}")


if __name__ == "__main__":
    main()

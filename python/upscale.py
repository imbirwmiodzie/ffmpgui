#!/usr/bin/env python3
"""Powiększanie (super-resolution) wideo siecią Real-ESRGAN (spandrel + PyTorch).

Model realesr-general-x4v3 (architektura SRVGGNetCompact) ma tylko ~1,2 M parametrów (4,7 MB),
a „dorysowuje” detale przy 4× powiększeniu dużo lepiej niż zwykłe skalowanie bicubic/lanczos.
Świetny do starych nagrań 480p, nagrań z telefonów sprzed lat i animacji.

Na CPU to wciąż kilka klatek/s dla małych rozdzielczości – do dłuższych filmów przyda się GPU
(skrypt sam użyje CUDA/MPS, jeśli jest dostępne).

Przykład:
    python upscale.py stare.mp4                     # 4× większe → stare_x4.mp4
    python upscale.py stare.mp4 --outscale 2        # model 4×, wynik zmniejszony do 2×
    python upscale.py stare.mp4 --compare           # obok siebie: lanczos | Real-ESRGAN

pip install torch spandrel
"""
import argparse

import numpy as np

from _common import Timer, VideoWriter, download, out_path, probe, read_frames

WEIGHTS = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--outscale", type=float, default=4, help="docelowe powiększenie (model zawsze liczy 4×)")
    ap.add_argument("--width", type=int, help="najpierw zmniejsz wejście do tej szerokości (szybciej, do testów)")
    ap.add_argument("--compare", action="store_true", help="zapisz porównanie: lanczos | Real-ESRGAN")
    args = ap.parse_args()

    import cv2
    import torch
    from spandrel import ModelLoader

    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    model = ModelLoader().load_from_file(str(download(WEIGHTS))).eval().to(device)
    print(f"Model: {model.architecture.name}, skala ×{model.scale}, urządzenie: {device}")

    info = probe(args.input)
    out = out_path(args.input, "compare" if args.compare else f"x{args.outscale:g}", ".mp4")
    writer = None
    t = Timer("real-esrgan")
    with torch.inference_mode():
        for _, frame in read_frames(args.input, width=args.width):
            h, w = frame.shape[:2]
            x = torch.from_numpy(frame.copy()).permute(2, 0, 1).unsqueeze(0).float().div(255).to(device)
            y = model(x).clamp(0, 1)[0].permute(1, 2, 0).mul(255).round().byte().cpu().numpy()
            W, H = int(round(w * args.outscale / 2) * 2), int(round(h * args.outscale / 2) * 2)
            if y.shape[1] != W:
                y = cv2.resize(y, (W, H), interpolation=cv2.INTER_AREA)
            if args.compare:
                base = cv2.resize(frame, (W, H), interpolation=cv2.INTER_LANCZOS4)
                y = np.hstack([base, np.full((H, 4, 3), 255, np.uint8), y])
            if writer is None:
                writer = VideoWriter(out, y.shape[1], y.shape[0], info.fps, audio_from=args.input, crf=18)
            writer.write(y)
            t.tick(5)
    writer.close()
    t.done()
    print(f"✓ {out}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Wykrywanie cięć i scen (PySceneDetect) + miniatury + podział pliku przez FFmpeg.

To nie jest sieć neuronowa – PySceneDetect porównuje kolejne klatki w przestrzeni HSV
(i krawędzie). Jest błyskawiczny i bardzo skuteczny, dlatego to pierwszy krok wielu
„AI-montażystów”: dzielisz film na ujęcia, a potem każde ujęcie opisujesz/oceniasz modelem.

Przykład:
    python scenes.py film.mp4                 # lista scen + film_sceny.jpg (siatka miniatur)
    python scenes.py film.mp4 --split         # dodatkowo pliki film-Scene-001.mp4 …
    python scenes.py film.mp4 --threshold 20  # czulej (więcej cięć)

pip install scenedetect opencv-python-headless
"""
import argparse
import json
import math
import subprocess

from _common import ffmpeg_bin, hms, out_path, probe, run_ffmpeg


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--threshold", type=float, default=27.0, help="próg ContentDetector (mniej = czulej)")
    ap.add_argument("--min-len", type=float, default=0.6, help="minimalna długość sceny w sekundach")
    ap.add_argument("--split", action="store_true", help="potnij plik na sceny (FFmpeg, cięcie co do klatki)")
    args = ap.parse_args()

    from scenedetect import ContentDetector, detect

    scenes = detect(args.input, ContentDetector(threshold=args.threshold, min_scene_len=f"{args.min_len}s"))
    sec = lambda tc: tc.seconds if hasattr(type(tc), "seconds") else tc.get_seconds()  # API 0.6 i 0.7
    rows = [(sec(s), sec(e)) for s, e in scenes]
    if not rows:
        print("Nie wykryto cięć – cały plik to jedna scena.")
        return
    for i, (a, b) in enumerate(rows, 1):
        print(f"Scena {i:3d}: {hms(a)} → {hms(b)}  ({b - a:5.2f} s)")
    out_path(args.input, "sceny", ".json").write_text(
        json.dumps([{"scena": i, "start": round(a, 3), "koniec": round(b, 3)} for i, (a, b) in enumerate(rows, 1)],
                   indent=2), encoding="utf-8")

    # siatka miniatur: środkowa klatka każdej sceny, z numerem i czasem
    cols = min(6, len(rows))
    tiles = len(rows)
    fps = probe(args.input).fps
    sel = "+".join(f"eq(n\\,{int((a + b) / 2 * fps)})" for a, b in rows)
    sheet = out_path(args.input, "sceny", ".jpg")
    run_ffmpeg("-i", args.input, "-vf",
               f"select='{sel}',scale=320:-2,"
               f"drawtext=text='%{{eif\\:n+1\\:d}}':x=8:y=6:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6,"
               f"tile={cols}x{math.ceil(tiles / cols)}:padding=4:margin=4",
               "-fps_mode", "vfr", "-frames:v", "1", "-q:v", "3", str(sheet))
    print(f"✓ miniatury scen: {sheet}")

    if args.split:
        for i, (a, b) in enumerate(rows, 1):
            dest = out_path(args.input, f"scena{i:03d}")
            subprocess.run([ffmpeg_bin(), "-v", "error", "-y", "-ss", f"{a:.3f}", "-i", args.input, "-t", f"{b - a:.3f}",
                            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", str(dest)], check=True)
        print(f"✓ zapisano {len(rows)} plików scen")


if __name__ == "__main__":
    main()

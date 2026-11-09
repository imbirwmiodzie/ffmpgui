#!/usr/bin/env python3
"""Transkrypcja mowy → napisy SRT (faster-whisper).

Model: OpenAI Whisper w implementacji CTranslate2 (faster-whisper) z kwantyzacją int8.
  tiny  ~39 M parametrów (~75 MB)   base ~74 M (~145 MB)   small ~244 M (~480 MB)
Na laptopie (CPU) „base” transkrybuje kilka–kilkanaście razy szybciej niż czas rzeczywisty.
Rozpoznaje ~99 języków (w tym polski) i potrafi tłumaczyć mowę na angielski (--translate).

Przykład:
    python transcribe.py film.mp4                     # → film.srt
    python transcribe.py film.mp4 --model small --language pl --burn   # + film_napisy.mp4

pip install faster-whisper
"""
import argparse
import time
from pathlib import Path

from _common import load_audio, out_path, run_ffmpeg, write_srt


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="plik wideo lub audio")
    ap.add_argument("--model", default="base", help="tiny | base | small | medium | large-v3 | turbo (domyślnie: base)")
    ap.add_argument("--language", default=None, help="kod języka, np. pl, en (domyślnie: wykryj automatycznie)")
    ap.add_argument("--translate", action="store_true", help="tłumacz mowę na angielski zamiast transkrybować")
    ap.add_argument("--burn", action="store_true", help="dodatkowo wypal napisy w wideo przez FFmpeg")
    ap.add_argument("--max-chars", type=int, default=42, help="maks. długość linii napisu")
    args = ap.parse_args()

    from faster_whisper import WhisperModel

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    t0 = time.perf_counter()
    audio = load_audio(args.input)  # dekodowanie przez FFmpeg → 16 kHz mono float32
    segments, info = model.transcribe(
        audio,
        language=args.language,
        task="translate" if args.translate else "transcribe",
        vad_filter=True,             # pomija ciszę/muzykę – mniej „halucynacji”
        word_timestamps=True,        # pozwala ciąć długie zdania na krótsze napisy
    )
    print(f"Wykryty język: {info.language} (pewność {info.language_probability:.0%}), długość {info.duration:.1f} s")

    subs = []
    limit = args.max_chars * 2  # napis = maks. 2 linie
    for seg in segments:
        # dzielimy długie segmenty na napisy ≤ 2 linie, preferując koniec zdania; czasy bierzemy ze słów
        line, start, prev_end = "", None, seg.end
        for w in seg.words or []:
            if start is None:
                start = w.start
            if line and (len(line) + len(w.word) > limit or line.rstrip().endswith((".", "?", "!"))):
                subs.append((start, prev_end, _wrap2(line.strip(), args.max_chars)))
                line, start = "", w.start
            line += w.word
            prev_end = w.end
        if line.strip():
            subs.append((start, prev_end, _wrap2(line.strip(), args.max_chars)))
        print(f"[{seg.start:6.2f} → {seg.end:6.2f}] {seg.text.strip()}")
    el = time.perf_counter() - t0
    print(f"{info.duration:.1f} s nagrania w {el:.1f} s – {info.duration / el:.1f}× szybciej niż czas rzeczywisty")

    srt = Path(args.input).with_suffix(".srt")
    write_srt(subs, srt)
    print(f"✓ napisy: {srt}")

    if args.burn:
        out = out_path(args.input, "napisy", ".mp4")
        style = "FontName=DejaVu Sans,FontSize=20,Outline=2,MarginV=24"
        run_ffmpeg("-i", args.input, "-vf", f"subtitles={srt.as_posix()}:force_style='{style}'",
                   "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "copy", str(out))
        print(f"✓ wideo z napisami: {out}")


def _wrap2(text: str, width: int) -> str:
    """Łamie napis na 2 możliwie równe linie (standard napisów: ≤ 42 znaki w linii)."""
    if len(text) <= width:
        return text
    mid = len(text) // 2
    cut = min((i for i, c in enumerate(text) if c == " "), key=lambda i: abs(i - mid), default=None)
    return text if cut is None else text[:cut] + "\n" + text[cut + 1:]


if __name__ == "__main__":
    main()

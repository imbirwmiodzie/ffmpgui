#!/usr/bin/env python3
"""Polski lektor AI: transkrypcja → tłumaczenie → synteza mowy → miks z oryginałem.

Trzy małe modele połączone w jeden potok, wszystko lokalnie na CPU:
  1. faster-whisper (base, ~74 M parametrów)        – co i kiedy mówią w oryginale,
  2. MarianMT opus-mt-en-sla (~75 M parametrów)     – tłumaczenie EN → PL,
  3. Piper TTS, głos pl_PL „gosia” (~60 MB, ONNX)   – czytanie tłumaczenia po polsku.
Na koniec FFmpeg ścisza oryginał, układa kwestie lektora na osi czasu (adelay) i miksuje (amix)
– dokładnie tak, jak brzmi klasyczny polski lektor w telewizji. Powstają też napisy PL (SRT).

Przykład:
    python lektor.py film_en.mp4                    # → film_en_lektor.mp4 + film_en_pl.srt
    python lektor.py film_en.mp4 --voice darkman    # męski głos

pip install faster-whisper transformers sentencepiece sacremoses piper-tts
"""
import argparse
import json
import tempfile
import wave
from pathlib import Path

from _common import download, load_audio, out_path, run_ffmpeg, write_srt

VOICES = {
    "gosia": "pl/pl_PL/gosia/medium/pl_PL-gosia-medium",
    "darkman": "pl/pl_PL/darkman/medium/pl_PL-darkman-medium",
}
HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
MT_MODEL = "Helsinki-NLP/opus-mt-en-sla"  # model wielojęzyczny: język docelowy wybiera prefiks >>pol<<


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--voice", choices=VOICES, default="gosia")
    ap.add_argument("--whisper", default="base")
    ap.add_argument("--duck", type=float, default=0.25, help="głośność oryginału pod lektorem (0–1)")
    args = ap.parse_args()

    # 1) transkrypcja
    from faster_whisper import WhisperModel

    wm = WhisperModel(args.whisper, device="cpu", compute_type="int8")
    segs, info = wm.transcribe(load_audio(args.input), language="en", vad_filter=True)
    lines = [(s.start, s.end, s.text.strip()) for s in segs if s.text.strip()]
    print(f"Whisper: {len(lines)} kwestii")

    # 2) tłumaczenie
    from transformers import MarianMTModel, MarianTokenizer

    tok = MarianTokenizer.from_pretrained(MT_MODEL)
    mt = MarianMTModel.from_pretrained(MT_MODEL).eval()
    batch = tok([f">>pol<< {t}" for _, _, t in lines], return_tensors="pt", padding=True, truncation=True)
    pl = tok.batch_decode(mt.generate(**batch, num_beams=4, max_new_tokens=128), skip_special_tokens=True)
    keep = [i for i, p in enumerate(pl) if p.strip()]
    lines, pl = [lines[i] for i in keep], [pl[i].strip() for i in keep]
    for (a, _, en), p in zip(lines, pl):
        print(f"[{a:6.2f}] {en}\n         → {p}")

    # 3) synteza mowy
    from piper import PiperVoice

    base = VOICES[args.voice]
    onnx = download(HF + base + ".onnx")
    download(HF + base + ".onnx.json")
    voice = PiperVoice.load(str(onnx))

    tmp = Path(tempfile.mkdtemp(prefix="lektor_"))
    clips = []
    for i, ((a, b, _), text) in enumerate(zip(lines, pl)):
        wav = tmp / f"k{i:03d}.wav"
        with wave.open(str(wav), "wb") as wf:
            voice.synthesize_wav(text, wf)
        with wave.open(str(wav)) as wf:
            dur = wf.getnframes() / wf.getframerate()
        clips.append((a, wav, dur))

    # 4) miks w FFmpeg: oryginał ściszony + kwestie lektora w swoich momentach
    inputs, parts = ["-i", args.input], []
    total = info.duration
    for i, (a, wav, dur) in enumerate(clips, 1):
        inputs += ["-i", str(wav)]
        ms = int(a * 1000)
        # jeśli kwestia nie mieści się przed następną – lekko ją przyspiesz (maks. 1,35×)
        slot = (clips[i][0] if i < len(clips) else total) - a
        tempo = f"atempo={min(1.35, dur / slot):.3f}," if slot > 0 and dur > slot else ""
        parts.append(f"[{i}:a]{tempo}aresample=48000,adelay={ms}|{ms}[l{i}]")
    mix = "".join(f"[l{i}]" for i in range(1, len(clips) + 1))
    graph = ";".join([f"[0:a]volume={args.duck}[orig]", *parts,
                      f"[orig]{mix}amix=inputs={len(clips) + 1}:duration=first:normalize=0[a]"])
    out = out_path(args.input, "lektor", ".mp4")
    run_ffmpeg(*inputs, "-filter_complex", graph, "-map", "0:v", "-map", "[a]",
               "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", str(out))
    srt = out_path(args.input, "pl", ".srt")
    write_srt([(a, b, p) for (a, b, _), p in zip(lines, pl)], srt)
    (tmp / "skrypt.json").write_text(json.dumps([{"start": a, "en": en, "pl": p} for (a, _, en), p in zip(lines, pl)],
                                                ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ {out}\n✓ {srt}")


if __name__ == "__main__":
    main()

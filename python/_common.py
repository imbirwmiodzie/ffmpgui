"""Wspólne narzędzia dla skryptów AI w ffmpgui.

Idea jest zawsze ta sama:

    FFmpeg dekoduje wideo  ->  klatki jako tablice NumPy  ->  mały model  ->  klatki  ->  FFmpeg koduje
                                                                                     (+ dźwięk z oryginału)

FFmpeg robi to, w czym jest najlepszy (kontenery, kodeki, dźwięk), a Python/model zajmuje się
„rozumieniem” obrazu. Komunikacja odbywa się przez potoki (stdin/stdout), bez plików pośrednich.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import numpy as np

CACHE = Path(os.environ.get("FFMPGUI_CACHE", Path.home() / ".cache" / "ffmpgui-ai"))


# ───────────────────────────────────────────────────────── FFmpeg
def ffmpeg_bin(name: str = "ffmpeg") -> str:
    """Zwraca ścieżkę do ffmpeg/ffprobe. Najpierw systemowy, potem z pakietu imageio-ffmpeg."""
    found = shutil.which(name)
    if found:
        return found
    if name == "ffmpeg":
        try:
            import imageio_ffmpeg  # type: ignore

            return imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            pass
    sys.exit(f"Nie znaleziono `{name}`. Zainstaluj FFmpeg (https://ffmpeg.org/download.html) "
             "albo `pip install imageio-ffmpeg`.")


@dataclass
class VideoInfo:
    width: int
    height: int
    fps: float
    duration: float
    has_audio: bool

    @property
    def frames(self) -> int:
        return int(round(self.fps * self.duration))


def probe(path: str | Path) -> VideoInfo:
    out = subprocess.run(
        [ffmpeg_bin("ffprobe"), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    data = json.loads(out)
    v = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    if v is None:
        raise ValueError(f"{path}: brak strumienia wideo")
    num, den = (v.get("avg_frame_rate") or v.get("r_frame_rate") or "25/1").split("/")
    fps = float(num) / float(den) if float(den) else 25.0
    return VideoInfo(
        width=int(v["width"]),
        height=int(v["height"]),
        fps=fps,
        duration=float(data["format"].get("duration") or v.get("duration") or 0),
        has_audio=any(s["codec_type"] == "audio" for s in data["streams"]),
    )


def read_frames(path: str | Path, *, fps: float | None = None, width: int | None = None,
                start: float | None = None, duration: float | None = None,
                max_frames: int | None = None) -> Iterator[tuple[float, np.ndarray]]:
    """Generator (czas_w_sekundach, klatka RGB uint8 HxWx3) czytany z FFmpeg przez potok.

    fps / width pozwalają od razu zmniejszyć ilość danych – modele rzadko potrzebują 4K i 60 kl./s.
    """
    info = probe(path)
    w, h = info.width, info.height
    filters = []
    if fps:
        filters.append(f"fps={fps}")
    if width and width != w:
        h = int(round(h * width / w / 2) * 2)
        w = width
        filters.append(f"scale={w}:{h}")
    cmd = [ffmpeg_bin(), "-v", "error"]
    if start:
        cmd += ["-ss", str(start)]
    cmd += ["-i", str(path)]
    if duration:
        cmd += ["-t", str(duration)]
    if filters:
        cmd += ["-vf", ",".join(filters)]
    if max_frames:
        cmd += ["-frames:v", str(max_frames)]
    cmd += ["-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    step = 1.0 / (fps or info.fps)
    size = w * h * 3
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    try:
        i = 0
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield (start or 0) + i * step, np.frombuffer(buf, np.uint8).reshape(h, w, 3)
            i += 1
    finally:
        proc.stdout.close()
        proc.wait()


class VideoWriter:
    """Zapisuje klatki RGB do pliku wideo przez FFmpeg; opcjonalnie dokleja dźwięk z oryginału.

    with VideoWriter("out.mp4", w, h, fps, audio_from="in.mp4") as vw:
        vw.write(frame)
    """

    def __init__(self, path: str | Path, width: int, height: int, fps: float, *,
                 audio_from: str | Path | None = None, audio_start: float | None = None,
                 audio_duration: float | None = None, crf: int = 21, preset: str = "veryfast"):
        cmd = [ffmpeg_bin(), "-v", "error", "-y",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", f"{fps}", "-i", "-"]
        if audio_from:
            if audio_start:
                cmd += ["-ss", str(audio_start)]
            if audio_duration:
                cmd += ["-t", str(audio_duration)]
            cmd += ["-i", str(audio_from), "-map", "0:v", "-map", "1:a?", "-c:a", "aac", "-b:a", "160k", "-shortest"]
        cmd += ["-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(path)]
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        self.size = (height, width, 3)

    def write(self, frame: np.ndarray) -> None:
        if frame.shape != self.size:
            raise ValueError(f"klatka {frame.shape}, oczekiwano {self.size}")
        self.proc.stdin.write(np.ascontiguousarray(frame, dtype=np.uint8).tobytes())

    def close(self) -> None:
        if self.proc.stdin:
            self.proc.stdin.close()
        if self.proc.wait() != 0:
            raise RuntimeError("FFmpeg zakończył się błędem podczas zapisu")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def run_ffmpeg(*args: str) -> None:
    subprocess.run([ffmpeg_bin(), "-v", "error", "-y", *args], check=True)


def load_audio(path: str | Path, sr: int = 16000) -> np.ndarray:
    """Dekoduje dźwięk przez FFmpeg do tablicy float32 mono (format, którego oczekuje Whisper)."""
    raw = subprocess.run([ffmpeg_bin(), "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(sr),
                          "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def extract_audio(path: str | Path, out: str | Path, sr: int = 16000) -> Path:
    run_ffmpeg("-i", str(path), "-vn", "-ac", "1", "-ar", str(sr), str(out))
    return Path(out)


# ───────────────────────────────────────────────────────── modele i drobiazgi
def download(url: str, name: str | None = None) -> Path:
    """Pobiera plik modelu raz i trzyma go w ~/.cache/ffmpgui-ai."""
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / (name or url.rsplit("/", 1)[-1].split("?")[0])
    if not dest.exists():
        print(f"↓ pobieram {dest.name} …", file=sys.stderr)
        tmp = dest.with_suffix(dest.suffix + ".part")
        req = urllib.request.Request(url, headers={"User-Agent": "ffmpgui-ai/1.0"})
        with urllib.request.urlopen(req) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f)
        tmp.rename(dest)
    return dest


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(segments: list[tuple[float, float, str]], path: str | Path) -> Path:
    lines = []
    for i, (a, b, text) in enumerate(segments, 1):
        lines += [str(i), f"{srt_time(a)} --> {srt_time(b)}", text.strip(), ""]
    Path(path).write_text("\n".join(lines), encoding="utf-8")
    return Path(path)


def hms(t: float) -> str:
    m, s = divmod(t, 60)
    return f"{int(m):02d}:{s:05.2f}"


class Timer:
    """Mierzy czas i liczbę klatek – żeby było widać, ile kl./s daje model na CPU."""

    def __init__(self, label: str):
        self.label, self.n, self.t0 = label, 0, time.perf_counter()

    def tick(self, every: int = 25) -> None:
        self.n += 1
        if self.n % every == 0:
            el = time.perf_counter() - self.t0
            print(f"\r{self.label}: {self.n} klatek, {self.n / el:.1f} kl./s", end="", file=sys.stderr, flush=True)

    def done(self) -> float:
        el = time.perf_counter() - self.t0
        print(f"\r{self.label}: {self.n} klatek w {el:.1f} s ({self.n / max(el, 1e-9):.1f} kl./s)", file=sys.stderr)
        return el


def out_path(inp: str | Path, suffix: str, ext: str | None = None) -> Path:
    p = Path(inp)
    return p.with_name(f"{p.stem}_{suffix}{ext or p.suffix}")

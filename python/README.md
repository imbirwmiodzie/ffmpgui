# ffmpgui / python — AI do wideo na małych modelach

Dziesięć gotowych skryptów, które łączą **FFmpeg** z **małymi modelami AI** (od 75 tys. do 256 mln parametrów).
Wszystkie działają lokalnie na zwykłym laptopie, bez GPU i bez wysyłania nagrań do chmury.

Schemat jest zawsze ten sam:

```
FFmpeg dekoduje  →  klatki NumPy / dźwięk 16 kHz  →  mały model  →  klatki / tekst  →  FFmpeg koduje (+ oryginalny dźwięk)
```

Wspólny kod (czytanie i zapis wideo przez potoki FFmpeg, pobieranie modeli, SRT) jest w [`_common.py`](_common.py).

## Instalacja

```bash
cd python
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt        # albo tylko pakiety z nagłówka wybranego skryptu
# FFmpeg musi być w PATH (apt install ffmpeg / brew install ffmpeg / winget install ffmpeg)
```

Modele pobierają się same przy pierwszym uruchomieniu (do `~/.cache/ffmpgui-ai` i cache Hugging Face).
Na Linuksie bez środowiska graficznego MediaPipe potrzebuje bibliotek `libegl1` i `libgles2`.

## Skrypty

| Skrypt | Co robi | Model (rozmiar) | Prędkość na 4 rdzeniach CPU* |
|---|---|---|---|
| [`transcribe.py`](transcribe.py) | mowa → napisy SRT, opcjonalnie wypalone w wideo | faster-whisper `base` (74 M) | 16 s nagrania w 2,4 s (6,6× czas rzecz.) |
| [`lektor.py`](lektor.py) | **polski lektor AI**: transkrypcja → tłumaczenie → głos → miks | Whisper + MarianMT opus-mt-en-sla (75 M) + Piper (60 MB) | 14 s klipu w ~12 s |
| [`detect.py`](detect.py) | detekcja / śledzenie / segmentacja / poza (szkielet) | YOLO11n (2,6 M) | ~21 kl./s przy 854 px |
| [`anonymize.py`](anonymize.py) | rozmywanie twarzy (RODO) | YuNet (230 KB!) | ~62 kl./s przy 854 px |
| [`background.py`](background.py) | usuwanie / podmiana / rozmycie tła za ludźmi | MediaPipe selfie multiclass (16 MB) | ~10 kl./s |
| [`reframe.py`](reframe.py) | 16:9 → 9:16 z kamerą podążającą za ludźmi | YOLO11n | ~26 kl./s |
| [`upscale.py`](upscale.py) | powiększanie 4× z dorysowaniem detali | Real-ESRGAN general-x4v3 (1,2 M) | ~3,7 kl./s przy wejściu 240 px |
| [`scenes.py`](scenes.py) | wykrywanie cięć, miniatury ujęć, podział na pliki | PySceneDetect (bez sieci neuronowej) | 60 s filmu w ~2,2 s (z miniaturami) |
| [`search.py`](search.py) | szukanie momentów opisem tekstowym | CLIP ViT-B/32 (150 M) | 60 klatek (1 kl./s) w 2,6 s |
| [`describe.py`](describe.py) | opis każdej sceny + rozdziały YouTube | SmolVLM2-256M-Video | ~7 s na scenę |

\* zmierzone na fragmencie *Tears of Steel* (854×356, 24 kl./s) na 4 wirtualnych rdzeniach bez GPU. Na GPU wszystko jest wielokrotnie szybsze.

### Przykłady

```bash
python transcribe.py wywiad.mp4 --language pl --burn       # napisy PL + wideo z napisami
python lektor.py trailer_en.mp4                            # polski lektor + napisy PL
python detect.py ulica.mp4 --classes person car            # liczenie osób i aut (JSON z unikalnymi ID)
python detect.py trening.mp4 --task pose                   # szkielet 17 punktów
python anonymize.py nagranie.mp4 --mode pixel              # pikselizacja twarzy
python background.py vlog.mp4 --bg image --image plaza.jpg # wirtualne tło bez green screenu
python reframe.py podcast.mp4 --aspect 9:16                # pionowy klip na Reels/TikTok
python upscale.py vhs.mp4 --outscale 2                     # stare nagranie 2× większe
python scenes.py film.mp4 --split                          # ujęcie = osobny plik
python search.py film.mp4 "a dog on the beach" "sunset"    # gdzie w filmie jest pies?
python describe.py film.mp4                                # opisy scen + rozdziały
```

## Uczciwie o ograniczeniach

- **Małe modele się mylą.** Whisper `base` usłyszał „Very jerk Tom” zamiast „You’re a jerk, Thom”, a tłumacz potrafi przełożyć urwane zdanie zupełnie nie tak. Przed publikacją zawsze sprawdź napisy i tłumaczenie. Większe warianty (`small`, `medium`, `yolo11s`) są dokładniejsze kosztem czasu.
- Segmentacja selfie najlepiej działa, gdy osoba jest blisko kamery; w szerokich planach krawędzie bywają postrzępione.
- Ultralytics YOLO ma licencję **AGPL-3.0** – do zamkniętych produktów komercyjnych potrzebna jest licencja firmowa. Pozostałe użyte biblioteki są na licencjach MIT / Apache-2.0 / BSD.

Materiał demo: fragmenty filmu *Tears of Steel* — (CC) Blender Foundation | mango.blender.org, licencja CC BY 3.0.

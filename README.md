# ffmpgui — FFmpeg w przeglądarce, z ludzką twarzą

**ffmpgui** to wizualne studio dla [FFmpeg](https://ffmpeg.org) działające w całości w zwykłej przeglądarce.
Konwertujesz, kompresujesz, tniesz, robisz GIF-y, wypalasz napisy i dodajesz logo — **bez instalacji i bez wysyłania plików na serwer**.
A przy okazji uczysz się FFmpeg: każde polecenie jest pokolorowane i rozłożone na części z wyjaśnieniem, a każda funkcja ma **demo** na przykładowym filmie.

Do tego sekcja **AI w Pythonie**: mapa tego, co da się zrobić z wideo małymi modelami AI, oraz 10 gotowych skryptów ([`python/`](python/)) — transkrypcja, polski lektor AI, detekcja i śledzenie, poza ciała, rozmywanie twarzy, podmiana tła, auto-reframe 9:16, powiększanie, wykrywanie scen, wyszukiwanie opisem i automatyczny opis scen — z prawdziwymi wynikami pokazanymi na stronie.

![Strona główna ffmpgui](docs/hero.png)

## Uruchomienie

To statyczna strona bez kroku budowania. Wystarczy dowolny serwer HTTP:

```bash
git clone https://github.com/imbirwmiodzie/ffmpgui.git
cd ffmpgui
python3 -m http.server 8000
# otwórz http://localhost:8000
```

Można ją też wrzucić na GitHub Pages, Netlify, Cloudflare Pages itp. (Settings → Pages → „Deploy from a branch”, katalog `/`).

> Otwarcie `index.html` bezpośrednio z dysku (`file://`) nie zadziała — przeglądarki blokują wtedy Web Workery z modułami ES.

Przy pierwszym użyciu przeglądarka pobiera rdzeń FFmpeg.wasm (~31 MB) z CDN (jsDelivr, zapasowo unpkg) i trzyma go w cache.

## Funkcje

Każda funkcja ma trzy warstwy: **„Co to robi”** (dla każdego), **„Jak to działa w FFmpeg”** (explainer techniczny) i **Demo**, które pokazuje wynik obok oryginału z tabelą zmian (rozmiar, kodeki, rozdzielczość, czas, bitrate).

| Grupa | Funkcja | Co robi | Kluczowe elementy FFmpeg |
|---|---|---|---|
| Podstawy | **Analiza pliku** | kontener, strumienie, kodeki, bitrate | `ffprobe -show_format -show_streams` |
| | **Konwersja formatu** | MP4 / WebM / MKV / MOV, opcjonalnie remux bez strat | `-c:v libx264`, `libvpx`, `libopus`, `-c copy` |
| | **Kompresja** | mniejszy plik przy kontrolowanej jakości | CRF, preset, H.264 / H.265 |
| | **Zmiana rozdzielczości** | 4K → 1080p → 720p…, algorytm skalowania | `scale=W:-2:flags=lanczos` |
| | **Przycinanie** | fragment od–do, precyzyjnie lub błyskawicznie | `-ss`, `-t`, klatki kluczowe |
| Obraz | **Kadrowanie** | 1:1, 9:16 (Reels/TikTok), 4:5, 21:9, własny | `crop=w:h:x:y` |
| | **Obrót i odbicie** | 90°, 180°, lustro | `transpose`, `hflip`, `vflip` |
| | **Korekcja kolorów i efekty** | jasność, kontrast, nasycenie, sepia, vintage, winieta… | `eq`, `colorchannelmixer`, `curves`, `vignette` |
| | **Tekst na wideo** | tytuł / podpis z pozycją, kolorem i czasem | `drawtext` + czcionka DejaVu |
| | **Wypalanie napisów (SRT)** | wklejasz SRT, dostajesz napisy w obrazie | `subtitles` (libass) |
| | **Znak wodny / logo** | logo PNG w rogu z przezroczystością | `-filter_complex`, `overlay`, `-map` |
| | **Ściemnianie** | fade in/out obrazu i dźwięku | `fade`, `afade` |
| Czas i ruch | **Zmiana prędkości** | ×0,25 … ×4, dźwięk bez „efektu Smerfa” | `setpts`, `atempo` |
| | **Odtwarzanie wstecz** | klip od końca | `reverse`, `areverse` |
| Dźwięk | **Wyodrębnij dźwięk** | MP3, M4A, Opus, FLAC, WAV + kształt fali | `-vn`, `libmp3lame`, `flac`… |
| | **Usuń dźwięk** | wyciszenie w sekundę, bez strat obrazu | `-an -c:v copy` |
| | **Głośność i normalizacja** | ±dB albo do −14/−16/−23 LUFS | `volume`, `loudnorm`, `dynaudnorm` |
| | **Green screen** | podmiana zielonego/niebieskiego tła na kolor lub obraz | `chromakey`, `despill`, `overlay` |
| | **Odszumianie i wyostrzanie** | mniej ziarna, ostrzejsze detale, porównanie przed/po w kadrze | `hqdn3d`, `nlmeans`, `unsharp`, `cas`, `hstack` |
| | **Stabilizacja** | uspokojenie drżącego obrazu | `deshake` |
| | **Obraz w obrazie** | druga kamera w rogu | `scale`, `pad`, `overlay` |
| Czas i ruch | **Łączenie klipów i przejścia** | sklejanie na cięcie albo z przejściem (fade, wipe, circle, pixelize…) | `concat`, `xfade`, `acrossfade` |
| Dźwięk | **Podkład muzyczny** | muzyka pod film z zapętleniem, wyciszeniem i duckingiem | `-stream_loop`, `amix`, `sidechaincompress` |
| Eksport | **Wideo → GIF / WebP** | GIF z własną paletą kolorów | `palettegen` + `paletteuse` |
| | **Klatka i siatka miniatur** | thumbnail albo contact sheet | `-frames:v 1`, `tile` |
| Zaawansowane | **Własne polecenie** | dowolne argumenty jak w terminalu + przykłady | `hstack`, `xstack`, `gblur`, `showwaves` |

![Demo: siatka miniatur](docs/demo-thumbs.png)

### Co jeszcze jest w środku

- **„A to wciąż nie wszystko”** — 16 kolejnych przepisów FFmpeg z gotowymi poleceniami (HLS, nagrywanie ekranu, GPU, AV1, metadane i okładki, napisy jako ścieżka, wykrywanie ciszy, LUT-y, slow-motion, HDR → SDR…), z oznaczeniem, czy działają w przeglądarce, czy wymagają natywnego FFmpeg.
- **Dodatkowe wejścia** — funkcje z drugim plikiem (logo, drugi klip, muzyka, tło) generują przykładowy plik same, jeśli nie wybierzesz własnego.

- **Explainer „Jak FFmpeg przetwarza plik?”** — interaktywny schemat demuxer → dekoder → filtry → enkoder → muxer, z przełącznikiem pokazującym ścieżkę `-c copy`.
- **Anatomia polecenia** — najedź na fragment polecenia, żeby zobaczyć, co robi; kolory odpowiadają etapom schematu.
- **Żywy podgląd polecenia** w studiu — zmieniasz parametr, polecenie i jego legenda aktualizują się od razu; przycisk kopiowania daje gotowe `ffmpeg …` do terminala.
- **Porównanie przed/po** — dwa odtwarzacze, „odtwórz oba od początku”, tabela zmienionych właściwości, wykres fali dla funkcji audio.
- **Łączenie operacji** — „Użyj wyniku jako wejścia” pozwala np. przyciąć → skadrować → zrobić GIF.
- **Plik przykładowy generowany przez sam FFmpeg** (`testsrc2` + licznik czasu `drawtext` + `sine`), więc demo działa bez pobierania żadnego wideo.
- Słowniczek (kontener, kodek, strumień, bitrate, CRF, preset, klatka kluczowa, filtr, stream copy, PTS) i FAQ z ograniczeniami.
- Ciemny i jasny motyw (wg ustawień systemu), układ responsywny do szerokości telefonu.

## AI w Pythonie (małe modele)

Katalog [`python/`](python/) zawiera skrypty łączące FFmpeg z małymi modelami (od 230 KB do ~1 GB), które działają na zwykłym CPU:

| Skrypt | Co robi | Model |
|---|---|---|
| `transcribe.py` | mowa → napisy SRT (+ wypalanie) | faster-whisper |
| `lektor.py` | polski lektor AI: transkrypcja → tłumaczenie → głos → miks | Whisper + MarianMT + Piper |
| `detect.py` | detekcja, śledzenie, segmentacja, poza | YOLO11n |
| `anonymize.py` | rozmywanie twarzy | OpenCV YuNet |
| `background.py` | usuwanie / podmiana tła | MediaPipe |
| `reframe.py` | 16:9 → 9:16 z kamerą podążającą za ludźmi | YOLO11n |
| `upscale.py` | powiększanie 4× | Real-ESRGAN |
| `scenes.py` | wykrywanie cięć, miniatury, podział | PySceneDetect |
| `search.py` | szukanie momentów opisem tekstowym | CLIP |
| `describe.py` | opis scen i rozdziały | SmolVLM2-256M |

Instalacja, przykłady, zmierzone prędkości i ograniczenia: [python/README.md](python/README.md). Na stronie, w sekcji „AI w Pythonie”, jest mapa ~30 zadań AI na wideo z nazwami narzędzi i laboratorium z prawdziwymi wynikami tych skryptów.

![Demo: automatyczny opis scen](docs/ai/describe.jpg)

## Jak to działa

```
index.html          strona: hero, explainery, karty funkcji, studio, słowniczek, FAQ
css/style.css       wygląd (tokeny kolorów, ciemny/jasny motyw)
js/app.js           logika UI: formularze, podgląd polecenia, uruchamianie, wyniki
js/features.js      definicje funkcji: opisy, parametry, budowanie polecenia, preset demo
js/ai.js            sekcja AI: mapa możliwości i laboratorium (dane + renderowanie)
python/             skrypty AI (małe modele) + wspólne I/O przez FFmpeg (_common.py)
docs/ai/            prawdziwe wyniki skryptów AI pokazywane na stronie
js/engine.js        cienka warstwa nad ffmpeg.wasm (ładowanie z CDN, kolejka, ffprobe)
js/icons.js         ikony SVG
vendor/             @ffmpeg/ffmpeg i @ffmpeg/util (ESM, MIT)
```

Każda funkcja w `js/features.js` zwraca polecenie jako listę **segmentów** — fragment argumentów + kategoria (wejście, filtr, enkoder wideo/audio, wyjście) + opis. Z tej samej struktury powstaje zarówno lista argumentów dla `ffmpeg.exec()`, jak i pokolorowane polecenie z legendą. Dodanie nowej funkcji to dopisanie jednego obiektu.

FFmpeg działa w Web Workerze (jednowątkowy rdzeń `@ffmpeg/core`, więc nie są potrzebne nagłówki COOP/COEP), a pliki trzyma w wirtualnym systemie plików w pamięci.

## Ograniczenia

- Limit pamięci WebAssembly to ok. 2 GB — wygodnie pracuje się z plikami do kilkuset MB.
- Wersja przeglądarkowa jest jednowątkowa i bez GPU: zwykle 5–20× wolniejsza niż natywny FFmpeg.
- Nie ma dostępu do kamer, mikrofonów ani strumieni sieciowych.

## Licencje

`@ffmpeg/ffmpeg` i `@ffmpeg/util` — MIT. Rdzeń `@ffmpeg/core` (pobierany z CDN) — GPL-2.0-or-later. Czcionka DejaVu (pobierana z CDN) — licencja Bitstream Vera / DejaVu.
Materiał w `docs/ai/`: fragmenty filmu *Tears of Steel* — (CC) Blender Foundation | mango.blender.org, CC BY 3.0. Modele AI używane przez skrypty mają własne licencje (m.in. Ultralytics YOLO — AGPL-3.0), wymienione w python/README.md.
FFmpeg jest znakiem towarowym Fabrice’a Bellarda.

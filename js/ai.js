// Sekcja „AI do wideo”: mapa możliwości + laboratorium z prawdziwymi wynikami skryptów z katalogu python/.
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ───────────────────────────────────────────── mapa możliwości
// lab: id zadania w laboratorium (jest gotowy skrypt i demo)
export const CAPABILITIES = [
  {
    title: 'Rozumienie obrazu',
    icon: 'search',
    items: [
      { name: 'Detekcja obiektów', desc: '80+ klas: osoby, auta, zwierzęta, przedmioty – z ramką i pewnością.', tools: 'YOLO11n, RT-DETR, MediaPipe', lab: 'detect' },
      { name: 'Śledzenie i liczenie', desc: 'Stałe ID obiektu między klatkami: ile osób weszło, ile aut przejechało.', tools: 'ByteTrack / BoT-SORT (Ultralytics), Supervision', lab: 'detect' },
      { name: 'Poza i ruch ciała', desc: '17–33 punkty szkieletu: sport, fitness, analiza tańca, ergonomia.', tools: 'YOLO11n-pose, MediaPipe Pose, RTMPose', lab: 'pose' },
      { name: 'Twarze', desc: 'Wykrywanie, punkty charakterystyczne, rozmywanie (RODO).', tools: 'YuNet, MediaPipe Face, InsightFace', lab: 'anonymize' },
      { name: 'Tekst w kadrze (OCR)', desc: 'Odczyt tablic, plansz, slajdów, wypalonych napisów.', tools: 'RapidOCR, PaddleOCR, EasyOCR' },
      { name: 'Wyszukiwanie opisem', desc: '„Znajdź moment z robotem” – bez etykiet i trenowania.', tools: 'CLIP / SigLIP / MobileCLIP', lab: 'search' },
      { name: 'Opis scen (VLM)', desc: 'Model patrzy na kadr i pisze, co widzi; odpowiada na pytania.', tools: 'SmolVLM2-256M/500M, Moondream2, Florence-2', lab: 'describe' },
    ],
  },
  {
    title: 'Mowa i tekst',
    icon: 'captions',
    items: [
      { name: 'Transkrypcja → napisy', desc: '~99 języków, w tym polski; znaczniki czasu słów.', tools: 'faster-whisper, whisper.cpp, Distil-Whisper', lab: 'transcribe' },
      { name: 'Tłumaczenie napisów', desc: 'Lokalnie, bez chmury; setki par językowych.', tools: 'MarianMT (opus-mt), NLLB-200 distilled', lab: 'lektor' },
      { name: 'Lektor / dubbing', desc: 'Tekst → naturalny głos, także po polsku.', tools: 'Piper, Kokoro, XTTS', lab: 'lektor' },
      { name: 'Kto mówi (diaryzacja)', desc: 'Podział nagrania na mówców: „Osoba A / Osoba B”.', tools: 'pyannote.audio, NeMo' },
      { name: 'Streszczenia i rozdziały', desc: 'Z transkrypcji: streszczenie, tytuły rozdziałów, tagi.', tools: 'małe LLM: Qwen2.5-1.5B, Llama-3.2-1B, Phi-3.5-mini' },
    ],
  },
  {
    title: 'Edycja i ulepszanie',
    icon: 'sparkles',
    items: [
      { name: 'Usuwanie / podmiana tła', desc: 'Wirtualne tło, rozmycie, zielone tło do kluczowania.', tools: 'MediaPipe Segmenter, RVM, rembg (U²-Net)', lab: 'background' },
      { name: 'Powiększanie (super-resolution)', desc: '480p → 1080p/4K z „dorysowaniem” detali.', tools: 'Real-ESRGAN, SwinIR (przez spandrel)', lab: 'upscale' },
      { name: 'Płynne slow-motion', desc: 'Generowanie klatek pośrednich: 30 → 60/120 kl./s.', tools: 'RIFE, FILM' },
      { name: 'Odszumianie obrazu', desc: 'Nagrania nocne i z telefonów bez ziarna.', tools: 'FastDVDnet, BM3D (klasyczny)' },
      { name: 'Usuwanie obiektów', desc: 'Zamalowanie logo, przechodnia, mikrofonu w kadrze.', tools: 'LaMa, ProPainter, SAM 2 (maski)' },
      { name: 'Koloryzacja', desc: 'Czarno-białe archiwa w kolorze.', tools: 'DeOldify, DDColor' },
    ],
  },
  {
    title: 'Automatyczny montaż',
    icon: 'scissors',
    items: [
      { name: 'Wykrywanie cięć', desc: 'Podział filmu na ujęcia – baza dla wszystkiego innego.', tools: 'PySceneDetect, TransNetV2', lab: 'scenes' },
      { name: 'Auto-reframe 16:9 → 9:16', desc: 'Pionowe klipy z kadrem podążającym za ludźmi.', tools: 'YOLO + wygładzanie kamery', lab: 'reframe' },
      { name: 'Wycinanie ciszy', desc: 'Usuwa przerwy i „yyy” z vlogów i wykładów.', tools: 'auto-editor, Silero VAD' },
      { name: 'Highlighty', desc: 'Najciekawsze momenty z meczu/streamu (ruch, głośność, CLIP).', tools: 'CLIP + heurystyki, audio energy' },
    ],
  },
  {
    title: 'Dźwięk',
    icon: 'music',
    items: [
      { name: 'Separacja ścieżek', desc: 'Osobno głos, muzyka, perkusja, bas – karaoke, remiks.', tools: 'Demucs (htdemucs), Spleeter' },
      { name: 'Odszumianie mowy', desc: 'Wiatr, szum wentylatora, pogłos – usunięte.', tools: 'DeepFilterNet, RNNoise (arnndn w FFmpeg)' },
      { name: 'Rozpoznawanie dźwięków', desc: 'Oklaski, śmiech, syrena, pies – ze znacznikami czasu.', tools: 'YAMNet, PANNs, BEATs' },
    ],
  },
  {
    title: 'Generowanie (już nie „małe”)',
    icon: 'film',
    items: [
      { name: 'Tekst/obraz → wideo', desc: 'Nowe ujęcia z opisu. Wymaga mocnego GPU (12–80 GB VRAM).', tools: 'Wan 2.x, LTX-Video, HunyuanVideo, CogVideoX' },
      { name: 'Animowanie twarzy / lip-sync', desc: 'Dopasowanie ruchu ust do nowej ścieżki (dubbing).', tools: 'LivePortrait, Wav2Lip, MuseTalk' },
    ],
  },
];

// ───────────────────────────────────────────── laboratorium
const GH = 'python/';
export const AI_TASKS = [
  {
    id: 'transcribe',
    title: 'Transkrypcja i napisy',
    icon: 'captions',
    tagline: 'Whisper słucha, a FFmpeg wypala napisy w obrazie.',
    what: 'Zamienia mowę na tekst ze znacznikami czasu i zapisuje jako napisy SRT (gotowe do YouTube’a albo do wypalenia w studiu ffmpgui). Whisper rozpoznaje ~99 języków, w tym polski, i radzi sobie z akcentami i szumem tła.',
    how: 'FFmpeg dekoduje dźwięk do 16 kHz mono. Whisper to transformer encoder–decoder: enkoder zamienia 30-sekundowe okna spektrogramu na reprezentację, dekoder „pisze” tekst token po tokenie. faster-whisper uruchamia go przez CTranslate2 z kwantyzacją int8 – 4× mniej pamięci i kilka razy szybciej. Filtr VAD pomija ciszę i muzykę, co ogranicza „halucynacje”.',
    model: { name: 'faster-whisper base', params: '74 M', size: '~145 MB', license: 'MIT', speed: '16 s nagrania w 2,4 s (CPU)' },
    media: { type: 'video', src: 'docs/ai/transcribe.mp4', poster: 'docs/ai/transcribe.jpg', audio: true },
    output: { label: 'Wygenerowany SRT', file: 'docs/ai/transcribe.srt' },
    cli: 'python transcribe.py scena.mp4 --burn',
    code: `from faster_whisper import WhisperModel
from _common import load_audio, write_srt

model = WhisperModel("base", device="cpu", compute_type="int8")
audio = load_audio("scena.mp4")          # FFmpeg → 16 kHz mono float32
segments, info = model.transcribe(audio, vad_filter=True)
write_srt([(s.start, s.end, s.text) for s in segments], "scena.srt")`,
    studio: 'subtitles',
  },
  {
    id: 'lektor',
    title: 'Polski lektor AI',
    icon: 'volume',
    tagline: 'Trzy małe modele: rozpoznanie mowy → tłumaczenie → synteza głosu.',
    what: 'Robi z anglojęzycznego klipu wersję z polskim lektorem – w stylu, który znamy z telewizji: oryginał słychać cicho pod spodem, a głos lektora czyta tłumaczenie. Przy okazji powstają polskie napisy. Włącz dźwięk w podglądzie.',
    how: 'Whisper daje kwestie z czasami. MarianMT (opus-mt-en-sla, 75 M parametrów) tłumaczy je na polski – to wielojęzyczny model, a język docelowy wybiera prefiks >>pol<<. Piper (sieć VITS w ONNX) czyta każdą kwestię głosem „gosia”. Na koniec FFmpeg: volume ścisza oryginał, adelay ustawia każdą kwestię w jej momencie, atempo lekko przyspiesza zbyt długie, a amix wszystko miksuje.',
    model: { name: 'Whisper + MarianMT + Piper', params: '74 M + 75 M + ~20 M', size: '~300 MB łącznie', license: 'MIT / CC-BY 4.0 / MIT', speed: '14 s klipu w ~12 s (CPU)' },
    media: { type: 'video', src: 'docs/ai/lektor.mp4', poster: 'docs/ai/lektor.jpg', audio: true },
    output: { label: 'Tłumaczenie (SRT po polsku)', file: 'docs/ai/lektor_pl.srt' },
    note: 'Małe modele się mylą: „follow our passions” stało się „śledzić nasze pasje”, a urwane zdanie z dalszej części klipu model przetłumaczył… wulgarnie. Zawsze przeczytaj tłumaczenie przed publikacją.',
    cli: 'python lektor.py scena_en.mp4 --voice gosia',
    code: `segs, _ = whisper.transcribe(load_audio(src), language="en")
pl = tok.batch_decode(mt.generate(**tok([f">>pol<< {s.text}" for s in segs],
                                        return_tensors="pt", padding=True)))
for i, text in enumerate(pl):
    voice.synthesize_wav(text, wave.open(f"k{i}.wav", "wb"))   # Piper TTS
# FFmpeg: [0:a]volume=0.25[orig]; [1:a]adelay=1420|1420[l1]; … amix=inputs=N`,
    studio: 'volume',
  },
  {
    id: 'detect',
    title: 'Detekcja i śledzenie',
    icon: 'search',
    tagline: 'YOLO11n znajduje 80 rodzajów obiektów i nadaje im stałe ID.',
    what: 'Znajduje w każdej klatce osoby, samochody, zwierzęta i przedmioty, rysuje ramki i śledzi je w czasie (id:1, id:2). Dzięki temu można liczyć unikalne obiekty: ile osób przeszło przez kadr, ile aut przejechało skrzyżowanie.',
    how: 'YOLO („You Only Look Once”) to splotowa sieć, która w jednym przebiegu przewiduje ramki i klasy na siatce punktów obrazu. Wersja „n” (nano) ma 2,6 M parametrów. Śledzenie ByteTrack łączy wykrycia między klatkami filtrem Kalmana i dopasowaniem ramek (IoU), więc obiekt zachowuje ID nawet przy chwilowym zasłonięciu.',
    model: { name: 'Ultralytics YOLO11n', params: '2,6 M', size: '5,4 MB', license: 'AGPL-3.0', speed: '~21 kl./s przy 854 px (CPU)' },
    media: { type: 'video', src: 'docs/ai/detect.mp4', poster: 'docs/ai/detect.jpg' },
    output: { label: 'Podsumowanie (JSON)', text: '{\n  "model": "yolo11n.pt",\n  "klatki": 384,\n  "kl_na_s": 21.6,\n  "unikalne_obiekty": { "person": 2 },\n  "wystapienia_w_klatkach": { "person": 668 }\n}' },
    cli: 'python detect.py ulica.mp4 --classes person car',
    code: `from ultralytics import YOLO
model = YOLO("yolo11n.pt")
for t, frame in read_frames("ulica.mp4", width=854):     # FFmpeg → NumPy
    r = model.track(frame[:, :, ::-1], persist=True)[0]  # RGB → BGR
    writer.write(r.plot()[:, :, ::-1])                    # ramki + ID → FFmpeg`,
  },
  {
    id: 'pose',
    title: 'Poza ciała',
    icon: 'gauge',
    tagline: '17 punktów szkieletu na osobę – do sportu, fitnessu i analizy ruchu.',
    what: 'Dla każdej osoby wyznacza 17 punktów: nos, oczy, uszy, barki, łokcie, nadgarstki, biodra, kolana i kostki. Z nich da się policzyć kąty stawów, liczyć przysiady, ocenić technikę biegu albo sterować animacją.',
    how: 'To ten sam YOLO11n, ale z dodatkową „głową” przewidującą współrzędne punktów kluczowych dla każdej wykrytej osoby (podejście top-down w jednym przebiegu). Uruchamiasz go tym samym skryptem: --task pose.',
    model: { name: 'YOLO11n-pose', params: '2,9 M', size: '6 MB', license: 'AGPL-3.0', speed: 'podobnie jak detekcja' },
    media: { type: 'video', src: 'docs/ai/pose.mp4', poster: 'docs/ai/pose.jpg' },
    cli: 'python detect.py trening.mp4 --task pose',
    code: `model = YOLO("yolo11n-pose.pt")
r = model.track(frame_bgr, persist=True)[0]
kp = r.keypoints.xy        # [osoby × 17 × (x, y)]
# np. kąt w kolanie: biodro (11) – kolano (13) – kostka (15)`,
  },
  {
    id: 'anonymize',
    title: 'Rozmywanie twarzy',
    icon: 'shield',
    tagline: 'Detektor twarzy o wadze 230 KB – anonimizacja w 60 kl./s.',
    what: 'Automatycznie znajduje i rozmywa (albo pikselizuje) twarze w całym nagraniu – zanim opublikujesz film z ulicy, wydarzenia czy monitoringu. Krótka „pamięć” sprawia, że rozmycie nie miga, gdy detektor na moment zgubi twarz.',
    how: 'YuNet to maleńka sieć splotowa (~75 tys. parametrów) wbudowana w OpenCV jako cv2.FaceDetectorYN – nie potrzebuje PyTorcha. Zwraca ramkę i 5 punktów (oczy, nos, kąciki ust). Skrypt powiększa ramkę o margines i nakłada rozmycie Gaussa o promieniu zależnym od wielkości twarzy.',
    model: { name: 'OpenCV YuNet 2023mar', params: '~75 tys.', size: '230 KB', license: 'MIT', speed: '~62 kl./s przy 854 px (CPU)' },
    media: { type: 'video', src: 'docs/ai/anonymize.mp4', poster: 'docs/ai/anonymize.jpg' },
    cli: 'python anonymize.py nagranie.mp4 --mode blur',
    code: `det = cv2.FaceDetectorYN.create("face_detection_yunet_2023mar.onnx", "", (W, H))
_, faces = det.detect(frame_bgr)
for x, y, w, h in faces[:, :4].astype(int):
    roi = frame[y:y+h, x:x+w]
    frame[y:y+h, x:x+w] = cv2.GaussianBlur(roi, (51, 51), 0)`,
  },
  {
    id: 'background',
    title: 'Podmiana tła',
    icon: 'stamp',
    tagline: 'Tło znika bez green screenu – jak w wideorozmowach.',
    what: 'Oddziela ludzi od tła i zastępuje je kolorem, obrazkiem, rozmyciem albo zielonym tłem (do dalszej obróbki w montażówce lub funkcją kluczowania koloru w ffmpgui).',
    how: 'MediaPipe Image Segmenter przypisuje każdemu pikselowi klasę (tło, włosy, skóra, ubranie…). Maskę osoby wygładzamy w czasie, żeby krawędzie nie migotały, i robimy z niej kanał alfa: wynik = klatka × alfa + nowe tło × (1 − alfa).',
    model: { name: 'MediaPipe selfie multiclass', params: '~4 M', size: '16 MB (wersja lekka: 250 KB)', license: 'Apache-2.0', speed: '~10 kl./s (CPU)' },
    media: { type: 'video', src: 'docs/ai/background.mp4', poster: 'docs/ai/background.jpg' },
    note: 'Model „selfie” jest trenowany na ujęciach z bliska – w szerokim planie widać postrzępione nogi. Do pełnych sylwetek lepsze są RVM albo SAM 2.',
    cli: 'python background.py vlog.mp4 --bg image --image plaza.jpg',
    code: `seg = vision.ImageSegmenter.create_from_options(options)
res = seg.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=frame), ms)
person = 1.0 - res.confidence_masks[0].numpy_view()      # kanał 0 = tło
alpha = np.clip((person - 0.3) / 0.4, 0, 1)[..., None]
out = frame * alpha + background * (1 - alpha)`,
    studio: 'chromakey',
  },
  {
    id: 'reframe',
    title: 'Auto-reframe 9:16',
    icon: 'crop',
    tagline: 'Poziomy film → pionowy klip, a „kamera” sama podąża za ludźmi.',
    what: 'Zamienia materiał 16:9 na pionowy 9:16 (Reels, TikTok, Shorts), ale zamiast ślepo wycinać środek – śledzi ludzi w kadrze. Po lewej podgląd: zielone ramki to wykryte osoby, fioletowa – wirtualna kamera. Po prawej gotowy pion.',
    how: 'YOLO wykrywa osoby; środek kadru to średnia ich środków ważona wielkością (bliższe osoby ważą więcej). Wirtualna kamera przesuwa się płynnie (wygładzanie wykładnicze) i ignoruje drobne ruchy (martwa strefa), dzięki czemu obraz nie drży. Na końcu zwykły crop – ten sam, co w funkcji Kadrowanie.',
    model: { name: 'YOLO11n + wygładzanie', params: '2,6 M', size: '5,4 MB', license: 'AGPL-3.0', speed: '~26 kl./s (CPU)' },
    media: { type: 'video', src: 'docs/ai/reframe.mp4', poster: 'docs/ai/reframe.jpg' },
    cli: 'python reframe.py podcast.mp4 --aspect 9:16',
    code: `boxes = model.predict(frame_bgr, classes=[0])[0].boxes.xyxy.numpy()
area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
target = np.average((boxes[:, 0] + boxes[:, 2]) / 2, weights=area)
if abs(target - cam) > deadzone:
    cam += (target - cam) * 0.08                 # płynna „kamera”
x0 = int(np.clip(cam - crop_w / 2, 0, W - crop_w))
writer.write(frame[:, x0:x0 + crop_w])`,
    studio: 'crop',
  },
  {
    id: 'upscale',
    title: 'Powiększanie (Real-ESRGAN)',
    icon: 'maximize',
    tagline: '4× większa rozdzielczość z dorysowanymi detalami.',
    what: 'Powiększa obraz czterokrotnie i odtwarza ostre krawędzie oraz faktury, których zwykłe skalowanie nie wymyśli. Po lewej klasyczne skalowanie Lanczos, po prawej Real-ESRGAN – z tego samego wejścia 240 px.',
    how: 'Real-ESRGAN to sieć generatywna (GAN) trenowana na parach „zdjęcie ↔ sztucznie zniszczona wersja” (rozmycie, szum, kompresja JPEG). Wariant general-x4v3 używa kompaktowej architektury SRVGG: kilkanaście warstw splotowych i pixel-shuffle na końcu. Biblioteka spandrel sama rozpoznaje architekturę z pliku wag.',
    model: { name: 'Real-ESRGAN general-x4v3', params: '1,2 M', size: '4,7 MB', license: 'BSD-3-Clause', speed: '~3,7 kl./s dla 240→960 px (CPU)' },
    media: { type: 'image', src: 'docs/ai/upscale.jpg', caption: 'Lanczos 4× (lewo) vs Real-ESRGAN 4× (prawo), wejście 240×100 px' },
    cli: 'python upscale.py stare.mp4 --outscale 2',
    code: `from spandrel import ModelLoader
model = ModelLoader().load_from_file("realesr-general-x4v3.pth").eval()
x = torch.from_numpy(frame).permute(2, 0, 1)[None].float() / 255
with torch.inference_mode():
    y = model(x).clamp(0, 1)[0].permute(1, 2, 0).mul(255).byte().numpy()`,
    studio: 'resize',
  },
  {
    id: 'scenes',
    title: 'Wykrywanie scen',
    icon: 'grid',
    tagline: 'Film podzielony na ujęcia w 2 sekundy – bez sieci neuronowej.',
    what: 'Znajduje wszystkie cięcia montażowe, wypisuje czasy ujęć, robi siatkę miniatur i (opcjonalnie) tnie film na osobne pliki. To pierwszy krok każdego „AI-montażysty”: najpierw ujęcia, potem analiza każdego z nich.',
    how: 'PySceneDetect porównuje kolejne klatki w przestrzeni HSV (odcień, nasycenie, jasność) i krawędzie. Gdy ważona różnica przekroczy próg, to cięcie. Klasyczny algorytm jest tak szybki i skuteczny, że sieć (np. TransNetV2) przydaje się dopiero przy płynnych przejściach.',
    model: { name: 'PySceneDetect ContentDetector', params: '—', size: '—', license: 'BSD-3-Clause', speed: '60 s filmu w ~2,2 s' },
    media: { type: 'image', src: 'docs/ai/scenes.jpg', caption: '16 ujęć wykrytych w minucie „Tears of Steel” – środkowa klatka każdego' },
    cli: 'python scenes.py film.mp4 --split',
    code: `from scenedetect import detect, ContentDetector
scenes = detect("film.mp4", ContentDetector(threshold=27))
for start, end in scenes:
    print(start.get_timecode(), "→", end.get_timecode())`,
    studio: 'thumbs',
  },
  {
    id: 'search',
    title: 'Wyszukiwanie opisem (CLIP)',
    icon: 'search',
    tagline: '„Znajdź moment z mózgiem” – i model go znajduje.',
    what: 'Indeksuje film (klatka co sekundę) i pozwala szukać momentów zwykłym opisem. Nie trzeba niczego oznaczać ani trenować: działa dla dowolnych pojęć. Obok każdego wyniku widać czas i podobieństwo.',
    how: 'CLIP ma dwa enkodery – obrazu (Vision Transformer) i tekstu – wytrenowane na 400 mln par obraz–podpis tak, by pasujące pary miały podobne wektory. Liczymy wektor każdej klatki raz, a każde zapytanie to tylko iloczyn skalarny. Zwróć uwagę na „a robot”: pierwszy wynik to hologramy robotów, ale kolejne to człowiek z mechanicznym okiem – sensownie, choć dyskusyjnie. Tak wygląda „rozumienie” bez etykiet.',
    model: { name: 'CLIP ViT-B/32', params: '150 M', size: '600 MB', license: 'MIT', speed: '60 klatek w 2,6 s (CPU)' },
    media: { type: 'image', src: 'docs/ai/search.jpg', caption: 'Top 3 wyniki dla czterech zapytań (czas · podobieństwo)' },
    cli: 'python search.py film.mp4 "a robot" "two people talking on a bridge"',
    code: `img = model.get_image_features(**proc(images=frames, return_tensors="pt"))
txt = model.get_text_features(**proc(text=queries, return_tensors="pt", padding=True))
sims = normalize(txt) @ normalize(img).T      # [zapytania × klatki]
best = sims.argmax(dim=1)                      # najlepsza klatka dla każdego zapytania`,
  },
  {
    id: 'describe',
    title: 'Opis scen (SmolVLM2)',
    icon: 'type',
    tagline: 'Model wizyjno-językowy 256 M opisuje każde ujęcie.',
    what: 'Łączy wykrywanie scen z małym modelem wizyjno-językowym: dla każdego ujęcia powstaje zdanie opisu. Z tego robi się rozdziały do YouTube’a, tekst alternatywny dla niewidomych, tagi do archiwum albo wyszukiwarkę.',
    how: 'SmolVLM2 to enkoder obrazu (SigLIP) połączony z małym modelem językowym (SmolLM2). Obraz zamieniany jest na sekwencję „tokenów wizualnych”, a model językowy generuje tekst odpowiedzi na polecenie („Describe this frame…”). Wersja 256 M to jeden z najmniejszych VLM – mieści się w ~1 GB RAM.',
    model: { name: 'SmolVLM2-256M-Video-Instruct', params: '256 M', size: '~1 GB', license: 'Apache-2.0', speed: '~7 s na scenę (CPU)' },
    media: { type: 'image', src: 'docs/ai/describe.jpg', caption: 'Automatyczne opisy pierwszych 8 ujęć' },
    cli: 'python describe.py film.mp4',
    code: `msgs = [{"role": "user", "content": [
    {"type": "image", "image": Image.fromarray(frame)},
    {"type": "text", "text": "Describe this film frame in one short sentence."}]}]
inputs = processor.apply_chat_template(msgs, add_generation_prompt=True,
                                       tokenize=True, return_dict=True, return_tensors="pt")
text = processor.batch_decode(model.generate(**inputs, max_new_tokens=48))`,
  },
];

// ───────────────────────────────────────────── renderowanie
export function initAI({ onStudio } = {}) {
  const map = document.getElementById('aiMap');
  if (!map) return;
  const labIds = new Set(AI_TASKS.map((t) => t.id));
  map.innerHTML = CAPABILITIES.map((c) => `
    <div class="cap">
      <h3>${icon(c.icon)}${esc(c.title)}</h3>
      <ul>${c.items.map((it) => `
        <li>
          <div class="cap-top"><b>${esc(it.name)}</b>${it.lab && labIds.has(it.lab) ? `<button class="cap-demo" data-lab="${it.lab}">demo ▸</button>` : ''}</div>
          <p>${esc(it.desc)}</p>
          <span class="cap-tools">${esc(it.tools)}</span>
        </li>`).join('')}
      </ul>
    </div>`).join('');

  const nav = document.getElementById('aiNav');
  nav.innerHTML = AI_TASKS.map((t) => `<button class="nav-item" data-lab="${t.id}">${icon(t.icon)}<span>${esc(t.title)}</span></button>`).join('');

  const panel = document.getElementById('aiPanel');
  const show = (id, scroll = false) => {
    const t = AI_TASKS.find((x) => x.id === id) || AI_TASKS[0];
    nav.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.lab === t.id));
    panel.querySelectorAll('video').forEach((v) => v.pause());
    const m = t.media;
    const media = m.type === 'video'
      ? `<video src="${m.src}" poster="${m.poster}" ${m.audio ? '' : 'muted autoplay loop'} playsinline controls preload="metadata"></video>`
      : `<a href="${m.src}" target="_blank" rel="noopener"><img src="${m.src}" alt="${esc(m.caption || t.title)}" loading="lazy"></a>`;
    panel.innerHTML = `
      <header class="feature-head">
        <span class="feature-ico">${icon(t.icon)}</span>
        <div><h3>${esc(t.title)}</h3><p class="muted">${esc(t.tagline)}</p></div>
      </header>
      <div class="ai-cols">
        <div>
          <figure class="ai-media">${media}<figcaption>${esc(m.caption || (m.audio ? 'Prawdziwy wynik skryptu – włącz dźwięk.' : 'Prawdziwy wynik skryptu na fragmencie „Tears of Steel”.'))}</figcaption></figure>
          <dl class="ai-facts">
            <div><dt>Model</dt><dd>${esc(t.model.name)}</dd></div>
            <div><dt>Parametry</dt><dd>${esc(t.model.params)}</dd></div>
            <div><dt>Rozmiar</dt><dd>${esc(t.model.size)}</dd></div>
            <div><dt>Prędkość</dt><dd>${esc(t.model.speed)}</dd></div>
            <div><dt>Licencja</dt><dd>${esc(t.model.license)}</dd></div>
          </dl>
        </div>
        <div>
          <div class="tabs" role="tablist">
            <button class="tab active" data-t="what">Co to robi</button>
            <button class="tab" data-t="how">Jak działa model</button>
          </div>
          <div class="prose" data-p="what"><p>${esc(t.what)}</p></div>
          <div class="prose" data-p="how" hidden><p>${esc(t.how)}</p></div>
          ${t.note ? `<div class="ai-note">${icon('info')}<span>${esc(t.note)}</span></div>` : ''}
          <div class="cmd-panel">
            <div class="cmd-panel-head"><span>Uruchom</span><button class="icon-btn" data-copy="cli" title="Kopiuj">${icon('copy')}</button></div>
            <pre class="code"><span class="code-prompt">$</span> ${esc(t.cli)}</pre>
            <div class="cmd-panel-head" style="margin-top:12px"><span>Sedno kodu</span><a class="code-link" href="${GH}${t.cli.split(' ')[1]}" target="_blank" rel="noopener">cały skrypt ↗</a></div>
            <pre class="code">${esc(t.code)}</pre>
          </div>
          ${t.output ? `<details class="ai-output"${t.output.file ? ` data-file="${t.output.file}"` : ''}><summary>${esc(t.output.label)}</summary><pre>${t.output.text ? esc(t.output.text) : 'ładowanie…'}</pre></details>` : ''}
          ${t.studio ? `<button class="btn btn-ghost btn-sm ai-studio" data-studio="${t.studio}">${icon('chain')}Powiązana funkcja w studiu FFmpeg</button>` : ''}
        </div>
      </div>`;
    panel.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
      panel.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
      panel.querySelectorAll('[data-p]').forEach((p) => { p.hidden = p.dataset.p !== b.dataset.t; });
    }));
    panel.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(t.cli); } catch {}
    });
    const out = panel.querySelector('.ai-output[data-file]');
    if (out) out.addEventListener('toggle', async () => {
      if (!out.open || out.dataset.loaded) return;
      out.dataset.loaded = '1';
      try { out.querySelector('pre').textContent = await (await fetch(out.dataset.file)).text(); }
      catch { out.querySelector('pre').textContent = 'Nie udało się wczytać pliku.'; }
    });
    panel.querySelector('.ai-studio')?.addEventListener('click', (e) => onStudio?.(e.currentTarget.dataset.studio));
    if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  nav.addEventListener('click', (e) => { const b = e.target.closest('[data-lab]'); if (b) show(b.dataset.lab); });
  map.addEventListener('click', (e) => { const b = e.target.closest('[data-lab]'); if (b) show(b.dataset.lab, true); });
  show(AI_TASKS[0].id);
}

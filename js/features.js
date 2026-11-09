// Definicje funkcji ffmpgui.
// Każda funkcja opisuje: co robi (explain), jak to robi FFmpeg (how), co pokazuje demo (demo.note),
// parametry formularza oraz funkcję build(), która składa polecenie z "segmentów".
// Segment = fragment polecenia + kategoria (k) + wyjaśnienie (d). Dzięki temu UI potrafi
// pokolorować polecenie i wytłumaczyć każdą jego część.

const seg = (k, a, d) => ({ k, a: a.map(String), d });

export const CATEGORIES = {
  global: { label: 'Opcje globalne', color: 'var(--c-global)' },
  in: { label: 'Wejście / demuxer', color: 'var(--c-in)' },
  filter: { label: 'Filtry', color: 'var(--c-filter)' },
  video: { label: 'Enkoder wideo', color: 'var(--c-video)' },
  audio: { label: 'Enkoder audio', color: 'var(--c-audio)' },
  out: { label: 'Wyjście / muxer', color: 'var(--c-out)' },
};

export const GROUPS = [
  { id: 'basics', label: 'Podstawy' },
  { id: 'image', label: 'Obraz' },
  { id: 'time', label: 'Czas i ruch' },
  { id: 'audio', label: 'Dźwięk' },
  { id: 'export', label: 'Eksport' },
  { id: 'pro', label: 'Zaawansowane' },
];

// ——— wspólne klocki ———
const IN = (ctx, d) => seg('in', ['-i', ctx.input], d || 'Plik wejściowy. FFmpeg sam rozpozna kontener i kodeki (demuxer + dekoder).');
const X264 = (preset = 'veryfast', crf = 23) =>
  seg('video', ['-c:v', 'libx264', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p'],
    `Zakoduj obraz w H.264 (libx264). Preset „${preset}” = szybkość kodowania, CRF ${crf} = docelowa jakość, yuv420p = format pikseli zgodny z każdym odtwarzaczem.`);
const AAC = (ctx, br = '128k') => ctx.info.hasAudio
  ? seg('audio', ['-c:a', 'aac', '-b:a', br], `Zakoduj dźwięk w AAC z przepływnością ${br.replace('k', ' kb/s')}.`)
  : null;
const ACOPY = (ctx) => ctx.info.hasAudio
  ? seg('audio', ['-c:a', 'copy'], 'Skopiuj dźwięk bez zmian (stream copy) – zero strat i zero czasu.')
  : null;
const FASTSTART = seg('out', ['-movflags', '+faststart'], 'Przenieś indeks pliku (atom „moov”) na początek – wideo zacznie się odtwarzać w sieci, zanim pobierze się w całości.');
const OUT = (file, d) => seg('out', [file], d || 'Plik wynikowy. Rozszerzenie mówi FFmpeg, jakiego kontenera (muxera) użyć.');

const num = (v, d = 2) => Number(Number(v).toFixed(d));
const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const dur = (ctx) => ctx.info.duration || 0;

function atempoChain(f) {
  const parts = [];
  let r = f;
  while (r > 2) { parts.push('atempo=2.0'); r /= 2; }
  while (r < 0.5) { parts.push('atempo=0.5'); r /= 0.5; }
  parts.push(`atempo=${num(r, 4)}`);
  return parts.join(',');
}

const VIDEO_ONLY = (ctx) => (ctx.info.hasVideo ? null : 'Ta funkcja potrzebuje pliku z obrazem (wideo).');
const AUDIO_ONLY = (ctx) => (ctx.info.hasAudio ? null : 'Ten plik nie ma ścieżki dźwiękowej.');
const NEEDS_DURATION = (ctx) => (dur(ctx) > 0 ? null : 'Nie udało się ustalić długości pliku.');

// ——————————————————————————————————————————————————————————————————————

export const FEATURES = [
  // ─────────────────────────────── PODSTAWY
  {
    id: 'info',
    group: 'basics',
    icon: 'search',
    title: 'Analiza pliku',
    tagline: 'Zajrzyj do środka: kontener, strumienie, kodeki, rozdzielczość, bitrate.',
    explain: `<p>Zanim cokolwiek zmienisz, warto wiedzieć, <b>co właściwie masz</b>. Plik wideo to nie „jedna rzecz” – to <b>kontener</b> (np. MP4), w którym siedzą osobne <b>strumienie</b>: obraz, dźwięk, czasem napisy czy rozdziały.</p>
      <p>Analiza pokazuje każdy strumień z jego kodekiem, rozdzielczością, liczbą klatek na sekundę, częstotliwością próbkowania i przepływnością (bitrate).</p>`,
    how: `<p>Używamy narzędzia <code>ffprobe</code> – „siostry” FFmpeg, która tylko czyta plik. Opcje <code>-show_format</code> i <code>-show_streams</code> wypisują informacje o kontenerze i o każdym strumieniu, a <code>-print_format json</code> podaje je w formacie łatwym do przetworzenia.</p>`,
    demo: { params: {}, note: 'Plik przykładowy to MP4 z dwoma strumieniami: obrazem H.264 640×360 (25 kl./s) i dźwiękiem AAC – zobaczysz to w tabeli.' },
    params: [],
    special: 'probe',
    build: (p, ctx) => ({
      tool: 'ffprobe',
      segs: [
        seg('global', ['-v', 'error'], 'Wypisuj tylko błędy – bez banera i zbędnego szumu.'),
        seg('out', ['-print_format', 'json'], 'Wynik w formacie JSON.'),
        seg('filter', ['-show_format'], 'Pokaż informacje o kontenerze: format, czas trwania, rozmiar, całkowity bitrate.'),
        seg('filter', ['-show_streams'], 'Pokaż szczegóły każdego strumienia (wideo, audio, napisy…).'),
        seg('in', [ctx.input], 'Analizowany plik.'),
      ],
      out: { kind: 'probe' },
    }),
  },

  {
    id: 'convert',
    group: 'basics',
    icon: 'repeat',
    title: 'Konwersja formatu',
    tagline: 'MOV → MP4, MKV → WebM i dowolne inne kombinacje.',
    explain: `<p>Zamienia plik na inny format – np. nagranie z iPhone’a (.mov) na uniwersalne .mp4, albo wideo na stronę WWW w .webm.</p>
      <p>Kluczowa różnica: <b>kontener</b> to „pudełko” (MP4, MKV, WebM, MOV), a <b>kodek</b> to „język”, w którym zapisany jest obraz i dźwięk (H.264, VP8, AAC, Opus…). Czasem wystarczy zmienić samo pudełko – to tzw. <b>remux</b>, który trwa ułamek sekundy i nie traci jakości.</p>`,
    how: `<p>FFmpeg rozpakowuje kontener (demuxer), dekoduje strumienie, koduje je ponownie wybranym enkoderem (<code>-c:v</code>, <code>-c:a</code>) i pakuje do nowego kontenera (muxer).</p>
      <p>Przy <code>-c copy</code> etap dekodowania i kodowania jest pomijany – dane są tylko przepakowywane. Działa to, gdy nowy kontener obsługuje dotychczasowe kodeki (np. H.264 w MKV – tak, H.264 w WebM – nie).</p>`,
    demo: { params: { format: 'webm', remux: false }, note: 'Demo zamienia MP4 (H.264 + AAC) na WebM (VP8 + Opus) – format natywnie wspierany przez przeglądarki. Porównaj rozmiar i kodeki w tabeli pod odtwarzaczami.' },
    params: [
      { id: 'format', label: 'Format docelowy', type: 'select', default: 'mp4', options: [
        ['mp4', 'MP4 – H.264 + AAC (najbardziej uniwersalny)'],
        ['webm', 'WebM – VP8 + Opus (strony WWW)'],
        ['mkv', 'MKV – H.264 + AAC (Matroska)'],
        ['mov', 'MOV – H.264 + AAC (QuickTime)'],
      ] },
      { id: 'remux', label: 'Tylko zmień kontener (remux, -c copy)', type: 'toggle', default: false, when: (p) => p.format !== 'webm',
        hint: 'Błyskawicznie i bez strat, ale tylko gdy kodeki pasują do nowego kontenera.' },
    ],
    build: (p, ctx) => {
      const file = `output.${p.format}`;
      const segs = [IN(ctx)];
      if (p.remux && p.format !== 'webm') {
        segs.push(seg('video', ['-c', 'copy'], 'Stream copy: skopiuj wszystkie strumienie bez ponownego kodowania. Zmienia się tylko kontener.'));
      } else if (p.format === 'webm') {
        segs.push(seg('video', ['-c:v', 'libvpx', '-b:v', '1M', '-deadline', 'realtime', '-cpu-used', '8'],
          'Zakoduj obraz w VP8 (libvpx) z bitrate 1 Mb/s. „realtime” + „cpu-used 8” = najszybszy tryb kodowania.'));
        if (ctx.info.hasAudio) segs.push(seg('audio', ['-c:a', 'libopus', '-b:a', '96k'], 'Dźwięk w Opus 96 kb/s – nowoczesny, bardzo wydajny kodek audio.'));
      } else {
        segs.push(X264('veryfast', 23), AAC(ctx));
        if (p.format === 'mp4' || p.format === 'mov') segs.push(FASTSTART);
      }
      segs.push(OUT(file));
      return { segs, out: { file, kind: 'video' }, duration: dur(ctx) };
    },
  },

  {
    id: 'compress',
    group: 'basics',
    icon: 'zip',
    title: 'Kompresja',
    tagline: 'Zmniejsz plik nawet kilkukrotnie, kontrolując jakość.',
    explain: `<p>Za duży plik na maila, Discorda albo stronę? Kompresja ponownie koduje wideo, „wyrzucając” szczegóły, których oko i tak prawie nie zauważa.</p>
      <p>Najważniejsze pokrętło to <b>CRF</b> (Constant Rate Factor): <b>niższa wartość = lepsza jakość i większy plik</b>. Dla H.264: 18 ≈ wizualnie bezstratnie, 23 = domyślnie, 28 = wyraźnie mniejszy plik, 35+ = widoczne artefakty.</p>
      <p><b>Preset</b> decyduje, jak długo enkoder „myśli”. Wolniejszy preset przy tym samym CRF daje mniejszy plik o tej samej jakości.</p>`,
    how: `<p>CRF to tryb stałej <i>jakości</i>, a nie stałej przepływności: enkoder daje więcej bitów scenom z ruchem i mniej statycznym. Dzięki temu nie trzeba zgadywać bitrate’u.</p>
      <p>H.265 (HEVC) przy tej samej jakości daje zwykle o 25–50% mniejsze pliki, ale koduje się dużo wolniej, a nie każda przeglądarka go odtworzy.</p>`,
    demo: { params: { codec: 'h264', crf: 34, preset: 'veryfast', abr: '64k', maxw: '0' }, note: 'Demo używa CRF 34 i dźwięku 64 kb/s. Zobacz, o ile procent zmalał plik, i porównaj ostrość krawędzi oraz detale na obu podglądach.' },
    params: [
      { id: 'codec', label: 'Kodek', type: 'select', default: 'h264', options: [['h264', 'H.264 (libx264) – szybki i zgodny'], ['h265', 'H.265/HEVC (libx265) – mniejszy plik, wolniej']] },
      { id: 'crf', label: 'Jakość (CRF)', type: 'range', min: 16, max: 45, step: 1, default: 28,
        hint: (v) => (v <= 19 ? 'prawie bezstratnie' : v <= 24 ? 'wysoka jakość' : v <= 30 ? 'dobry kompromis' : v <= 36 ? 'mały plik, widoczne straty' : 'bardzo mały plik, mocne artefakty') },
      { id: 'preset', label: 'Preset (szybkość ↔ wydajność)', type: 'select', default: 'veryfast', options: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'].map((x) => [x, x]) },
      { id: 'abr', label: 'Bitrate dźwięku', type: 'select', default: '96k', options: [['64k', '64 kb/s (mowa)'], ['96k', '96 kb/s'], ['128k', '128 kb/s'], ['192k', '192 kb/s (muzyka)']] },
      { id: 'maxw', label: 'Dodatkowo zmniejsz do szerokości', type: 'select', default: '0', options: [['0', 'bez zmiany'], ['1920', '1920 px'], ['1280', '1280 px'], ['854', '854 px']] },
    ],
    build: (p, ctx) => {
      const segs = [IN(ctx)];
      if (p.maxw !== '0') segs.push(seg('filter', ['-vf', `scale='min(${p.maxw},iw)':-2`], `Zmniejsz obraz do maks. ${p.maxw} px szerokości (mniejsze nie są powiększane), wysokość dobierz automatycznie (-2 = zachowaj proporcje i parzystą liczbę).`));
      if (p.codec === 'h265') {
        segs.push(seg('video', ['-c:v', 'libx265', '-preset', p.preset, '-crf', p.crf, '-tag:v', 'hvc1'],
          `Zakoduj w H.265 (libx265), CRF ${p.crf}. „-tag:v hvc1” poprawia zgodność z Apple/QuickTime.`));
      } else segs.push(X264(p.preset, p.crf));
      segs.push(AAC(ctx, p.abr), FASTSTART, OUT('output.mp4'));
      return { segs, out: { file: 'output.mp4', kind: 'video' }, duration: dur(ctx) };
    },
  },

  {
    id: 'resize',
    group: 'basics',
    icon: 'maximize',
    title: 'Zmiana rozdzielczości',
    tagline: 'Skaluj do 1080p, 720p, 480p albo własnego rozmiaru.',
    explain: `<p>Zmienia wymiary obrazu, np. z 4K do Full HD. Mniejsza rozdzielczość to mniejszy plik i płynniejsze odtwarzanie na słabszych urządzeniach.</p>
      <p>Wpisujesz tylko szerokość – wysokość zostanie dobrana tak, by obraz się nie rozciągnął.</p>`,
    how: `<p>Robi to filtr <code>scale</code>. Wartość <code>-2</code> jako wysokość oznacza: „policz z proporcji i zaokrąglij do liczby parzystej” – H.264 z yuv420p wymaga parzystych wymiarów.</p>
      <p>Algorytm skalowania decyduje o wyglądzie: <b>lanczos</b> jest najostrzejszy, <b>bilinear</b> najszybszy, a <b>neighbor</b> (najbliższy sąsiad) nie wygładza w ogóle – świetny do pixel-artu.</p>`,
    demo: { params: { width: '320', algo: 'lanczos' }, note: 'Demo zmniejsza wideo 640×360 do 320×180. Plik maleje, a podgląd „po” jest wyraźnie mniej szczegółowy przy powiększeniu.' },
    params: [
      { id: 'width', label: 'Szerokość docelowa', type: 'select', default: '1280', options: [
        ['3840', '3840 (4K UHD)'], ['1920', '1920 (Full HD 1080p)'], ['1280', '1280 (HD 720p)'], ['854', '854 (480p)'], ['640', '640 (360p)'], ['320', '320 (miniatura)'], ['custom', 'własna…']] },
      { id: 'custom', label: 'Własna szerokość (px)', type: 'number', default: 1000, min: 16, max: 7680, step: 2, when: (p) => p.width === 'custom' },
      { id: 'algo', label: 'Algorytm skalowania', type: 'select', default: 'lanczos', options: [['lanczos', 'Lanczos – najostrzejszy'], ['bicubic', 'Bicubic – domyślny, uniwersalny'], ['bilinear', 'Bilinear – najszybszy'], ['neighbor', 'Neighbor – bez wygładzania (pixel-art)']] },
    ],
    build: (p, ctx) => {
      const w = p.width === 'custom' ? even(p.custom) : p.width;
      return {
        segs: [IN(ctx),
          seg('filter', ['-vf', `scale=${w}:-2:flags=${p.algo}`], `Filtr scale: szerokość ${w} px, wysokość automatycznie (-2), algorytm ${p.algo}.`),
          X264('veryfast', 23), ACOPY(ctx), FASTSTART, OUT('output.mp4')].filter(Boolean),
        out: { file: 'output.mp4', kind: 'video' }, duration: dur(ctx),
      };
    },
    check: VIDEO_ONLY,
  },

  {
    id: 'trim',
    group: 'basics',
    icon: 'scissors',
    title: 'Przycinanie',
    tagline: 'Wytnij fragment od–do. Precyzyjnie albo błyskawicznie.',
    explain: `<p>Zostawia tylko wybrany fragment nagrania – np. najlepsze 15 sekund z godzinnego streamu.</p>
      <p>Dwa tryby: <b>precyzyjny</b> koduje fragment ponownie i tnie co do klatki, a <b>błyskawiczny</b> (stream copy) tylko kopiuje dane – trwa chwilę, ale może zacząć się od najbliższej <b>klatki kluczowej</b>, czyli trochę wcześniej niż chcesz.</p>`,
    how: `<p><code>-ss</code> przed <code>-i</code> to szybkie przewinięcie wejścia do podanego czasu, a <code>-t</code> ogranicza długość wyniku.</p>
      <p>Dlaczego klatki kluczowe? Wideo przechowuje pełne obrazy tylko co jakiś czas (klatki I / keyframes), a pozostałe klatki to „różnice” względem poprzednich. Bez ponownego kodowania nie da się zacząć od klatki-różnicy, więc cięcie „skacze” do najbliższej klatki kluczowej.</p>`,
    demo: { params: { start: 1.5, end: 4, mode: 'accurate' }, note: 'Wideo przykładowe ma licznik czasu. Wynik powinien zaczynać się od 00:00:01.500 i trwać 2,5 s – sprawdź licznik w podglądzie „po”.' },
    params: [
      { id: 'start', label: 'Początek (sekundy)', type: 'number', default: 0, min: 0, step: 0.1 },
      { id: 'end', label: 'Koniec (sekundy)', type: 'number', default: 5, min: 0, step: 0.1 },
      { id: 'mode', label: 'Tryb', type: 'select', default: 'accurate', options: [['accurate', 'Precyzyjny (ponowne kodowanie)'], ['copy', 'Błyskawiczny (stream copy, do klatki kluczowej)']] },
    ],
    validate: (p, ctx) => {
      if (!(Number(p.end) > Number(p.start))) return 'Koniec musi być później niż początek.';
      if (dur(ctx) && Number(p.start) >= dur(ctx)) return `Początek wykracza poza długość pliku (${num(dur(ctx), 1)} s).`;
      return null;
    },
    build: (p, ctx) => {
      const len = num(Number(p.end) - Number(p.start), 3);
      const segs = [
        seg('in', ['-ss', num(p.start, 3)], `Przewiń wejście do ${num(p.start, 3)} s (opcja przed -i działa na wejściu i jest szybka).`),
        IN(ctx),
        seg('out', ['-t', len], `Zapisz tylko ${len} s materiału.`),
      ];
      if (p.mode === 'copy') {
        segs.push(seg('video', ['-c', 'copy'], 'Stream copy – bez ponownego kodowania. Szybko i bez strat, ale cięcie trafia w klatkę kluczową.'),
          seg('out', ['-avoid_negative_ts', 'make_zero'], 'Wyzeruj znaczniki czasu, żeby plik zaczynał się od 0 s.'));
      } else segs.push(X264('veryfast', 20), AAC(ctx));
      segs.push(OUT('output.mp4'));
      return { segs: segs.filter(Boolean), out: { file: 'output.mp4', kind: 'video' }, duration: len };
    },
  },

  // ─────────────────────────────── OBRAZ
  {
    id: 'crop',
    group: 'image',
    icon: 'crop',
    title: 'Kadrowanie',
    tagline: 'Wytnij kwadrat 1:1 na Instagrama albo pion 9:16 na Reels/TikTok.',
    explain: `<p>Wycina prostokątny fragment obrazu i wyrzuca resztę. Najczęstsze zastosowanie: przerobienie poziomego nagrania na <b>pionowe 9:16</b> (Reels, TikTok, Shorts) albo <b>kwadrat 1:1</b>.</p>
      <p>Możesz wybrać, którą część kadru zachować: środek, lewą albo prawą stronę.</p>`,
    how: `<p>Filtr <code>crop=w:h:x:y</code> przyjmuje szerokość i wysokość wycinka oraz położenie jego lewego górnego rogu. ffmpgui liczy te liczby za Ciebie na podstawie rozdzielczości pliku i wybranych proporcji.</p>`,
    demo: { params: { aspect: '9:16', anchor: 'center' }, note: 'Demo wycina pionowy kadr 9:16 ze środka obrazu 640×360 – wynik ma 202×360 px. Kolorowe pasy po bokach znikną.' },
    params: [
      { id: 'aspect', label: 'Proporcje', type: 'select', default: '1:1', options: [['1:1', '1:1 – kwadrat'], ['9:16', '9:16 – pion (Reels/TikTok/Shorts)'], ['4:5', '4:5 – Instagram portret'], ['4:3', '4:3 – klasyczny TV'], ['21:9', '21:9 – kinowy'], ['custom', 'własny prostokąt…']] },
      { id: 'anchor', label: 'Którą część zachować', type: 'select', default: 'center', options: [['center', 'Środek'], ['start', 'Lewo / góra'], ['end', 'Prawo / dół']], when: (p) => p.aspect !== 'custom' },
      { id: 'cw', label: 'Szerokość (px)', type: 'number', default: 320, min: 2, step: 2, when: (p) => p.aspect === 'custom' },
      { id: 'ch', label: 'Wysokość (px)', type: 'number', default: 240, min: 2, step: 2, when: (p) => p.aspect === 'custom' },
      { id: 'cx', label: 'X lewego górnego rogu', type: 'number', default: 0, min: 0, step: 1, when: (p) => p.aspect === 'custom' },
      { id: 'cy', label: 'Y lewego górnego rogu', type: 'number', default: 0, min: 0, step: 1, when: (p) => p.aspect === 'custom' },
    ],
    build: (p, ctx) => {
      const W = ctx.info.width || 1920;
      const H = ctx.info.height || 1080;
      let w, h, x, y;
      if (p.aspect === 'custom') {
        w = even(p.cw); h = even(p.ch); x = Math.round(p.cx); y = Math.round(p.cy);
      } else {
        const [a, b] = p.aspect.split(':').map(Number);
        const r = a / b;
        const k = p.anchor === 'start' ? 0 : p.anchor === 'end' ? 1 : 0.5;
        if (W / H > r) { h = even(H); w = even(H * r); if (w > W) w = W - (W % 2); x = Math.round((W - w) * k); y = 0; }
        else { w = even(W); h = even(W / r); if (h > H) h = H - (H % 2); x = 0; y = Math.round((H - h) * k); }
      }
      return {
        segs: [IN(ctx),
          seg('filter', ['-vf', `crop=${w}:${h}:${x}:${y}`], `Filtr crop: wytnij ${w}×${h} px, zaczynając od punktu (${x}, ${y}).`),
          X264('veryfast', 21), ACOPY(ctx), FASTSTART, OUT('output.mp4')].filter(Boolean),
        out: { file: 'output.mp4', kind: 'video' }, duration: dur(ctx),
      };
    },
    check: VIDEO_ONLY,
  },

  {
    id: 'rotate',
    group: 'image',
    icon: 'rotate',
    title: 'Obrót i odbicie',
    tagline: 'Napraw nagranie „na boku” albo zrób lustrzane odbicie.',
    explain: `<p>Obraca wideo o 90° lub 180° albo odbija je w poziomie/pionie. Ratuje nagrania z telefonu trzymanego krzywo i selfie z odwróconym napisem.</p>`,
    how: `<p><code>transpose=1</code> obraca o 90° w prawo, <code>transpose=2</code> w lewo. <code>hflip</code> i <code>vflip</code> odbijają obraz w poziomie i w pionie, a obrót o 180° to po prostu oba odbicia naraz.</p>
      <p>Uwaga: obrót o 90° zamienia szerokość z wysokością – 1920×1080 staje się 1080×1920.</p>`,
    demo: { params: { mode: 'cw' }, note: 'Demo obraca obraz o 90° w prawo – poziome 640×360 staje się pionowe 360×640, a licznik czasu leży na boku.' },
    params: [
      { id: 'mode', label: 'Operacja', type: 'select', default: 'cw', options: [['cw', '↻ Obrót 90° w prawo'], ['ccw', '↺ Obrót 90° w lewo'], ['180', '⟲ Obrót 180°'], ['hflip', '⇋ Odbicie lustrzane (poziome)'], ['vflip', '⇅ Odbicie pionowe']] },
    ],
    build: (p, ctx) => {
      const f = { cw: 'transpose=1', ccw: 'transpose=2', 180: 'hflip,vflip', hflip: 'hflip', vflip: 'vflip' }[p.mode];
      const d = { cw: 'obróć o 90° zgodnie z ruchem wskazówek zegara', ccw: 'obróć o 90° przeciwnie do ruchu wskazówek', 180: 'odbij w poziomie i pionie = obrót o 180°', hflip: 'odbij w poziomie (lustro)', vflip: 'odbij w pionie' }[p.mode];
      return {
        segs: [IN(ctx), seg('filter', ['-vf', f], `Filtr: ${d}.`), X264('veryfast', 21), ACOPY(ctx), FASTSTART, OUT('output.mp4')].filter(Boolean),
        out: { file: 'output.mp4', kind: 'video' }, duration: dur(ctx),
      };
    },
    check: VIDEO_ONLY,
  },

  {
    id: 'color',
    group: 'image',
    icon: 'palette',
    title: 'Korekcja kolorów i efekty',
    tagline: 'Jasność, kontrast, nasycenie + gotowe looki: sepia, vintage, czarno-białe…',
    explain: `<p>Poprawia „za ciemne” albo „wyprane” nagrania i dodaje filmowy klimat. Suwaki działają jak w aplikacji do zdjęć, tylko na każdej klatce wideo.</p>`,
    how: `<p>Filtr <code>eq</code> zmienia jasność (brightness), kontrast, nasycenie (saturation) i gammę. Gotowe looki to inne filtry: <code>hue=s=0</code> (odbarwienie), <code>colorchannelmixer</code> (sepia – mieszanie kanałów RGB), <code>curves</code> (krzywe tonalne jak w Photoshopie), <code>negate</code>, <code>edgedetect</code>, <code>vignette</code>.</p>
      <p>Filtry łączy się przecinkiem w <b>łańcuch</b> – klatka przechodzi przez nie po kolei.</p>`,
    demo: { params: { look: 'sepia', brightness: 0.02, contrast: 1.2, saturation: 1, gamma: 1, vignette: true }, note: 'Demo nakłada sepię, podbija kontrast i dodaje winietę (przyciemnione rogi). Porównaj kolory pasków na obu podglądach.' },
    params: [
      { id: 'look', label: 'Gotowy look', type: 'select', default: 'none', options: [['none', 'Brak'], ['gray', 'Czarno-biały'], ['sepia', 'Sepia'], ['vintage', 'Vintage (curves)'], ['cross', 'Cross-process'], ['negate', 'Negatyw'], ['edges', 'Kontury (edge detect)']] },
      { id: 'brightness', label: 'Jasność', type: 'range', min: -0.5, max: 0.5, step: 0.01, default: 0 },
      { id: 'contrast', label: 'Kontrast', type: 'range', min: 0.5, max: 2, step: 0.05, default: 1 },
      { id: 'saturation', label: 'Nasycenie', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
      { id: 'gamma', label: 'Gamma', type: 'range', min: 0.5, max: 2, step: 0.05, default: 1 },
      { id: 'vignette', label: 'Winieta (przyciemnione rogi)', type: 'toggle', default: false },
    ],
    build: (p, ctx) => {
      const chain = [];
      const notes = [];
      const eq = [];
      if (+p.brightness !== 0) eq.push(`brightness=${num(p.brightness)}`);
      if (+p.contrast !== 1) eq.push(`contrast=${num(p.contrast)}`);
      if (+p.saturation !== 1) eq.push(`saturation=${num(p.saturation)}`);
      if (+p.gamma !== 1) eq.push(`gamma=${num(p.gamma)}`);
      if (eq.length) { chain.push(`eq=${eq.join(':')}`); notes.push('eq – jasność/kontrast/nasycenie/gamma'); }
      const looks = {
        gray: ['hue=s=0', 'hue=s=0 – zeruje nasycenie (czarno-białe)'],
        sepia: ['colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131', 'colorchannelmixer – macierz sepii: każdy nowy kanał R/G/B to mieszanka starych'],
        vintage: ['curves=preset=vintage', 'curves=vintage – krzywe tonalne jak ze starej kliszy'],
        cross: ['curves=preset=cross_process', 'curves=cross_process – efekt wywołania kliszy w złej chemii'],
        negate: ['negate', 'negate – odwraca kolory'],
        edges: ['edgedetect=mode=colormix:high=0.2', 'edgedetect – zostawia tylko krawędzie'],
      };
      if (looks[p.look]) { chain.push(looks[p.look][0]); notes.push(looks[p.look][1]); }
      if (p.vignette) { chain.push('vignette=PI/4'); notes.push('vignette – przyciemnia rogi kadru'); }
      if (!chain.length) { chain.push('null'); notes.push('null – nic nie zmienia (ustaw jakiś suwak!)'); }
      return {
        segs: [IN(ctx), seg('filter', ['-vf', chain.join(',')], `Łańcuch filtrów: ${notes.join('; ')}.`), X264('veryfast', 20), ACOPY(ctx), FASTSTART, OUT('output.mp4')].filter(Boolean),
        out: { file: 'output.mp4', kind: 'video' }, duration: dur(ctx),
      };
    },
    check: VIDEO_ONLY,
  },

  {
    id: 'text',
    group: 'image',
    icon: 'type',
    title: 'Tekst na wideo',
    tagline: 'Tytuł, podpis albo znak autorski wypalony w obrazie.',
    explain: `<p>Nakłada napis bezpośrednio na obraz – tytuł na początku, podpis rozmówcy, nazwę kanału w rogu. Możesz ustawić pozycję, wielkość, kolor, tło i czas wyświetlania.</p>
      <p>Tekst jest „wypalony”, czyli staje się częścią pikseli – zobaczy go każdy, w każdym odtwarzaczu.</p>`,
    how: `<p>Filtr <code>drawtext</code> rysuje tekst czcionką TrueType (biblioteka FreeType). ffmpgui pobiera do wirtualnego dysku czcionkę DejaVu Sans (z polskimi znakami), a treść zapisuje do pliku i podaje przez <code>textfile=</code> – dzięki temu nie trzeba escapować dwukropków, apostrofów i procentów.</p>
      <p>Pozycję opisują wyrażenia: <code>w</code>/<code>h</code> to wymiary wideo, <code>tw</code>/<code>th</code> – wymiary tekstu. Np. <code>x=(w-tw)/2</code> centruje napis. <code>enable='between(t,1,4)'</code> pokazuje go tylko od 1. do 4. sekundy.</p>`,
    demo: { params: { text: 'Zrobione w przeglądarce ✓', pos: 'top', size: 34, color: 'yellow', box: true, from: 0.5, to: 5 }, note: 'Demo dodaje żółty napis z półprzezroczystym tłem u góry kadru, widoczny od 0,5 do 5 sekundy.' },
    params: [
      { id: 'text', label: 'Treść', type: 'text', default: 'Mój film' },
      { id: 'pos', label: 'Pozycja', type: 'select', default: 'bottom', options: [['top', 'Góra, środek'], ['center', 'Środek'], ['bottom', 'Dół, środek'], ['tl', 'Lewy górny róg'], ['br', 'Prawy dolny róg']] },
      { id: 'size', label: 'Wielkość czcionki', type: 'range', min: 12, max: 120, step: 1, default: 40 },
      { id: 'color', label: 'Kolor', type: 'select', default: 'white', options: [['white', 'Biały'], ['yellow', 'Żółty'], ['black', 'Czarny'], ['red', 'Czerwony'], ['#22d3ee', 'Turkusowy']] },
      { id: 'box', label: 'Półprzezroczyste tło pod tekstem', type: 'toggle', default: true },
      { id: 'from', label: 'Pokaż od (s)', type: 'number', default: 0, min: 0, step: 0.1 },
      { id: 'to', label: 'Pokaż do (s, 0 = do końca)', type: 'number', default: 0, min: 0, step: 0.1 },
    ],
    needsFont: true,
    files: (p) => [{ name: 'text.txt', data: new TextEncoder().encode(p.text.replace(/✓/g, '√')) }],
    build: (p, ctx) => {
      const pos = { top: ['(w-tw)/2', '30'], center: ['(w-tw)/2', '(h-th)/2'], bottom: ['(w-tw)/2', 'h-th-30'], tl: ['30', '30'], br: ['w-tw-30', 'h-th-30'] }[p.pos];
      const parts = [`fontfile=/fonts/DejaVuSans-Bold.ttf`, `textfile=text.txt`, `fontsize=${p.size}`, `fontcolor=${p.color}`, `x=${pos[0]}`, `y=${pos[1]}`];
      if (p.box) parts.push('box=1', 'boxcolor=black@0.5', 'boxborderw=12');
      const to = Number(p.to);
      if (Number(p.from) > 0 || to > 0) parts.push(`enable='between(t,${num(p.from)},${to > 0 ? num(to) : 99999})'`);
      return {
        segs: [IN(ctx),
          seg('filter', ['-vf', `drawtext=${parts.join(':')}`], `drawtext: czcionka DejaVu Sans Bold, tekst z pliku text.txt, rozmiar ${p.size}, kolor ${p.color}, pozycja x=${pos[0]}, y=${pos[1]}${p.box ? ', tło czarne 50%' : ''}${parts.at(-1).startsWith('enable') ? ', widoczny tylko w zadanym przedziale czasu' : ''}.`),
          X264('veryfast', 20), ACOPY(ctx), FASTSTART, OUT('output.mp4')].filter(Boolean),
        out: { file: 'output.mp4', kind: 'video' }, duration: dur(ctx),
      };
    },
    check: VIDEO_ONLY,
  },

  {
    id: 'subtitles',
    group: 'image',
    icon: 'captions',
    title: 'Wypalanie napisów (SRT)',
    tagline: 'Wklej napisy w formacie SRT i wtop je na stałe w obraz.',
    explain: `<p>Format <b>SRT</b> to zwykły plik tekstowy: numer, czas „od --> do” i treść. Większość serwisów (YouTube, generatory napisów AI) potrafi go wyeksportować.</p>
      <p>Wypalenie napisów przydaje się tam, gdzie nie da się dołączyć osobnego pliku – Instagram, TikTok, prezentacje, odtwarzacze bez obsługi napisów.</p>`,
    how: `<p>Filtr <code>subtitles</code> korzysta z biblioteki <b>libass</b> – tej samej, której używają profesjonalni fansuberzy. Konwertuje SRT do stylów ASS i renderuje je z obramowaniem i cieniem. <code>force_style</code> nadpisuje styl: czcionkę, rozmiar, kolor obrysu.</p>
      <p>Alternatywa bez wypalania: <code>-c:s mov_text</code> doda napisy jako osobny strumień, który widz może wyłączyć.</p>`,
    demo: { params: { srt: '1\n00:00:00,300 --> 00:00:02,500\nCześć! To są napisy z pliku SRT.\n\n2\n00:00:02,600 --> 00:00:05,800\nWypalone przez libass\nprosto w przeglądarce.\n', size: 22, outline: 2 }, note: 'Demo wypala dwa napisy: pierwszy do 2,5 s, drugi (dwulinijkowy) do 5,8 s. Przewiń podgląd „po”, żeby zobaczyć oba.' },
    params: [
      { id: 'srt', label: 'Napisy (format SRT)', type: 'textarea', rows: 8, default: '1\n00:00:00,000 --> 00:00:03,000\nPierwszy napis\n\n2\n00:00:03,000 --> 00:00:06,000\nDrugi napis\n' },
      { id: 'size', label: 'Wielkość czcionki', type: 'range', min: 12, max: 48, step: 1, default: 24 },
      { id: 'outline', label: 'Grubość obrysu', type: 'range', min: 0, max: 4, step: 0.5, default: 2 },
    ],
    needsFont: true,
    files: (p) => [{ name: 'subs.srt', data: new TextEncoder().encode(p.srt) }],
    validate: (p) => (/-->/.test(p.srt) ? null : 'To nie wygląda na SRT – brakuje linii z czasem „00:00:01,000 --> 00:00:03,000”.'),
    build: (p, ctx) => ({
      segs: [IN(ctx),
        seg('filter', ['-vf', `subtitles=subs.srt:fontsdir=/fonts:force_style='FontName=DejaVu Sans,FontSize=${p.size},Outline=${p.outline}'`],
          `Filtr subtitles (libass): wczytaj subs.srt, czcionki z katalogu /fonts, wymuś styl: DejaVu Sans, rozmiar ${p.size}, obrys ${p.outline}.`),
        X264('veryfast', 20), ACOPY(ctx), FASTSTART, OUT('output.mp4')].filter(Boolean),
      out: { file: 'output.mp4', kind: 'video' }, duration: dur(ctx),
    }),
    check: VIDEO_ONLY,
  },

  {
    id: 'watermark',
    group: 'image',
    icon: 'stamp',
    title: 'Znak wodny / logo',
    tagline: 'Nałóż półprzezroczyste logo PNG w wybranym rogu.',
    explain: `<p>Dodaje Twoje logo (najlepiej PNG z przezroczystością) na wierzch wideo – klasyczny „watermark” chroniący materiał albo budujący markę.</p>
      <p>Ustawiasz róg, wielkość logo względem szerokości filmu i przezroczystość.</p>`,
    how: `<p>Tu potrzebne są <b>dwa wejścia</b> (wideo i obrazek), więc zamiast prostego <code>-vf</code> używamy <code>-filter_complex</code> – grafu filtrów z nazwanymi „kablami” w nawiasach kwadratowych.</p>
      <p><code>[1:v]</code> = obraz z drugiego wejścia → skalujemy go i zmniejszamy kanał alfa (<code>colorchannelmixer=aa=</code>) → <code>[wm]</code>. Potem <code>overlay</code> kładzie <code>[wm]</code> na <code>[0:v]</code>. Wyrażenia <code>W-w-20</code> to „szerokość wideo minus szerokość logo minus margines”.</p>
      <p><code>-map</code> wybiera, które strumienie trafią do pliku: wynik grafu i dźwięk z pierwszego wejścia (znak <code>?</code> = jeśli istnieje).</p>`,
    demo: { params: { pos: 'br', scale: 22, opacity: 0.8 }, note: 'Demo generuje w przeglądarce przykładowe logo „ffmpgui” i nakłada je w prawym dolnym rogu z 80% kryciem.' },
    params: [
      { id: 'logo', label: 'Logo (PNG/JPG)', type: 'file', accept: 'image/*', hint: 'Bez pliku zostanie użyte przykładowe logo.' },
      { id: 'pos', label: 'Pozycja', type: 'select', default: 'br', options: [['tl', 'Lewy górny'], ['tr', 'Prawy górny'], ['bl', 'Lewy dolny'], ['br', 'Prawy dolny'], ['c', 'Środek']] },
      { id: 'scale', label: 'Szerokość logo (% szerokości wideo)', type: 'range', min: 5, max: 60, step: 1, default: 20 },
      { id: 'opacity', label: 'Krycie', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.8 },
    ],
    build: (p, ctx) => {
      const W = ctx.info.width || 1280;
      const lw = even((W * p.scale) / 100);
      const m = Math.max(8, Math.round(W * 0.025));
      const pos = { tl: [m, m], tr: [`W-w-${m}`, m], bl: [m, `H-h-${m}`], br: [`W-w-${m}`, `H-h-${m}`], c: ['(W-w)/2', '(H-h)/2'] }[p.pos];
      const logo = ctx.files.logo || 'logo.png';
      return {
        segs: [IN(ctx, 'Wejście nr 0: wideo.'),
          seg('in', ['-i', logo], 'Wejście nr 1: obrazek z logo.'),
          seg('filter', ['-filter_complex', `[1:v]scale=${lw}:-1,format=rgba,colorchannelmixer=aa=${num(p.opacity)}[wm];[0:v][wm]overlay=${pos[0]}:${pos[1]}[v]`],
            `Graf filtrów: przeskaluj logo do ${lw} px, ustaw krycie ${Math.round(p.opacity * 100)}% (kanał alfa) i połóż je (overlay) na wideo w punkcie x=${pos[0]}, y=${pos[1]}. Wynik nazwij [v].`),
          seg('out', ['-map', '[v]', '-map', '0:a?'], 'Do pliku trafia obraz z grafu [v] oraz dźwięk z wejścia 0 (jeśli jest).'),
          X264('veryfast', 20), ACOPY(ctx), FASTSTART, OUT('output.mp4')].filter(Boolean),
        out: { file: 'output.mp4', kind: 'video' }, duration: dur(ctx),
      };
    },
    check: VIDEO_ONLY,
  },

  {
    id: 'fade',
    group: 'image',
    icon: 'sunset',
    title: 'Ściemnianie (fade in/out)',
    tagline: 'Płynne wejście z czerni i wyciszenie na końcu.',
    explain: `<p>Profesjonalny początek i koniec klipu: obraz wyłania się z czerni (lub bieli), a na końcu w nią znika. Dźwięk może być równocześnie płynnie podgłaśniany i wyciszany.</p>`,
    how: `<p>Filtr <code>fade</code> dla obrazu i <code>afade</code> dla dźwięku. <code>t=in</code> / <code>t=out</code> to kierunek, <code>st</code> – moment startu w sekundach, <code>d</code> – czas trwania. Moment rozpoczęcia wyciemnienia liczymy jako <i>długość pliku − czas wyciemnienia</i>.</p>`,
    demo: { params: { fin: 1.5, fout: 1.5, color: 'black', audio: true }, note: 'Demo dodaje 1,5 s rozjaśnienia na początku i 1,5 s wyciemnienia na końcu – obraz i pisk sinusa płynnie pojawiają się i znikają.' },
    params: [
      { id: 'fin', label: 'Fade in (s)', type: 'range', min: 0, max: 5, step: 0.1, default: 1 },
      { id: 'fout', label: 'Fade out (s)', type: 'range', min: 0, max: 5, step: 0.1, default: 1 },
      { id: 'color', label: 'Kolor przejścia', type: 'select', default: 'black', options: [['black', 'Czerń'], ['white', 'Biel']] },
      { id: 'audio', label: 'Ściemniaj też dźwięk', type: 'toggle', default: true },
    ],
    validate: (p) => (+p.fin === 0 && +p.fout === 0 ? 'Ustaw przynajmniej jeden z czasów większy od zera.' : null),
    build: (p, ctx) => {
      const D = dur(ctx);
      const st = num(Math.max(0, D - p.fout));
      const vf = [];
      const af = [];
      if (+p.fin > 0) { vf.push(`fade=t=in:st=0:d=${num(p.fin)}:color=${p.color}`); af.push(`afade=t=in:st=0:d=${num(p.fin)}`); }
      if (+p.fout > 0) { vf.push(`fade=t=out:st=${st}:d=${num(p.fout)}:color=${p.color}`); af.push(`afade=t=out:st=${st}:d=${num(p.fout)}`); }
      const segs = [IN(ctx), seg('filter', ['-vf', vf.join(',')], `Obraz: ${+p.fin > 0 ? `wejście z koloru ${p.color} przez ${num(p.fin)} s` : ''}${vf.length > 1 ? ', ' : ''}${+p.fout > 0 ? `wyjście do koloru ${p.color} od ${st} s` : ''}.`)];
      const withAudio = p.audio && ctx.info.hasAudio;
      if (withAudio) segs.push(seg('filter', ['-af', af.join(',')], 'Dźwięk: analogiczne płynne narastanie i wyciszenie (afade).'));
      segs.push(X264('veryfast', 20), withAudio ? AAC(ctx) : ACOPY(ctx), FASTSTART, OUT('output.mp4'));
      return { segs: segs.filter(Boolean), out: { file: 'output.mp4', kind: 'video' }, duration: D };
    },
    check: (ctx) => VIDEO_ONLY(ctx) || NEEDS_DURATION(ctx),
  },

  // ─────────────────────────────── CZAS
  {
    id: 'speed',
    group: 'time',
    icon: 'gauge',
    title: 'Zmiana prędkości',
    tagline: 'Timelapse ×4 albo slow motion ×0,5 – z dźwiękiem bez „efektu Smerfa”.',
    explain: `<p>Przyspiesza lub zwalnia nagranie. Dźwięk jest dopasowywany tak, by zachować <b>naturalną wysokość głosu</b> – przyspieszona mowa nie brzmi jak u wiewiórki.</p>`,
    how: `<p>Obraz: <code>setpts=PTS/2</code> dzieli znaczniki czasu każdej klatki (PTS – Presentation Time Stamp) przez współczynnik, więc klatki wyświetlają się szybciej.</p>
      <p>Dźwięk: <code>atempo</code> zmienia tempo bez zmiany wysokości tonu. Jeden filtr działa w zakresie 0,5–2, dlatego dla ×4 łączymy dwa: <code>atempo=2.0,atempo=2</code>.</p>`,
    demo: { params: { factor: 2, audio: true }, note: 'Demo przyspiesza nagranie 2× – 6-sekundowy klip trwa 3 s, a licznik w podglądzie „po” biegnie dwa razy szybciej.' },
    params: [
      { id: 'factor', label: 'Współczynnik prędkości', type: 'range', min: 0.25, max: 4, step: 0.25, default: 2, hint: (v) => (v < 1 ? `zwolnienie – ${num(1 / v, 2)}× dłużej` : v > 1 ? `przyspieszenie – ${num(v, 2)}× szybciej` : 'bez zmiany') },
      { id: 'audio', label: 'Zachowaj dźwięk (dopasuj tempo)', type: 'toggle', default: true },
    ],
    build: (p, ctx) => {
      const f = Number(p.factor);
      const segs = [IN(ctx), seg('filter', ['-vf', `setpts=PTS/${num(f, 4)}`], `Podziel znaczniki czasu klatek przez ${num(f, 4)} – wideo ${f >= 1 ? 'przyspiesza' : 'zwalnia'}.`)];
      if (p.audio && ctx.info.hasAudio) {
        segs.push(seg('filter', ['-af', atempoChain(f)], 'Zmień tempo dźwięku tak samo, zachowując wysokość tonu (atempo).'), X264('veryfast', 21), AAC(ctx));
      } else {
        segs.push(X264('veryfast', 21));
        if (ctx.info.hasAudio) segs.push(seg('audio', ['-an'], 'Usuń dźwięk (nie pasowałby do zmienionego tempa obrazu).'));
      }
      segs.push(FASTSTART, OUT('output.mp4'));
      return { segs, out: { file: 'output.mp4', kind: 'video' }, duration: dur(ctx) / f };
    },
    check: VIDEO_ONLY,
  },

  {
    id: 'reverse',
    group: 'time',
    icon: 'rewind',
    title: 'Odtwarzanie wstecz',
    tagline: 'Puść klip od końca – obraz i dźwięk.',
    explain: `<p>Odwraca kolejność klatek – klasyczny efekt „cofania czasu”. Dźwięk też może zostać odwrócony.</p>
      <p>⚠️ Najlepiej do krótkich klipów (kilka–kilkanaście sekund): cały fragment musi zmieścić się w pamięci.</p>`,
    how: `<p>Filtry <code>reverse</code> i <code>areverse</code> buforują <b>wszystkie</b> klatki/próbki, a potem wypuszczają je w odwrotnej kolejności. Dlatego zużycie pamięci rośnie z długością klipu. Przy dłuższym materiale najpierw go przytnij.</p>`,
    demo: { params: { audio: true }, note: 'Licznik w podglądzie „po” odlicza w dół: od 00:00:05.960 do zera.' },
    params: [{ id: 'audio', label: 'Odwróć też dźwięk', type: 'toggle', default: true }],
    build: (p, ctx) => {
      const segs = [IN(ctx), seg('filter', ['-vf', 'reverse'], 'Zbuforuj wszystkie klatki i wypuść je od ostatniej.')];
      if (ctx.info.hasAudio) {
        if (p.audio) segs.push(seg('filter', ['-af', 'areverse'], 'To samo dla próbek dźwięku.'), X264('veryfast', 21), AAC(ctx));
        else segs.push(X264('veryfast', 21), seg('audio', ['-an'], 'Bez dźwięku.'));
      } else segs.push(X264('veryfast', 21));
      segs.push(FASTSTART, OUT('output.mp4'));
      return { segs, out: { file: 'output.mp4', kind: 'video' }, duration: dur(ctx) };
    },
    check: (ctx) => VIDEO_ONLY(ctx) || (dur(ctx) > 60 ? 'Plik dłuższy niż 60 s – najpierw go przytnij (reverse trzyma cały klip w pamięci).' : null),
  },

  // ─────────────────────────────── AUDIO
  {
    id: 'extract',
    group: 'audio',
    icon: 'music',
    title: 'Wyodrębnij dźwięk',
    tagline: 'Zapisz ścieżkę audio jako MP3, M4A, WAV, FLAC albo Opus.',
    explain: `<p>Wyciąga dźwięk z filmu – np. muzykę z teledysku, nagranie wykładu do słuchania w drodze albo ścieżkę do dalszej obróbki.</p>
      <p><b>Formaty stratne</b> (MP3, AAC/M4A, Opus) są małe – bitrate decyduje o jakości. <b>Bezstratne</b> (WAV, FLAC) zachowują każdą próbkę, ale są wielokrotnie większe.</p>`,
    how: `<p><code>-vn</code> = „video none”: pomiń strumień obrazu. Potem wybieramy enkoder audio. Opus przy 96 kb/s brzmi zwykle lepiej niż MP3 przy 128 kb/s. FLAC kompresuje bezstratnie (jak ZIP dla dźwięku), a WAV z <code>pcm_s16le</code> to surowe próbki 16-bit.</p>`,
    demo: { params: { format: 'mp3', br: '192k' }, note: 'Demo zapisuje dźwięk jako MP3 192 kb/s. Pod odtwarzaczami zobaczysz kształt fali (waveform) przed i po.' },
    params: [
      { id: 'format', label: 'Format', type: 'select', default: 'mp3', options: [['mp3', 'MP3 (libmp3lame)'], ['m4a', 'M4A / AAC'], ['opus', 'Opus (.opus)'], ['flac', 'FLAC – bezstratny'], ['wav', 'WAV – nieskompresowany']] },
      { id: 'br', label: 'Bitrate', type: 'select', default: '192k', options: [['96k', '96 kb/s'], ['128k', '128 kb/s'], ['192k', '192 kb/s'], ['256k', '256 kb/s'], ['320k', '320 kb/s']], when: (p) => !['flac', 'wav'].includes(p.format) },
    ],
    waveform: true,
    build: (p, ctx) => {
      const enc = {
        mp3: [['-c:a', 'libmp3lame', '-b:a', p.br], `Enkoder MP3 (LAME), ${p.br.replace('k', ' kb/s')}.`],
        m4a: [['-c:a', 'aac', '-b:a', p.br], `Enkoder AAC, ${p.br.replace('k', ' kb/s')}, w kontenerze M4A.`],
        opus: [['-c:a', 'libopus', '-b:a', p.br], `Enkoder Opus, ${p.br.replace('k', ' kb/s')}.`],
        flac: [['-c:a', 'flac'], 'FLAC – kompresja bezstratna.'],
        wav: [['-c:a', 'pcm_s16le'], 'Nieskompresowane próbki PCM 16-bit.'],
      }[p.format];
      const file = `output.${p.format}`;
      return {
        segs: [IN(ctx), seg('video', ['-vn'], 'Pomiń obraz – interesuje nas tylko dźwięk.'), seg('audio', enc[0], enc[1]), OUT(file)],
        out: { file, kind: 'audio' }, duration: dur(ctx),
      };
    },
    check: AUDIO_ONLY,
  },

  {
    id: 'mute',
    group: 'audio',
    icon: 'mute',
    title: 'Usuń dźwięk',
    tagline: 'Wycisz film w sekundę – bez ponownego kodowania obrazu.',
    explain: `<p>Usuwa ścieżkę dźwiękową: hałas z wiatru, rozmowy w tle, muzyka objęta prawami autorskimi. Obraz zostaje <b>nietknięty</b> – bit w bit taki sam jak w oryginale.</p>`,
    how: `<p><code>-an</code> = „audio none”. Połączone z <code>-c:v copy</code> (stream copy) daje operację, która tylko przepisuje dane obrazu do nowego pliku – dlatego trwa ułamek sekundy nawet dla długich filmów i nie traci jakości.</p>`,
    demo: { params: {}, note: 'Wynik powstaje niemal natychmiast. W tabeli zobaczysz, że strumień audio zniknął, a kodek i bitrate obrazu są identyczne.' },
    params: [],
    build: (p, ctx) => ({
      segs: [IN(ctx), seg('video', ['-c:v', 'copy'], 'Skopiuj obraz bez zmian (stream copy).'), seg('audio', ['-an'], 'Nie zapisuj żadnego strumienia audio.'), OUT(`output.${ctx.ext === 'mov' || ctx.ext === 'mkv' ? ctx.ext : 'mp4'}`)],
      out: { file: `output.${ctx.ext === 'mov' || ctx.ext === 'mkv' ? ctx.ext : 'mp4'}`, kind: 'video' }, duration: dur(ctx),
    }),
    check: VIDEO_ONLY,
  },

  {
    id: 'volume',
    group: 'audio',
    icon: 'volume',
    title: 'Głośność i normalizacja',
    tagline: 'Podgłośnij, ścisz albo wyrównaj głośność do standardu YouTube/Spotify.',
    explain: `<p>Za cicho? Za głośno? Albo raz szept, raz krzyk? Możesz po prostu dodać/odjąć decybele albo <b>znormalizować</b> nagranie do standardowej głośności odczuwalnej (LUFS) – tak jak robią to platformy streamingowe.</p>
      <p>+6 dB ≈ dwa razy większa amplituda, −6 dB ≈ o połowę mniejsza.</p>`,
    how: `<p><code>volume=6dB</code> mnoży każdą próbkę przez stały współczynnik. <code>loudnorm</code> mierzy głośność według normy EBU R128 i dostosowuje ją do celu: <b>I</b> = średnia głośność (LUFS), <b>TP</b> = maksymalny szczyt (true peak), <b>LRA</b> = dopuszczalna rozpiętość dynamiki. <code>dynaudnorm</code> działa dynamicznie – podnosi ciche fragmenty i tłumi głośne.</p>
      <p>Obraz kopiujemy bez zmian (<code>-c:v copy</code>), ponownie kodujemy tylko dźwięk.</p>`,
    demo: { params: { mode: 'gain', gain: -12, target: '-16' }, note: 'Demo ścisza dźwięk o 12 dB (≈ 4× mniejsza amplituda). Porównaj wysokość fali na wykresach waveform pod odtwarzaczami.' },
    params: [
      { id: 'mode', label: 'Tryb', type: 'select', default: 'loudnorm', options: [['gain', 'Zmień o stałą wartość (dB)'], ['loudnorm', 'Normalizuj do LUFS (EBU R128)'], ['dynaudnorm', 'Wyrównuj dynamicznie (dynaudnorm)']] },
      { id: 'gain', label: 'Zmiana głośności (dB)', type: 'range', min: -30, max: 20, step: 1, default: 6, when: (p) => p.mode === 'gain' },
      { id: 'target', label: 'Docelowa głośność', type: 'select', default: '-14', options: [['-14', '−14 LUFS – YouTube, Spotify'], ['-16', '−16 LUFS – podcasty, Apple'], ['-23', '−23 LUFS – telewizja (EBU)']], when: (p) => p.mode === 'loudnorm' },
    ],
    waveform: true,
    build: (p, ctx) => {
      const af = p.mode === 'gain' ? `volume=${p.gain}dB` : p.mode === 'loudnorm' ? `loudnorm=I=${p.target}:TP=-1.5:LRA=11` : 'dynaudnorm';
      const d = p.mode === 'gain' ? `Zmień głośność o ${p.gain} dB.` : p.mode === 'loudnorm' ? `Normalizacja EBU R128 do ${p.target} LUFS, szczyty maks. −1,5 dBTP.` : 'Dynamiczna normalizacja: wyrównuje ciche i głośne fragmenty.';
      const video = ctx.info.hasVideo;
      const file = video ? 'output.mp4' : 'output.m4a';
      return {
        segs: [IN(ctx), seg('filter', ['-af', af], d),
          video ? seg('video', ['-c:v', 'copy'], 'Obraz bez zmian (stream copy).') : null,
          seg('audio', ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000'], 'Zakoduj dźwięk w AAC 160 kb/s, 48 kHz (loudnorm wewnętrznie podnosi próbkowanie, więc ustalamy je jawnie).'),
          OUT(file)].filter(Boolean),
        out: { file, kind: video ? 'video' : 'audio' }, duration: dur(ctx),
      };
    },
    check: AUDIO_ONLY,
  },

  // ─────────────────────────────── EKSPORT
  {
    id: 'gif',
    group: 'export',
    icon: 'film',
    title: 'Wideo → GIF / WebP',
    tagline: 'Animowany GIF wysokiej jakości dzięki własnej palecie kolorów.',
    explain: `<p>Tworzy zapętloną animację do wiadomości, README na GitHubie albo memów. Wybierasz fragment, liczbę klatek na sekundę i szerokość.</p>
      <p>GIF ma tylko <b>256 kolorów</b>, więc sekret jakości to dobranie palety do konkretnego filmu. Animowany <b>WebP</b> wygląda lepiej i waży mniej, ale nie wszędzie jest obsługiwany.</p>`,
    how: `<p>Najlepsza metoda to jeden graf filtrów w dwóch krokach: <code>split</code> rozdwaja strumień, <code>palettegen</code> analizuje wszystkie klatki i tworzy optymalną paletę 256 kolorów, a <code>paletteuse</code> przemapowuje klatki na tę paletę z <b>ditheringiem</b> (rozpraszaniem błędu – udaje brakujące kolory mieszaniną kropek).</p>
      <p>Bez własnej palety FFmpeg użyje ogólnej palety „web” – kolory wyjdą bure i pasiaste.</p>`,
    demo: { params: { format: 'gif', start: 0, len: 4, fps: 12, width: '320', quality: 'palette', dither: 'sierra2_4a' }, note: 'Demo tworzy 4-sekundowy GIF 320 px, 12 kl./s z paletą dobraną do filmu. Przełącz „Jakość” na „Prosta” i uruchom ponownie – porównaj gradienty.' },
    params: [
      { id: 'format', label: 'Format', type: 'select', default: 'gif', options: [['gif', 'GIF'], ['webp', 'Animowany WebP']] },
      { id: 'start', label: 'Start (s)', type: 'number', default: 0, min: 0, step: 0.1 },
      { id: 'len', label: 'Długość (s)', type: 'number', default: 3, min: 0.5, step: 0.5 },
      { id: 'fps', label: 'Klatki na sekundę', type: 'range', min: 5, max: 30, step: 1, default: 12 },
      { id: 'width', label: 'Szerokość', type: 'select', default: '480', options: [['240', '240 px'], ['320', '320 px'], ['480', '480 px'], ['640', '640 px']] },
      { id: 'quality', label: 'Jakość kolorów', type: 'select', default: 'palette', options: [['palette', 'Wysoka – własna paleta (palettegen)'], ['simple', 'Prosta – paleta ogólna']], when: (p) => p.format === 'gif' },
      { id: 'dither', label: 'Dithering', type: 'select', default: 'sierra2_4a', options: [['sierra2_4a', 'sierra2_4a – gładki'], ['bayer:bayer_scale=3', 'bayer – regularna siatka'], ['floyd_steinberg', 'Floyd–Steinberg'], ['none', 'brak – pasy, ale mniejszy plik']], when: (p) => p.format === 'gif' && p.quality === 'palette' },
    ],
    build: (p, ctx) => {
      const base = `fps=${p.fps},scale=${p.width}:-1:flags=lanczos`;
      const segs = [seg('in', ['-ss', num(p.start)], `Zacznij od ${num(p.start)} s.`), seg('in', ['-t', num(p.len)], `Czytaj tylko ${num(p.len)} s wejścia.`), IN(ctx)];
      let file;
      if (p.format === 'webp') {
        file = 'output.webp';
        segs.push(seg('filter', ['-vf', base], `Zmniejsz do ${p.fps} kl./s i ${p.width} px szerokości.`),
          seg('video', ['-c:v', 'libwebp_anim', '-quality', '75', '-loop', '0'], 'Enkoder animowanego WebP, jakość 75, pętla w nieskończoność (loop 0).'));
      } else {
        file = 'output.gif';
        if (p.quality === 'palette') {
          segs.push(seg('filter', ['-filter_complex', `${base},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=${p.dither}`],
            `Zmniejsz do ${p.fps} kl./s i ${p.width} px → rozdwój strumień → z kopii [a] zbuduj optymalną paletę [p] → przemapuj [b] na tę paletę z ditheringiem ${p.dither.split(':')[0]}.`));
        } else segs.push(seg('filter', ['-vf', base], `Zmniejsz do ${p.fps} kl./s i ${p.width} px (paleta ogólna).`));
        segs.push(seg('out', ['-loop', '0'], 'Zapętlaj animację w nieskończoność.'));
      }
      segs.push(OUT(file, `Plik ${p.format.toUpperCase()}.`));
      return { segs, out: { file, kind: 'image' }, duration: Number(p.len) };
    },
    check: VIDEO_ONLY,
  },

  {
    id: 'thumbs',
    group: 'export',
    icon: 'grid',
    title: 'Klatka i siatka miniatur',
    tagline: 'Zrzut ekranu z dowolnej sekundy albo podgląd całego filmu na jednym obrazku.',
    explain: `<p>Dwa tryby: <b>pojedyncza klatka</b> – idealna miniatura (thumbnail) na YouTube czy okładka, oraz <b>siatka miniatur</b> (contact sheet) – kilkanaście kadrów z całego filmu na jednym obrazku, żeby szybko zobaczyć, co w nim jest.</p>`,
    how: `<p>Pojedyncza klatka: <code>-ss</code> przewija do momentu, a <code>-frames:v 1</code> zapisuje dokładnie jedną klatkę jako obraz.</p>
      <p>Siatka: <code>fps=N/czas</code> wybiera N równomiernie rozłożonych klatek, <code>scale</code> je zmniejsza, a <code>tile=4x3</code> układa je w kafelki – z odstępami (<code>padding</code>) i marginesem.</p>`,
    demo: { params: { mode: 'grid', cols: 3, rows: 2, tw: 240, t: 2, fmt: 'jpg' }, note: 'Demo tworzy siatkę 3×2: sześć kadrów rozłożonych co sekundę – licznik na każdym kafelku pokazuje, z której chwili pochodzi.' },
    params: [
      { id: 'mode', label: 'Tryb', type: 'select', default: 'frame', options: [['frame', 'Pojedyncza klatka'], ['grid', 'Siatka miniatur']] },
      { id: 't', label: 'Moment (s)', type: 'number', default: 1, min: 0, step: 0.1, when: (p) => p.mode === 'frame' },
      { id: 'cols', label: 'Kolumny', type: 'range', min: 2, max: 8, step: 1, default: 4, when: (p) => p.mode === 'grid' },
      { id: 'rows', label: 'Wiersze', type: 'range', min: 1, max: 8, step: 1, default: 3, when: (p) => p.mode === 'grid' },
      { id: 'tw', label: 'Szerokość kafelka (px)', type: 'range', min: 120, max: 480, step: 20, default: 240, when: (p) => p.mode === 'grid' },
      { id: 'fmt', label: 'Format', type: 'select', default: 'jpg', options: [['jpg', 'JPG'], ['png', 'PNG (bezstratny)'], ['webp', 'WebP']] },
    ],
    build: (p, ctx) => {
      const file = `output.${p.fmt}`;
      const q = p.fmt === 'jpg' ? seg('video', ['-q:v', '3'], 'Jakość JPG (skala 2–31, mniej = lepiej).') : null;
      if (p.mode === 'frame') {
        return {
          segs: [seg('in', ['-ss', num(p.t)], `Przewiń do ${num(p.t)} s.`), IN(ctx), seg('out', ['-frames:v', '1'], 'Zapisz dokładnie jedną klatkę.'), q, OUT(file, 'Obraz wynikowy.')].filter(Boolean),
          out: { file, kind: 'image' }, duration: 0,
        };
      }
      const n = p.cols * p.rows;
      const D = dur(ctx) || 10;
      return {
        segs: [IN(ctx),
          seg('filter', ['-vf', `fps=${n}/${num(D, 3)},scale=${p.tw}:-1,tile=${p.cols}x${p.rows}:padding=6:margin=6:color=0x111111`],
            `Weź ${n} klatek równo rozłożonych na ${num(D, 1)} s, zmniejsz każdą do ${p.tw} px i ułóż w siatkę ${p.cols}×${p.rows}.`),
          seg('out', ['-frames:v', '1'], 'Zapisz jeden obraz – gotową siatkę.'), q, OUT(file, 'Obraz wynikowy.')].filter(Boolean),
        out: { file, kind: 'image' }, duration: D,
      };
    },
    check: VIDEO_ONLY,
  },

  // ─────────────────────────────── ZAAWANSOWANE
  {
    id: 'custom',
    group: 'pro',
    icon: 'terminal',
    title: 'Własne polecenie',
    tagline: 'Pełna moc FFmpeg: wpisz dowolne argumenty jak w terminalu.',
    explain: `<p>Dla tych, którzy znają FFmpeg (albo znaleźli przepis w internecie). Wpisz argumenty tak jak w terminalu – bez słowa <code>ffmpeg</code> na początku. Plik wejściowy jest dostępny jako <code>{in}</code>, a wynik zapisz do nazwy podanej niżej.</p>
      <p>Wybierz jeden z przykładów, żeby zobaczyć ciekawe filtry w akcji.</p>`,
    how: `<p>Polecenie trafia w całości do <code>ffmpeg.exec()</code> w WebAssembly. Działa prawie wszystko, co w zwykłym FFmpeg – z wyjątkiem akceleracji GPU, urządzeń (kamera, mikrofon) i sieci. Dostępne kodeki: H.264, H.265, VP8, VP9, Theora, AAC, MP3, Opus, Vorbis, FLAC, PNG, WebP, GIF i wiele filtrów.</p>`,
    demo: { params: { example: 'mirror' }, note: 'Demo składa obraz z oryginału i jego lustrzanego odbicia obok siebie (hstack) – podgląd „po” ma dwukrotną szerokość.' },
    params: [
      { id: 'example', label: 'Przykład', type: 'select', default: 'mirror', options: [
        ['mirror', 'Obok siebie: oryginał + lustro (hstack)'],
        ['pixel', 'Pikselizacja (scale w dół i w górę)'],
        ['blur', 'Rozmycie Gaussa (gblur)'],
        ['vu', 'Wizualizacja dźwięku (showwaves)'],
        ['grid4', 'Ściana 2×2 z różnymi efektami (xstack)'],
        ['own', '— moje własne —']] },
      { id: 'cmd', label: 'Argumenty FFmpeg', type: 'textarea', rows: 3, default: '', mono: true },
      { id: 'out', label: 'Plik wynikowy', type: 'text', default: 'output.mp4', mono: true },
    ],
    examples: {
      mirror: ['-i {in} -filter_complex "[0:v]split[a][b];[b]hflip[m];[a][m]hstack" -c:v libx264 -preset veryfast -c:a copy', 'output.mp4'],
      pixel: ['-i {in} -vf "scale=iw/12:-2,scale=iw*12:-2:flags=neighbor" -c:v libx264 -preset veryfast -c:a copy', 'output.mp4'],
      blur: ['-i {in} -vf "gblur=sigma=8" -c:v libx264 -preset veryfast -c:a copy', 'output.mp4'],
      vu: ['-i {in} -filter_complex "[0:a]showwaves=s=640x200:mode=cline:colors=0x8b5cf6[v]" -map "[v]" -map 0:a -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac', 'output.mp4'],
      grid4: ['-i {in} -filter_complex "[0:v]scale=320:-2,split=4[a][b][c][d];[b]hue=s=0[b2];[c]negate[c2];[d]edgedetect[d2];[a][b2][c2][d2]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0" -c:v libx264 -preset veryfast -c:a copy', 'output.mp4'],
    },
    validate: (p) => (p.cmd.includes('{in}') ? (p.cmd.includes(p.out) ? 'Nie podawaj pliku wynikowego w argumentach – zostanie dodany na końcu automatycznie.' : null) : 'W poleceniu brakuje {in} – miejsca na plik wejściowy.'),
    build: (p, ctx, parseArgs) => {
      const args = parseArgs(p.cmd).map((a) => a.replaceAll('{in}', ctx.input));
      const out = (p.out || 'output.mp4').replace(/[^\w.-]/g, '_');
      const ext = out.split('.').pop().toLowerCase();
      const kind = ['mp3', 'wav', 'flac', 'm4a', 'opus', 'ogg', 'aac'].includes(ext) ? 'audio' : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext) ? 'image' : 'video';
      return {
        segs: [seg('global', args, 'Twoje argumenty – przekazane do FFmpeg bez zmian ({in} zastąpione nazwą pliku wejściowego).'), OUT(out)],
        out: { file: out, kind }, duration: dur(ctx),
      };
    },
  },
];

export const byId = Object.fromEntries(FEATURES.map((f) => [f.id, f]));

export function defaultParams(feature) {
  const p = {};
  for (const prm of feature.params) if (prm.default !== undefined) p[prm.id] = prm.default;
  if (feature.examples) {
    const [cmd, out] = feature.examples[p.example] || ['', 'output.mp4'];
    p.cmd = cmd; p.out = out;
  }
  return p;
}

export function demoParams(feature) {
  const p = { ...defaultParams(feature), ...(feature.demo?.params || {}) };
  if (feature.examples && feature.examples[p.example]) [p.cmd, p.out] = feature.examples[p.example];
  return p;
}

import { engine, quote, parseArgs } from './engine.js';
import { FEATURES, GROUPS, CATEGORIES, byId, defaultParams, demoParams } from './features.js';
import { icon } from './icons.js';
import { initAI } from './ai.js';

// ───────────────────────────────────────────── pomocnicze
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtBytes = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
const fmtTime = (s) => {
  if (!(s >= 0)) return '—';
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m ? `${m}:${r.toFixed(1).padStart(4, '0')} min` : `${r.toFixed(2)} s`;
};
const MIME = { mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', gif: 'image/gif', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/ogg', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav' };
const extOf = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');

function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((el) => { el.innerHTML = icon(el.dataset.icon); el.removeAttribute('data-icon'); });
}

let toastTimer;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// Kontekst „wirtualnego” pliku przykładowego – używany do podglądu poleceń, zanim cokolwiek zostanie wczytane.
const SAMPLE_INFO = { duration: 6, width: 640, height: 360, fps: 25, hasVideo: true, hasAudio: true, vcodec: 'h264', acodec: 'aac' };

// ───────────────────────────────────────────── stan
const state = {
  feature: FEATURES[1],
  params: {},
  input: null, // { name, fsName, ext, size, url, info, probe, isSample, mime }
  sample: null, // Uint8Array
  fontReady: null,
  extra: {}, // pliki dodatkowe wg id parametru: { name, fsName, data, info }
  extraInfo: {}, // info o wygenerowanych plikach domyślnych
  running: false,
  done: new Set(),
  waveCache: new Map(),
  results: [],
};

// Parametry typu „file” = dodatkowe wejścia (logo, drugi klip, muzyka…). Gdy użytkownik nic nie wybierze,
// funkcja dostaje plik domyślny (prm.fallback), generowany w przeglądarce przez prm.make.
function fileParams(f) { return f.params.filter((p) => p.type === 'file'); }

function ctx() {
  const inp = state.input;
  const files = {};
  const infos = {};
  for (const prm of fileParams(state.feature)) {
    const ex = state.extra[prm.id];
    files[prm.id] = ex ? ex.fsName : prm.fallback;
    infos[prm.id] = (ex ? ex.info : state.extraInfo[prm.id]) || prm.fallbackInfo || SAMPLE_INFO;
  }
  return { input: inp?.fsName || 'input.mp4', ext: inp?.ext || 'mp4', info: inp?.info || SAMPLE_INFO, files, infos };
}

function sampleCtx(f) {
  const files = {};
  const infos = {};
  for (const prm of f ? fileParams(f) : []) { files[prm.id] = prm.fallback; infos[prm.id] = prm.fallbackInfo || SAMPLE_INFO; }
  return { input: 'sample.mp4', ext: 'mp4', info: SAMPLE_INFO, files, infos };
}

function buildFor(feature, params, c) {
  return feature.build(params, c, parseArgs);
}

// ───────────────────────────────────────────── renderowanie polecenia
function renderCommand(cmdEl, legendEl, built, { compact = false } = {}) {
  const prog = built.tool || 'ffmpeg';
  const segs = built.segs;
  cmdEl.innerHTML = `<span class="prog">${prog}</span>` + segs.map((s, i) =>
    `<span class="tok${s.a.map(quote).join(' ').length < 28 ? ' nw' : ''}" data-i="${i}" style="--c:${CATEGORIES[s.k].color}">${esc(s.a.map(quote).join(' '))}</span>`).join(' ');
  if (legendEl) {
    legendEl.innerHTML = segs.map((s, i) =>
      `<li data-i="${i}" style="--c:${CATEGORIES[s.k].color}"><code>${esc(compact && s.a.join(' ').length > 46 ? s.a.map(quote).join(' ').slice(0, 44) + '…' : s.a.map(quote).join(' '))}</code><span>${esc(s.d)}</span></li>`).join('');
  }
  const link = (root) => {
    root.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-i]');
      if (!el) return;
      const i = el.dataset.i;
      $$('[data-i]', cmdEl).concat(legendEl ? $$('[data-i]', legendEl) : []).forEach((x) => x.classList.toggle('hi', x.dataset.i === i));
    });
    root.addEventListener('mouseleave', () => $$('.hi', cmdEl).concat(legendEl ? $$('.hi', legendEl) : []).forEach((x) => x.classList.remove('hi')));
  };
  if (!cmdEl.dataset.linked) { link(cmdEl); if (legendEl) link(legendEl); cmdEl.dataset.linked = '1'; }
}

function commandText(built) {
  return `${built.tool || 'ffmpeg'} ${built.segs.flatMap((s) => s.a).map(quote).join(' ')}`;
}

// ───────────────────────────────────────────── hero: rotujące polecenia
function initHero() {
  const ids = ['compress', 'gif', 'trim', 'watermark', 'speed', 'subtitles', 'crop'];
  let i = 0;
  const body = $('.term-body');
  const show = () => {
    const f = byId[ids[i % ids.length]];
    $('#heroTitle').textContent = f.title;
    renderCommand($('#heroCmd'), $('#heroLegend'), buildFor(f, demoParams(f), sampleCtx(f)), { compact: true });
    i++;
  };
  show();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(() => {
      if (body.matches(':hover')) return;
      body.classList.add('fading');
      setTimeout(() => { show(); body.classList.remove('fading'); }, 320);
    }, 5200);
  }
  $('#featCount').textContent = FEATURES.length;
}

// ───────────────────────────────────────────── explainer pipeline
const STAGES = {
  demux: ['Demuxer – rozpakowanie kontenera', 'Czyta plik (np. .mov) i rozdziela go na osobne strumienie: obraz, dźwięk, napisy. Dane wciąż są skompresowane. Opcje przed -i (np. -ss do przewijania) działają właśnie tutaj.'],
  decode: ['Dekoder – rozpakowanie kodeka', 'Zamienia skompresowane pakiety (np. H.264, AAC) na surowe klatki obrazu i próbki dźwięku. Surowe wideo jest ogromne: minuta Full HD to kilka gigabajtów!'],
  filter: ['Filtry – obróbka klatek', 'Tu dzieje się „magia”: skalowanie (scale), kadrowanie (crop), kolory (eq), tekst (drawtext), zmiana tempa (setpts, atempo)… Proste łańcuchy podajesz przez -vf / -af, złożone grafy z wieloma wejściami przez -filter_complex.'],
  encode: ['Enkoder – kompresja', 'Ponownie kompresuje klatki wybranym kodekiem: -c:v libx264, -c:a aac itd. Tu decydujesz o jakości i rozmiarze pliku: CRF, bitrate, preset.'],
  mux: ['Muxer – pakowanie do kontenera', 'Układa zakodowane strumienie w docelowym kontenerze, przeplatając obraz i dźwięk, dopisując znaczniki czasu i indeks. Format wynika z rozszerzenia pliku wyjściowego (lub opcji -f).'],
};
function initPipeline() {
  const desc = $('#plDesc');
  const show = (k) => {
    $$('.pl-stage').forEach((b) => b.classList.toggle('active', b.dataset.stage === k));
    desc.innerHTML = `<h4>${STAGES[k][0]}</h4><p>${STAGES[k][1]}</p>`;
  };
  $$('.pl-stage').forEach((b) => {
    b.addEventListener('click', () => show(b.dataset.stage));
    b.addEventListener('mouseenter', () => show(b.dataset.stage));
  });
  show('filter');
  $('#bypassToggle').addEventListener('change', (e) => {
    $('#pipeline').classList.toggle('bypass', e.target.checked);
    desc.innerHTML = e.target.checked
      ? '<h4>Stream copy: <code>-c copy</code></h4><p>Pakiety idą prosto z demuxera do muxera – bez dekodowania, filtrów i kodowania. Dlatego remux czy cięcie z -c copy trwa ułamek sekundy i nie traci jakości, ale nie można wtedy niczego zmienić w obrazie ani dźwięku.</p>'
      : `<h4>${STAGES.filter[0]}</h4><p>${STAGES.filter[1]}</p>`;
  });

  // anatomia polecenia
  const anatomy = {
    segs: [
      { k: 'global', a: ['-hide_banner'], d: 'Opcja globalna: nie wypisuj banera z wersją i konfiguracją.' },
      { k: 'in', a: ['-ss', '00:00:05'], d: 'Opcja WEJŚCIA (bo stoi przed -i): zacznij czytać od 5. sekundy.' },
      { k: 'in', a: ['-i', 'wakacje.mov'], d: 'Plik wejściowy nr 0. Może ich być kilka – każdy z własnym -i.' },
      { k: 'filter', a: ['-vf', 'scale=1280:-2,eq=saturation=1.3'], d: 'Łańcuch filtrów wideo: zmniejsz do 1280 px szerokości, potem podbij nasycenie.' },
      { k: 'video', a: ['-c:v', 'libx264', '-crf', '23', '-preset', 'medium'], d: 'Enkoder wideo H.264, jakość CRF 23, preset medium.' },
      { k: 'audio', a: ['-c:a', 'aac', '-b:a', '128k'], d: 'Enkoder audio AAC, 128 kb/s.' },
      { k: 'out', a: ['-t', '30'], d: 'Opcja WYJŚCIA: zapisz maksymalnie 30 sekund.' },
      { k: 'out', a: ['wakacje.mp4'], d: 'Plik wynikowy – rozszerzenie .mp4 wybiera muxer MP4.' },
    ],
  };
  renderCommand($('#anatomyCmd'), $('#anatomyLegend'), anatomy);
}

// ───────────────────────────────────────────── karty funkcji
function initFeatureGrid() {
  const filter = $('#featureFilter');
  filter.innerHTML = `<button class="chip active" data-g="all">Wszystkie (${FEATURES.length})</button>` +
    GROUPS.map((g) => `<button class="chip" data-g="${g.id}">${g.label}</button>`).join('');
  const grid = $('#featureGrid');
  const order = GROUPS.map((g) => g.id);
  const sorted = [...FEATURES].sort((x, y) => order.indexOf(x.group) - order.indexOf(y.group));
  grid.innerHTML = sorted.map((f) => {
    const b = buildFor(f, demoParams(f), sampleCtx(f));
    return `<article class="fcard" data-g="${f.group}">
      <div class="fcard-top"><span class="fcard-ico">${icon(f.icon)}</span><div><div class="fcard-group">${GROUPS.find((g) => g.id === f.group).label}</div><h3>${f.title}</h3></div></div>
      <p>${f.tagline}</p>
      <div class="fcard-cmd" title="${esc(commandText(b))}">${esc(commandText(b))}</div>
      <div class="fcard-actions">
        <button class="btn btn-accent btn-sm" data-demo="${f.id}">${icon('play')}Zobacz demo</button>
        <button class="btn btn-ghost btn-sm" data-open="${f.id}">Otwórz</button>
      </div>
    </article>`;
  }).join('');
  filter.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    $$('.chip', filter).forEach((x) => x.classList.toggle('active', x === c));
    $$('.fcard', grid).forEach((card) => { card.hidden = c.dataset.g !== 'all' && card.dataset.g !== c.dataset.g; });
  });
  grid.addEventListener('click', (e) => {
    const d = e.target.closest('[data-demo]');
    const o = e.target.closest('[data-open]');
    if (d) { selectFeature(d.dataset.demo); goStudio(); runDemo(); }
    if (o) { selectFeature(o.dataset.open); goStudio(); }
  });
}

function goStudio() {
  $('#feature').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

// ───────────────────────────────────────────── nawigacja studia
function initStudioNav() {
  const nav = $('#studioNav');
  nav.innerHTML = GROUPS.map((g) => `<div class="nav-group">${g.label}</div>` +
    FEATURES.filter((f) => f.group === g.id).map((f) => `<button class="nav-item" data-id="${f.id}">${icon(f.icon)}<span>${f.title}</span></button>`).join('')).join('');
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('.nav-item');
    if (b) selectFeature(b.dataset.id);
  });
}

function markDone(id) {
  state.done.add(id);
  const b = $(`.nav-item[data-id="${id}"]`);
  if (b && !$('.done', b)) b.insertAdjacentHTML('beforeend', '<i class="done" title="Uruchomione"></i>');
}

function selectFeature(id, params) {
  const f = byId[id];
  state.feature = f;
  state.params = params || defaultParams(f);
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  const active = $(`.nav-item[data-id="${id}"]`);
  if (active && matchMedia('(max-width: 900px)').matches) active.scrollIntoView({ inline: 'center', block: 'nearest' });
  $('#fIcon').innerHTML = icon(f.icon);
  $('#fTitle').textContent = f.title;
  $('#fTagline').textContent = f.tagline;
  $('#fWhat').innerHTML = f.explain;
  $('#fHow').innerHTML = f.how;
  $('#fDemo').textContent = f.demo?.note || '';
  $('#formError').textContent = '';
  $('#runBtn').lastChild.textContent = f.special === 'probe' ? 'Analizuj' : 'Uruchom';
  renderParams();
  updateCommand();
  try { history.replaceState(null, '', `#${id}`); } catch {}
}

// ───────────────────────────────────────────── formularz parametrów
function renderParams() {
  const f = state.feature;
  const p = state.params;
  const form = $('#params');
  if (!f.params.length) {
    form.innerHTML = '<p class="no-params">Ta funkcja nie ma parametrów – wystarczy ją uruchomić.</p>';
    return;
  }
  form.innerHTML = f.params.filter((prm) => !prm.when || prm.when(p)).map((prm) => {
    const id = `p_${prm.id}`;
    const v = p[prm.id];
    const hint = typeof prm.hint === 'function' ? prm.hint(v) : prm.hint;
    const hintHtml = hint ? `<span class="hint" data-hint="${prm.id}">${esc(hint)}</span>` : '';
    const full = ['textarea', 'file'].includes(prm.type) || prm.mono || prm.id === 'text' ? ' full' : '';
    switch (prm.type) {
      case 'select':
        return `<div class="field${full}"><label for="${id}">${prm.label}</label><select id="${id}" name="${prm.id}">${prm.options.map(([val, lab]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>${hintHtml}</div>`;
      case 'range':
        return `<div class="field${full}"><label for="${id}">${prm.label}<output id="${id}_o">${v}</output></label><input type="range" id="${id}" name="${prm.id}" min="${prm.min}" max="${prm.max}" step="${prm.step}" value="${v}">${hintHtml}</div>`;
      case 'number':
        return `<div class="field${full}"><label for="${id}">${prm.label}</label><input type="number" id="${id}" name="${prm.id}" value="${v}" ${prm.min != null ? `min="${prm.min}"` : ''} ${prm.max != null ? `max="${prm.max}"` : ''} step="${prm.step || 1}">${hintHtml}</div>`;
      case 'text':
        return `<div class="field${full}"><label for="${id}">${prm.label}</label><input type="text" id="${id}" name="${prm.id}" value="${esc(v)}" class="${prm.mono ? 'mono' : ''}" spellcheck="false">${hintHtml}</div>`;
      case 'textarea':
        return `<div class="field full"><label for="${id}">${prm.label}</label><textarea id="${id}" name="${prm.id}" rows="${prm.rows || 4}" class="${prm.mono ? 'mono' : ''}" spellcheck="false">${esc(v)}</textarea>${hintHtml}</div>`;
      case 'toggle':
        return `<div class="field field-toggle${full}"><label class="switch"><input type="checkbox" id="${id}" name="${prm.id}"${v ? ' checked' : ''}><span></span>${prm.label}</label>${hintHtml}</div>`;
      case 'file':
        return `<div class="field full"><label for="${id}">${prm.label}${state.extra[prm.id] ? `<span class="muted">${esc(state.extra[prm.id].name)} <button type="button" class="link-btn" data-clear="${prm.id}">usuń</button></span>` : ''}</label><input type="file" id="${id}" name="${prm.id}" accept="${prm.accept || ''}">${hintHtml}</div>`;
      default:
        return '';
    }
  }).join('');
}

function onParamInput(e) {
  const el = e.target;
  const name = el.name;
  if (!name) return;
  const f = state.feature;
  const prm = f.params.find((x) => x.id === name);
  if (!prm) return;
  if (prm.type === 'file') {
    const file = el.files[0];
    if (file) {
      file.arrayBuffer().then((buf) => {
        const ex = { name: file.name, fsName: `${name}_user.${extOf(file.name) || 'bin'}`, data: new Uint8Array(buf), info: null };
        state.extra[name] = ex;
        renderParams();
        updateCommand();
        // od razu sprawdź plik (rozdzielczość, długość, czy ma dźwięk), żeby polecenie było dokładne
        if (prm.probe) engine.writeFile(ex.fsName, ex.data).then(() => engine.probe(ex.fsName)).then((pr) => { ex.info = probeToInfo(pr); updateCommand(); }).catch(() => {});
      });
    }
    return;
  }
  let v = prm.type === 'toggle' ? el.checked : el.value;
  if (prm.type === 'range' || prm.type === 'number') v = Number(v);
  state.params[name] = v;
  if (prm.type === 'range') {
    const o = $(`#p_${name}_o`);
    if (o) o.textContent = v;
  }
  if (typeof prm.hint === 'function') {
    const h = $(`[data-hint="${name}"]`);
    if (h) h.textContent = prm.hint(v);
  }
  if (name === 'example' && f.examples) {
    if (f.examples[v]) [state.params.cmd, state.params.out] = f.examples[v];
    renderParams();
  } else if (name === 'cmd' && f.examples) {
    if (state.params.example !== 'own') { state.params.example = 'own'; $('#p_example').value = 'own'; }
  } else if (f.params.some((x) => x.when) && (prm.type === 'select' || prm.type === 'toggle')) {
    renderParams();
  }
  updateCommand();
}

function updateCommand() {
  const f = state.feature;
  let built;
  try {
    built = buildFor(f, state.params, ctx());
  } catch (err) {
    $('#cmd').textContent = `Błąd budowania polecenia: ${err.message}`;
    return;
  }
  renderCommand($('#cmd'), $('#legend'), built);
  const c = ctx();
  const err = (state.input && f.check?.(c)) || f.validate?.(state.params, c) || '';
  $('#formError').textContent = err;
}

// ───────────────────────────────────────────── silnik: UI ładowania
function initEngineUI() {
  const pill = $('#enginePill');
  const box = $('#engineLoad');
  engine.addEventListener('state', (e) => {
    const { state: s, loaded, total, error } = e.detail;
    pill.dataset.state = s;
    const label = { idle: 'Silnik: niezaładowany', loading: 'Silnik: ładowanie…', ready: 'Silnik: gotowy', busy: 'Silnik: pracuje…', error: 'Silnik: błąd' }[s];
    $('span', pill).textContent = label;
    if (s === 'loading') {
      box.hidden = false;
      const pct = total ? Math.min(100, (loaded / total) * 100) : 0;
      $('#engineBar').style.width = `${pct}%`;
      $('#engineText').textContent = loaded ? `Pobieranie FFmpeg.wasm… ${fmtBytes(loaded)} / ${fmtBytes(total)} (jednorazowo, potem z cache)` : 'Łączenie z CDN…';
    } else if (s === 'ready' || s === 'busy') {
      box.hidden = true;
    } else if (s === 'error') {
      box.hidden = false;
      $('#engineBar').style.width = '0';
      $('#engineText').textContent = `Nie udało się załadować FFmpeg: ${error?.message || error}. Sprawdź połączenie i odśwież stronę.`;
    }
  });

  const logEl = $('#log');
  let pending = [];
  let raf = 0;
  engine.addEventListener('log', (e) => {
    const { type, message } = e.detail;
    pending.push(type === 'cmd' ? `<span class="l-cmd">${esc(message)}</span>` : esc(message));
    if (!raf) raf = requestAnimationFrame(() => {
      logEl.insertAdjacentHTML('beforeend', pending.join('\n') + '\n');
      pending = [];
      raf = 0;
      if (logEl.childNodes.length > 6000) logEl.textContent = logEl.textContent.slice(-200000);
      logEl.scrollTop = logEl.scrollHeight;
    });
    if (state.progressCb) state.progressCb(message);
  });
}

// ───────────────────────────────────────────── wczytywanie wejścia
function probeToInfo(probe) {
  const streams = probe?.streams || [];
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition?.attached_pic));
  const a = streams.find((s) => s.codec_type === 'audio');
  const fr = v?.avg_frame_rate && v.avg_frame_rate !== '0/0' ? v.avg_frame_rate : v?.r_frame_rate;
  let fps = 0;
  if (fr) { const [n, d] = fr.split('/').map(Number); fps = d ? n / d : n; }
  let duration = Number(probe?.format?.duration) || Number(v?.duration) || Number(a?.duration) || 0;
  return {
    duration,
    width: v?.width || 0,
    height: v?.height || 0,
    fps: Math.round(fps * 100) / 100,
    hasVideo: !!v,
    hasAudio: !!a,
    vcodec: v?.codec_name,
    acodec: a?.codec_name,
    bitrate: Number(probe?.format?.bit_rate) || 0,
    format: probe?.format?.format_name,
    sampleRate: a?.sample_rate,
    channels: a?.channels,
  };
}

async function setInput({ name, data, isSample = false, mime }) {
  const ext = extOf(name) || 'bin';
  let base = name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'input';
  if (/^output$|^probe|^logo|^text$|^subs$|^wave/.test(base)) base = `in_${base}`;
  const fsName = `${base}.${ext}`;
  if (state.input && state.input.fsName !== fsName && !state.input.keepFs) await engine.deleteFile(state.input.fsName);
  if (state.input?.url && !state.input.persistentUrl) URL.revokeObjectURL(state.input.url);
  await engine.writeFile(fsName, data);
  const probe = await engine.probe(fsName);
  const info = probeToInfo(probe);
  const blobType = mime || MIME[ext] || 'application/octet-stream';
  const url = URL.createObjectURL(new Blob([data], { type: blobType }));
  state.input = { name, fsName, ext, size: data.length, url, info, probe, isSample, mime: blobType };
  renderSource();
  updateCommand();
  return state.input;
}

function renderSource() {
  const inp = state.input;
  const el = $('#sourceInfo');
  if (!inp) return;
  const i = inp.info;
  const facts = [
    fmtBytes(inp.size),
    i.duration ? fmtTime(i.duration) : null,
    i.hasVideo ? `${i.width}×${i.height}` : null,
    i.fps ? `${i.fps} kl./s` : null,
    i.vcodec ? `wideo: ${i.vcodec}` : null,
    i.acodec ? `audio: ${i.acodec}` : (i.hasVideo ? 'bez dźwięku' : null),
  ].filter(Boolean);
  const thumb = i.hasVideo && inp.mime.startsWith('video')
    ? `<video class="source-thumb" src="${inp.url}#t=1" muted playsinline preload="metadata"></video>`
    : inp.mime.startsWith('image') ? `<img class="source-thumb" src="${inp.url}" alt="">` : `<span class="source-ico">${icon('music')}</span>`;
  el.innerHTML = `<div class="source-file">${thumb}<div><div class="source-name">${esc(inp.name)}${inp.isSample ? '<span class="badge">PRZYKŁAD</span>' : ''}</div><div class="facts">${facts.map((f) => `<span class="fact">${esc(f)}</span>`).join('')}</div></div></div>`;
}

async function loadUserFile(file) {
  if (!file) return;
  if (file.size > 1.5 * 1024 ** 3) { toast('Plik jest większy niż 1,5 GB – to zbyt dużo dla wersji przeglądarkowej.'); return; }
  if (file.size > 400 * 1024 ** 2) toast('Duży plik – przetwarzanie może potrwać i zużyć dużo pamięci.', 5000);
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    await setInput({ name: file.name, data, mime: file.type || undefined });
    toast(`Wczytano: ${file.name}`);
  } catch (err) {
    console.error(err);
    toast(`Nie udało się wczytać pliku: ${err.message || err}`);
  }
}

// czcionka do drawtext / subtitles
function ensureFont() {
  if (!state.fontReady) {
    state.fontReady = (async () => {
      const urls = [
        'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf',
        'https://unpkg.com/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf',
      ];
      for (const u of urls) {
        try {
          const r = await fetch(u);
          if (!r.ok) continue;
          const data = new Uint8Array(await r.arrayBuffer());
          await engine.load();
          await engine.ffmpeg.createDir('/fonts').catch(() => {});
          await engine.writeFile('/fonts/DejaVuSans-Bold.ttf', data);
          return true;
        } catch (e) { console.warn('font', u, e); }
      }
      return false;
    })();
    state.fontReady.then((ok) => { if (!ok) state.fontReady = null; });
  }
  return state.fontReady;
}

async function ensureSample() {
  if (state.input?.isSample) return state.input;
  setProgress('Generowanie pliku przykładowego (FFmpeg rysuje go od zera)…', null);
  if (!state.sample) {
    const font = await ensureFont();
    const timer = font ? ",drawtext=fontfile=/fonts/DejaVuSans-Bold.ttf:text='%{pts\\:hms}':x=(w-tw)/2:y=h*0.62:fontsize=42:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=14" : '';
    const src = font ? 'testsrc2' : 'testsrc';
    const r = await engine.exec(['-f', 'lavfi', '-i', `${src}=size=640x360:rate=25:duration=6${timer}`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:beep_factor=4:duration=6',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-g', '25',
      '-af', 'volume=5', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', 'sample_gen.mp4'], { label: 'sample' });
    if (r.code !== 0) throw new Error('Nie udało się wygenerować pliku przykładowego.\n' + r.log.split('\n').slice(-8).join('\n'));
    state.sample = await engine.readFile('sample_gen.mp4');
    await engine.deleteFile('sample_gen.mp4');
  }
  return setInput({ name: 'sample.mp4', data: state.sample, isSample: true, mime: 'video/mp4' });
}

function makeDemoLogo() {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = 360; c.height = 120;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 360, 120);
    grad.addColorStop(0, '#7c5cff'); grad.addColorStop(1, '#f472b6');
    g.fillStyle = grad;
    g.beginPath(); g.roundRect(0, 0, 360, 120, 28); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(40, 30); g.lineTo(100, 60); g.lineTo(40, 90); g.closePath(); g.fill();
    g.font = '700 54px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('ffmpgui', 120, 62);
    c.toBlob(async (b) => resolve(new Uint8Array(await b.arrayBuffer())), 'image/png');
  });
}

// ───────────────────────────────────────────── uruchamianie
function setProgress(label, frac) {
  const r = $('#result');
  r.hidden = false;
  $('#progress').hidden = false;
  $('#progressLabel').textContent = label;
  const bar = $('#progressBar').parentElement;
  if (frac == null) { bar.classList.add('indeterminate'); $('#progressPct').textContent = ''; }
  else { bar.classList.remove('indeterminate'); $('#progressBar').style.width = `${Math.round(frac * 100)}%`; $('#progressPct').textContent = `${Math.round(frac * 100)}%`; }
}

function setBusy(b) {
  state.running = b;
  $('#runBtn').disabled = b;
  $('#demoBtn').disabled = b;
  $('#sampleBtn').disabled = b;
}

async function runDemo() {
  if (state.running) return;
  const f = state.feature;
  state.params = demoParams(f);
  renderParams();
  updateCommand();
  for (const prm of fileParams(f)) delete state.extra[prm.id];
  await run({ demo: true });
}

// Zapisuje do MEMFS dodatkowy plik wybrany przez użytkownika albo generuje domyślny.
async function prepareExtra(prm, c) {
  const ex = state.extra[prm.id];
  if (ex) {
    await engine.writeFile(ex.fsName, ex.data);
    if (prm.probe && !ex.info) ex.info = probeToInfo(await engine.probe(ex.fsName));
    return;
  }
  setProgress(`Przygotowanie: ${prm.makeLabel || 'plik pomocniczy'}…`, null);
  if (prm.make === 'logo') {
    await engine.writeFile(prm.fallback, await makeDemoLogo());
  } else if (typeof prm.make === 'function') {
    await engine.deleteFile(prm.fallback);
    const r = await engine.exec(prm.make(c), { label: 'extra' });
    if (r.code !== 0) { const e = new Error(`Nie udało się przygotować pliku ${prm.fallback}.`); e.log = r.log; throw e; }
  }
  if (prm.probe) state.extraInfo[prm.id] = probeToInfo(await engine.probe(prm.fallback));
}

async function run({ demo = false } = {}) {
  if (state.running) return;
  const f = state.feature;
  setBusy(true);
  $('#formError').textContent = '';
  $('#resultBody').innerHTML = '';
  const t0 = performance.now();
  try {
    if (engine.state !== 'ready') setProgress('Ładowanie silnika FFmpeg…', null);
    await engine.load();
    if (demo || !state.input) {
      if (!demo) toast('Brak pliku – używam pliku przykładowego.');
      await ensureSample();
    }
    const c = ctx();
    const err = f.check?.(c) || f.validate?.(state.params, c);
    if (err) throw Object.assign(new Error(err), { user: true });

    if (f.special === 'probe') {
      setProgress('Analiza (ffprobe)…', null);
      const probe = await engine.probe(c.input);
      renderProbe(probe, demo);
      markDone(f.id);
      return;
    }

    if (f.needsFont) {
      setProgress('Pobieranie czcionki DejaVu Sans…', null);
      if (!(await ensureFont())) throw Object.assign(new Error('Nie udało się pobrać czcionki potrzebnej do tekstu.'), { user: true });
    }
    for (const file of f.files?.(state.params) || []) await engine.writeFile(file.name, file.data);
    for (const prm of fileParams(f)) await prepareExtra(prm, c);

    const built = buildFor(f, state.params, ctx());
    const args = built.segs.flatMap((s) => s.a);
    const outFile = built.out.file;
    await engine.deleteFile(outFile);

    const expected = built.duration || 0;
    state.progressCb = (msg) => {
      const m = /time=\s*(-?\d+):(\d+):(\d+(?:\.\d+)?)/.exec(msg);
      if (m && expected > 0) {
        const t = +m[1] * 3600 + +m[2] * 60 + +m[3];
        setProgress(`Przetwarzanie… ${fmtTime(Math.max(0, t))} / ${fmtTime(expected)}`, Math.max(0, Math.min(1, t / expected)));
      }
    };
    setProgress(expected > 0 ? 'Przetwarzanie…' : 'Przetwarzanie…', expected > 0 ? 0 : null);
    const res = await engine.exec(args, { label: f.id });
    state.progressCb = null;
    if (res.code !== 0) {
      const e = new Error('FFmpeg zakończył pracę z błędem.');
      e.log = res.log;
      throw e;
    }
    let data;
    try { data = await engine.readFile(outFile); } catch { data = null; }
    if (!data || !data.length) { const e = new Error('FFmpeg nie utworzył pliku wynikowego.'); e.log = res.log; throw e; }
    const ext = extOf(outFile);
    const url = URL.createObjectURL(new Blob([data], { type: MIME[ext] || 'application/octet-stream' }));
    const outProbe = await engine.probe(outFile);
    let waves = null;
    if (f.waveform) {
      setProgress('Rysowanie kształtu fali…', null);
      waves = [await waveform(c.input, true), await waveform(outFile)];
    }
    await engine.deleteFile(outFile);
    const elapsed = (performance.now() - t0) / 1000;
    renderResult({ f, built, url, data, ext, outProbe, waves, elapsed, demo });
    markDone(f.id);
  } catch (err) {
    state.progressCb = null;
    console.error(err);
    renderError(err);
  } finally {
    $('#progress').hidden = true;
    setBusy(false);
    updateCommand(); // pokaż dokładnie to polecenie, które się wykonało (z info o plikach dodatkowych)
  }
}

async function waveform(file, cache = false) {
  const key = `${file}:${state.input?.size}`;
  if (cache && state.waveCache.has(key)) return state.waveCache.get(key);
  const out = `wave_${Math.random().toString(36).slice(2, 8)}.png`;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cff';
  const r = await engine.exec(['-i', file, '-filter_complex', `aformat=channel_layouts=mono,showwavespic=s=900x160:colors=${color.replace('#', '0x')}:scale=lin`, '-frames:v', '1', out], { label: 'wave' });
  if (r.code !== 0) return null;
  const data = await engine.readFile(out);
  await engine.deleteFile(out);
  const url = URL.createObjectURL(new Blob([data], { type: 'image/png' }));
  if (cache) state.waveCache.set(key, url);
  return url;
}

// ───────────────────────────────────────────── wyniki
function mediaHtml(url, kind, mime, wave) {
  if (kind === 'image') return `<div class="media"><img src="${url}" alt="Wynik"></div>`;
  if (kind === 'audio') return `<div class="media audio">${wave ? `<img class="wave" src="${wave}" alt="Kształt fali">` : ''}<audio controls src="${url}" preload="metadata"></audio></div>`;
  return `<div class="media">${mime?.startsWith('audio') ? `<audio controls src="${url}"></audio>` : `<video controls playsinline preload="metadata" src="${url}"></video>`}</div>${wave ? `<div class="media audio" style="margin-top:8px"><img class="wave" src="${wave}" alt="Kształt fali"></div>` : ''}`;
}

function inputKind(inp) {
  if (inp.mime.startsWith('image')) return 'image';
  if (!inp.info.hasVideo) return 'audio';
  return 'video';
}

function rowsFor(info, size, ext) {
  if (['png', 'jpg', 'jpeg', 'bmp'].includes(ext)) info = { ...info, duration: 0, fps: 0, bitrate: 0 };
  return {
    'Rozmiar pliku': fmtBytes(size),
    Kontener: ext?.toUpperCase() || '—',
    'Czas trwania': info.duration ? fmtTime(info.duration) : '—',
    Rozdzielczość: info.hasVideo && info.width ? `${info.width}×${info.height}` : '—',
    'Klatki/s': info.fps ? String(info.fps) : '—',
    'Kodek wideo': info.vcodec || '—',
    'Kodek audio': info.acodec || '—',
    'Bitrate całk.': info.bitrate ? `${Math.round(info.bitrate / 1000)} kb/s` : '—',
  };
}

function renderResult({ f, built, url, data, ext, outProbe, waves, elapsed, demo }) {
  const inp = state.input;
  const outInfo = probeToInfo(outProbe);
  const before = rowsFor(inp.info, inp.size, inp.ext);
  const after = rowsFor(outInfo, data.length, ext);
  const pct = ((data.length - inp.size) / inp.size) * 100;
  const delta = `<span class="delta ${pct <= 0 ? 'down' : 'up'}">${pct > 0 ? '+' : ''}${pct.toFixed(0)}%</span>`;
  const rows = Object.keys(before).map((k) => {
    const changed = before[k] !== after[k];
    return `<tr><td>${k}</td><td>${esc(before[k])}</td><td class="${changed ? 'changed' : ''}">${esc(after[k])}${k === 'Rozmiar pliku' ? delta : ''}</td></tr>`;
  }).join('');
  const downloadName = `${inp.name.replace(/\.[^.]+$/, '')}_${f.id}.${ext}`;
  const outKind = built.out.kind === 'video' && !outInfo.hasVideo ? 'audio' : built.out.kind;
  $('#resultBody').innerHTML = `
    <div class="result-head">
      <h4><span class="ok">${icon('sparkles')}</span>${esc(f.title)} – gotowe w ${elapsed.toFixed(1)} s</h4>
      <span class="muted">${esc(downloadName)}</span>
    </div>
    <div class="compare${outInfo.width && outInfo.height && outInfo.width / outInfo.height > 2.3 ? ' wide' : ''}">
      <figure><figcaption><span>Przed</span><span>${esc(inp.name)}</span></figcaption>${mediaHtml(inp.url, inputKind(inp), inp.mime, waves?.[0])}</figure>
      <figure><figcaption><span>Po</span><span>${esc(built.out.file)}</span></figcaption>${mediaHtml(url, outKind, MIME[ext], waves?.[1])}</figure>
    </div>
    <table class="diff"><thead><tr><th>Właściwość</th><th>Przed</th><th>Po</th></tr></thead><tbody>${rows}</tbody></table>
    ${demo && f.demo?.note ? `<div class="demo-note"><b>Na co zwrócić uwagę:</b> ${esc(f.demo.note)}</div>` : ''}
    <div class="result-actions">
      <a class="btn btn-primary" href="${url}" download="${esc(downloadName)}">${icon('download')}Pobierz (${fmtBytes(data.length)})</a>
      ${outKind === 'video' && inputKind(inp) === 'video' ? `<button class="btn btn-ghost" data-act="sync">${icon('play')}Odtwórz oba od początku</button>` : ''}
      ${['video', 'audio'].includes(outKind) ? `<button class="btn btn-ghost" data-act="chain">${icon('chain')}Użyj wyniku jako wejścia</button>` : ''}
      <button class="btn btn-ghost" data-act="copy">${icon('copy')}Kopiuj polecenie</button>
    </div>`;
  const body = $('#resultBody');
  $$('video', body).forEach((v) => v.addEventListener('error', () => {
    v.parentElement.innerHTML = '<p class="media-note">Przeglądarka nie potrafi odtworzyć tego formatu, ale plik jest poprawny – pobierz go i otwórz np. w VLC.</p>';
  }));
  body.onclick = async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'sync') {
      const vids = $$('video', body);
      vids.forEach((v) => { v.currentTime = 0; v.muted = v !== vids[1]; });
      await Promise.all(vids.map((v) => v.play().catch(() => {})));
    } else if (a === 'chain') {
      state.results.push(url);
      await setInput({ name: downloadName, data, mime: MIME[ext] });
      toast('Wynik jest teraz plikiem wejściowym – możesz łączyć operacje.');
    } else if (a === 'copy') copyCommand(built);
  };
}

function renderProbe(probe, demo) {
  if (!probe) { renderError(new Error('ffprobe nie zwrócił danych – plik może być uszkodzony lub w nieobsługiwanym formacie.')); return; }
  const fmt = probe.format || {};
  const kv = (rows) => `<table class="probe-table">${rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
  const fps = (r) => { if (!r || r === '0/0') return undefined; const [n, d] = r.split('/').map(Number); return d ? `${Math.round((n / d) * 100) / 100} kl./s` : r; };
  const kb = (b) => (b ? `${Math.round(b / 1000)} kb/s` : undefined);
  const streams = (probe.streams || []).map((s) => {
    const type = ['video', 'audio'].includes(s.codec_type) ? s.codec_type : 'other';
    const rows = s.codec_type === 'video' ? [
      ['Kodek', `${s.codec_name} (${s.codec_long_name})`], ['Profil', s.profile], ['Rozdzielczość', `${s.width}×${s.height}`],
      ['Proporcje ekranu', s.display_aspect_ratio], ['Klatki na sekundę', fps(s.avg_frame_rate)], ['Format pikseli', s.pix_fmt],
      ['Bitrate', kb(s.bit_rate)], ['Liczba klatek', s.nb_frames], ['Czas trwania', s.duration && fmtTime(+s.duration)],
    ] : s.codec_type === 'audio' ? [
      ['Kodek', `${s.codec_name} (${s.codec_long_name})`], ['Próbkowanie', s.sample_rate && `${s.sample_rate} Hz`], ['Kanały', `${s.channels} (${s.channel_layout || '?'})`],
      ['Format próbek', s.sample_fmt], ['Bitrate', kb(s.bit_rate)], ['Czas trwania', s.duration && fmtTime(+s.duration)], ['Język', s.tags?.language],
    ] : [['Kodek', s.codec_name], ['Typ', s.codec_type], ['Język', s.tags?.language]];
    return `<div class="stream-card"><h5><span class="stype ${type}">${s.codec_type}</span>Strumień #${s.index}</h5>${kv(rows)}</div>`;
  }).join('');
  $('#resultBody').innerHTML = `
    <div class="result-head"><h4><span class="ok">${icon('search')}</span>Wynik analizy: ${esc(state.input.name)}</h4></div>
    <div class="stream-card"><h5><span class="stype format">kontener</span>${esc(fmt.format_long_name || fmt.format_name || '')}</h5>${kv([
      ['Format', fmt.format_name], ['Czas trwania', fmt.duration && fmtTime(+fmt.duration)], ['Rozmiar', fmtBytes(+fmt.size || state.input.size)],
      ['Bitrate całkowity', kb(+fmt.bit_rate)], ['Liczba strumieni', fmt.nb_streams], ['Enkoder / program', fmt.tags?.encoder],
    ])}</div>
    ${streams}
    ${demo ? `<div class="demo-note"><b>Na co zwrócić uwagę:</b> ${esc(state.feature.demo.note)}</div>` : ''}
    <details class="raw"><summary>Surowy JSON z ffprobe</summary><pre>${esc(JSON.stringify(probe, null, 2))}</pre></details>`;
}

function renderError(err) {
  const r = $('#result');
  r.hidden = false;
  const tail = err.log ? err.log.split('\n').filter((l) => l.trim()).slice(-14).join('\n') : '';
  $('#resultBody').innerHTML = `<div class="error-box"><b>${err.user ? 'Nie można uruchomić' : 'Coś poszło nie tak'}</b><p class="muted" style="margin:6px 0 0;white-space:pre-wrap">${esc(err.message || String(err))}</p>${tail ? `<pre>${esc(tail)}</pre>` : ''}</div>`;
  if (err.user) $('#formError').textContent = err.message;
}

async function copyCommand(built) {
  const text = commandText(built || buildFor(state.feature, state.params, ctx()));
  try { await navigator.clipboard.writeText(text); toast('Skopiowano polecenie do schowka.'); }
  catch { toast(text, 6000); }
}

// ───────────────────────────────────────────── start
function init() {
  hydrateIcons();
  $('#copyCmd').innerHTML = icon('copy');
  initHero();
  initPipeline();
  initFeatureGrid();
  initStudioNav();
  initEngineUI();
  initAI({ onStudio: (id) => { if (byId[id]) { selectFeature(id); goStudio(); } } });

  $('#params').addEventListener('input', onParamInput);
  $('#params').addEventListener('change', (e) => { if (e.target.type === 'file' || e.target.tagName === 'SELECT' || e.target.type === 'checkbox') onParamInput(e); });
  $('#params').addEventListener('submit', (e) => e.preventDefault());
  $('#params').addEventListener('click', (e) => {
    const b = e.target.closest('[data-clear]');
    if (b) { delete state.extra[b.dataset.clear]; renderParams(); updateCommand(); }
  });
  $('#runBtn').addEventListener('click', () => run());
  $('#demoBtn').addEventListener('click', () => runDemo());
  $('#copyCmd').addEventListener('click', () => copyCommand());
  $('#fileInput').addEventListener('change', (e) => { loadUserFile(e.target.files[0]); e.target.value = ''; });
  $('#sampleBtn').addEventListener('click', async () => {
    setBusy(true);
    try { await engine.load(); await ensureSample(); toast('Wczytano plik przykładowy.'); }
    catch (err) { renderError(err); }
    finally { $('#progress').hidden = true; if (!$('#resultBody').innerHTML) $('#result').hidden = true; setBusy(false); }
  });
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    $$('.tab').forEach((x) => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', String(x === t)); });
    $('#fWhat').hidden = t.dataset.tab !== 'what';
    $('#fHow').hidden = t.dataset.tab !== 'how';
  }));

  // drag & drop – na całej sekcji studia
  const dz = $('#dropzone');
  const studio = $('#studio');
  let depth = 0;
  studio.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { depth++; dz.classList.add('drag'); e.preventDefault(); } });
  studio.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) dz.classList.remove('drag'); });
  studio.addEventListener('dragover', (e) => e.preventDefault());
  studio.addEventListener('drop', (e) => {
    e.preventDefault(); depth = 0; dz.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file) loadUserFile(file);
  });

  const initial = location.hash.slice(1);
  selectFeature(byId[initial] ? initial : 'convert');
  if (byId[initial]) setTimeout(goStudio, 50);

  // Rozgrzej silnik w tle, gdy użytkownik zbliża się do studia.
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { engine.load().catch(() => {}); io.disconnect(); }
  }, { rootMargin: '400px' });
  io.observe($('#studio'));

  window.ffmpgui = { engine, state, selectFeature, run, runDemo, FEATURES };
}

init();

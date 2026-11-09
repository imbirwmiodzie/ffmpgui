// Engine: cienka warstwa nad ffmpeg.wasm.
// FFmpeg działa w Web Workerze, a pliki trzyma w wirtualnym systemie plików (MEMFS)
// w pamięci przeglądarki. Nic nie jest wysyłane na serwer.
import { FFmpeg } from '../vendor/ffmpeg/index.js';

const CORE_VERSION = '0.12.10';
const CDNS = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
];

async function fetchToBlobURL(url, mime, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  // Przy kompresji (gzip/br) content-length to rozmiar skompresowany – wtedy go ignorujemy.
  const total = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress) {
    return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: mime }));
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total);
  }
  return URL.createObjectURL(new Blob(chunks, { type: mime }));
}

export class Engine extends EventTarget {
  constructor() {
    super();
    this.ffmpeg = null;
    this.state = 'idle'; // idle | loading | ready | busy | error
    this.loadPromise = null;
    this.queue = Promise.resolve();
    this.logLines = [];
  }

  #setState(state, detail = {}) {
    this.state = state;
    this.dispatchEvent(new CustomEvent('state', { detail: { state, ...detail } }));
  }

  load() {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.#load().catch((err) => {
      this.loadPromise = null;
      this.#setState('error', { error: err });
      throw err;
    });
    return this.loadPromise;
  }

  async #load() {
    this.#setState('loading', { loaded: 0, total: 0 });
    let lastErr;
    for (const base of CDNS) {
      try {
        const coreURL = await fetchToBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await fetchToBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm', (loaded, total) =>
          this.#setState('loading', { loaded, total: Math.max(loaded, total || 32_232_419) }),
        );
        const ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ type, message }) => {
          this.logLines.push(message);
          if (this.logLines.length > 4000) this.logLines.splice(0, 1000);
          this.dispatchEvent(new CustomEvent('log', { detail: { type, message } }));
        });
        ffmpeg.on('progress', ({ progress, time }) => {
          this.dispatchEvent(new CustomEvent('progress', { detail: { progress, time } }));
        });
        await ffmpeg.load({ coreURL, wasmURL });
        this.ffmpeg = ffmpeg;
        this.#setState('ready');
        return;
      } catch (err) {
        lastErr = err;
        console.warn('Nie udało się załadować rdzenia z', base, err);
      }
    }
    throw lastErr || new Error('Nie udało się pobrać FFmpeg.wasm');
  }

  // Wszystkie operacje idą przez kolejkę – ffmpeg.wasm wykonuje jedno polecenie naraz.
  #enqueue(fn) {
    const run = this.queue.then(async () => {
      await this.load();
      return fn(this.ffmpeg);
    });
    this.queue = run.catch(() => {});
    return run;
  }

  // Kopia bufora: ffmpeg.wasm przekazuje (transfer) ArrayBuffer do workera, co „opróżnia” oryginał.
  writeFile(name, data) {
    const copy = typeof data === 'string' ? data : data.slice();
    return this.#enqueue((ff) => ff.writeFile(name, copy));
  }

  readFile(name) {
    return this.#enqueue((ff) => ff.readFile(name));
  }

  deleteFile(name) {
    return this.#enqueue((ff) => ff.deleteFile(name).catch(() => {}));
  }

  listDir(path = '/') {
    return this.#enqueue((ff) => ff.listDir(path));
  }

  /** Uruchamia `ffmpeg ...args`. Zwraca { code, log }. */
  exec(args, { label } = {}) {
    return this.#enqueue(async (ff) => {
      const start = this.logLines.length;
      this.#setState('busy', { label });
      this.dispatchEvent(new CustomEvent('log', { detail: { type: 'cmd', message: `$ ffmpeg ${args.map(quote).join(' ')}` } }));
      let code;
      try {
        code = await ff.exec(args);
      } finally {
        this.#setState('ready');
      }
      return { code, log: this.logLines.slice(start).join('\n') };
    });
  }

  /** Uruchamia ffprobe i zwraca sparsowany JSON (lub null). */
  probe(file) {
    return this.#enqueue(async (ff) => {
      const out = `probe_${Date.now()}.json`;
      await ff.ffprobe(['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file, '-o', out]);
      try {
        const data = await ff.readFile(out, 'utf8');
        await ff.deleteFile(out).catch(() => {});
        return JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
      } catch {
        return null;
      }
    });
  }
}

export function quote(arg) {
  const s = String(arg);
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
}

/** Prosty parser linii poleceń (obsługuje cudzysłowy pojedyncze i podwójne). */
export function parseArgs(line) {
  const args = [];
  let cur = '';
  let quoteCh = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoteCh) {
      if (c === quoteCh) quoteCh = null;
      else if (c === '\\' && quoteCh === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quoteCh = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) args.push(cur);
      cur = '';
      has = false;
    } else if (c === '\\' && i + 1 < line.length) {
      cur += line[++i];
      has = true;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has || cur) args.push(cur);
  return args;
}

export const engine = new Engine();

# vendor/

Niezmienione pliki ESM z pakietów npm (licencja MIT):

- `ffmpeg/` – [`@ffmpeg/ffmpeg@0.12.15`](https://github.com/ffmpegwasm/ffmpeg.wasm) (`dist/esm`)
- `util/` – [`@ffmpeg/util@0.12.2`](https://github.com/ffmpegwasm/ffmpeg.wasm) (`dist/esm`)

Są trzymane lokalnie, bo Web Worker biblioteki musi pochodzić z tego samego źródła (origin) co strona.
Rdzeń `@ffmpeg/core@0.12.10` (~31 MB, GPL-2.0-or-later) jest pobierany w czasie działania z jsDelivr / unpkg.

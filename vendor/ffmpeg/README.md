# FFmpeg.wasm third-party files

This directory contains browser ESM files (JavaScript trailing whitespace normalized; otherwise unchanged) from `@ffmpeg/ffmpeg` 0.12.15 (MIT) and `@ffmpeg/core` 0.12.10 (GPL-2.0-or-later), installed from the npm registry. The core was built with GPL-enabled libraries including x264. License texts are included in this directory. FFmpeg.wasm source and build instructions, including bundled subprojects and dependencies: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15 (the v12.15 release identifies core v0.12.10). Source for FFmpeg itself: https://github.com/FFmpeg/FFmpeg. The packages and the corresponding source/build configuration are available via https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15 and https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz.

Only the single-threaded core is included. These assets are loaded on demand on the same origin; the selected user file is processed locally inside a Web Worker, not uploaded.

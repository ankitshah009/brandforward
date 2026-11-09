# Demo video

1. `node capture.mjs` (with `CONSOLE=http://localhost:3000`) drives the real console with Playwright and records `public/capture.webm` plus `public/markers.json`, the millisecond offset of every story beat.
2. `npm run render` composes the capture in Remotion (`src/Demo.tsx`): title cards, captions and zooms timed from the markers.
3. The cut is then narrated and sound-designed in Edits: one text-to-speech line per scene, each checked to finish before the next starts, plus library sound effects on HOLD, the refused render, CLEAR and the rejected tamper. No licensed music. Edits exports HEVC; the published file is transcoded to H.264 and loudness-normalized to -16 LUFS:

```bash
ffmpeg -i narrated.mp4 -t 95.2 -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 160k brandforward-demo.mp4
```

The published video is attached to the v0.2.0 release.

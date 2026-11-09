# Demo video

1. `node capture.mjs` (with `CONSOLE=http://localhost:3000`) drives the real console with Playwright and records `public/capture.webm` plus `public/markers.json`, the millisecond offset of every story beat.
2. `npm run render` composes the capture in Remotion (`src/Demo.tsx`). The capture also records where each key UI element sits at every beat, so each shot frames one element (verdict, plan card, receipt, egress row) at 2–3.5× without clipping it. The structure (cold open on the HOLD, one-line captions, a real-time live Claude segment, a visible badge wherever time is compressed) came from a Lovable design review of v1.
3. The cut is then narrated and sound-designed in Edits: one text-to-speech line per scene, each checked to finish before the next starts, plus library sound effects on HOLD, the refused render, each CLEAR, the rejected tamper and the link drop. No licensed music: the bed is an A-minor pad synthesized with ffmpeg (sine tones, tremolo, low-pass, echo) and mixed under the voice. Edits exports HEVC; the published file is transcoded to H.264 and loudness-normalized to -16 LUFS:

```bash
ffmpeg -i narrated.mp4 -t 95.2 -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 160k brandforward-demo.mp4
```

The published video is attached to the v0.2.0 release.

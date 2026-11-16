# Ink Studio

Paint with living ink around a letter and export it as a profile picture, a post or a short video.

**Try it:** https://ink.juriaan.design

Everything runs in the browser. Nothing is uploaded: pictures and videos are made and saved on your own device.

## How it works

1. **Letter**: add a letter or word, pick a typeface, open its edges so ink can stream in.
2. **Ink**: pick a palette, set the brush, paint, or press Play.
3. **Finish**: add a filter, choose round or square and a size, then Export a PNG or record a video.

Shortcuts: Space freezes, R records, Backspace clears, 1–5 pick an ink, V / B / F switch tabs.

## Files

- `index.html`: the whole app in one file. It loads Bootstrap and Google Fonts from the web and needs a browser with WebGL 2.
- `examples/`: twenty pictures made with the app.
- `marketing-video/`: the scripts that render the example pictures and promo videos (Node, Google Chrome and ffmpeg).

## Run it locally

```bash
python3 -m http.server 8766
```

Then open http://localhost:8766.

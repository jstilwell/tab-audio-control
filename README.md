# Tab Audio Control

Per-tab volume for Chrome that doesn't break full screen. Make a tab quieter,
mute it, or boost it to 400%. Shape it with a 5-band parametric EQ, pull voices
forward over music, and even out loud and quiet parts with night mode.

## Why full screen keeps working

Most tab-volume extensions capture the tab's audio with `chrome.tabCapture`. While
a tab is being captured, Chrome won't let it take over the monitor, so videos go
"full screen" only inside the browser window.

This extension leaves the tab uncaptured. When you click its icon, it connects to
the page's own video and audio players and processes their sound with Web Audio,
which Chrome treats like any other page audio. Full screen behaves normally.

For the rare sound it can't reach (some web games, audio streamed from another
site without CORS, or embeds from another site), the popup offers **capture mode**.
It works on any audio, and the popup tells you before you turn it on that full
screen will stay inside the window while it's on.

## Permissions

Installs with no permission warnings. It can only see a tab after you click its
icon (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>) on that tab. Capture
mode asks for its extra permission the first time you use it. See `CLAUDE.md` for
the reason behind each permission.

## Remembering your settings

- Settings stay with the tab. YouTube autoplaying the next video, or a reload
  on the same site, keeps your volume and EQ.
- After you navigate to a different site in that tab, Chrome requires one click
  on the icon. Your settings are reapplied when you do.
- EQ presets you save sync with your Chrome profile.

## Install (development)

```sh
npm install
npm run build
```

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
and choose the `dist/` folder. Use `npm run dev` to rebuild on save, then press the
reload button on the extension card.

## Known limits

- Media that plays without being attached to the page, or inside a closed
  shadow root, isn't found. Capture mode covers it.
- Videos embedded from another site (e.g. a YouTube embed on a blog) run in a
  cross-site frame the extension can't reach without broad permissions. Capture
  mode covers it.
- If a page already routes a player through its own Web Audio graph, that player
  gets volume-only control (down and mute, no boost).
- Voice focus works by trading the center of the stereo mix against the sides.
  It's very effective on most music and video, and does little on mono audio.

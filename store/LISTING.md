# Chrome Web Store listing

Copy for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Images in this folder are regenerated from the real popup with `npm run store-assets`, and the upload zip comes from `npm run package`.

## Store listing tab

**Name:** Tab Audio Control

**Summary** (≤132 characters, same as the manifest description):

> Per-tab volume, boost, EQ and voice focus that keeps full screen working.

**Category:** Tools

**Language:** English

**Description:**

> Control the sound of each Chrome tab without breaking full screen video.
>
> Turn a tab up to 400%, down, or off. Push the music back so voices come through. Shape the sound with a five-band EQ over a live spectrum. Even out loud and quiet parts with night mode.
>
> FULL SCREEN KEEPS WORKING
> Most tab volume extensions capture the tab's audio, which stops full screen video from filling your monitor. Tab Audio Control connects to the page's own video and audio players instead, so full screen works normally. For sound it can't reach directly, an optional capture mode is available, and it tells you about the trade-off first.
>
> FEATURES
> • Volume from 0 to 400%, with a limiter to prevent distortion
> • Mute and quick reset to 100%
> • Voice focus: push music back to bring dialogue and vocals forward, or the reverse for karaoke
> • Five-band parametric EQ with presets (Voice Clarity, Podcast, Bass Boost, Treble Boost, Loudness) and your own saved presets
> • Night mode, mono, and left/right balance
> • Each tab remembers its settings across the next video and page reloads
> • The toolbar icon shows each tab's volume at a glance
> • Light and dark themes that follow your system
>
> PRIVATE BY DESIGN
> No data collection, no analytics, no network requests. No permission warnings at install. The extension can only access a tab after you click its icon on that tab.
>
> Free and open source: https://github.com/jstilwell/tab-audio-control

**Graphic assets:**

| Field                      | File                                                       |
| -------------------------- | ---------------------------------------------------------- |
| Store icon (128×128)       | `public/icons/icon-128.png`                                |
| Screenshots (1280×800)     | `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png` |
| Small promo tile (440×280) | `promo-small.png`                                          |

**Website / support:** https://github.com/jstilwell/tab-audio-control

## Privacy practices tab

**Single purpose:**

> Adjust the audio of the current browser tab: its volume (including boosting above 100% and muting), equalization, and stereo balance.

**Permission justifications:**

- **activeTab:** Gives temporary access to the tab the user clicks the extension on, so the extension can adjust that tab's audio. It grants no access to any other tab or site.
- **scripting:** Injects the extension's audio engine into the tab the user activated it on. The engine routes the page's media elements through the Web Audio API to change volume and EQ. The script is bundled with the extension, and no remote code is used.
- **storage:** Saves each tab's audio settings in session storage so they survive a reload of the same page, and saves the user's EQ presets in sync storage.
- **tabCapture (optional):** Requested only when the user chooses capture mode, for audio the in-page engine can't reach (for example, a video embedded from another site). It captures the current tab's audio so it can be processed.
- **offscreen (optional):** Requested together with tabCapture. Captured audio has to be processed and played back with Web Audio in an offscreen document, because extension service workers can't play audio.

**Host permissions:** None requested.

**Remote code:** No, I am not using remote code.

**Data usage:** No data types collected (leave every checkbox unchecked). Certify all three disclosure statements.

**Privacy policy URL:** https://github.com/jstilwell/tab-audio-control/blob/main/PRIVACY.md

## Distribution tab

**Visibility:** Public. **Pricing:** Free. **Regions:** All.

# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The equalizer now sits in an expandable section at the bottom of the popup, closed by default, so the everyday controls fit without scrolling. The popup remembers whether you left it open.

### Fixed

- Saving a preset no longer fails silently once you have many: the popup stops at 16, the most that reliably fit in Chrome's sync storage, and tells you if a save doesn't go through.
- Opening the popup on a page no longer keeps every player the page later removes in memory. (Players the extension is actively processing are still held by Chrome itself until the page reloads.)
- On sites where the extension can only turn a player down, it now follows the site's own volume slider instead of snapping back to an old level.

## [0.1.0] - 2026-10-29

### Added

- Per-tab volume from 0 to 400%, mute, and a limiter for boosts.
- An in-page Web Audio engine, so full screen video keeps working.
- Opt-in capture mode for audio the in-page engine can't reach, with a warning and runtime permissions.
- Five-band parametric EQ over a live spectrum, with built-in and user presets.
- Voice focus (mid/side), night mode, mono, and balance.
- Per-tab memory across the next video and same-site reloads.
- A waveform toolbar icon that shows each tab's volume.
- Light and dark themes that follow the system.

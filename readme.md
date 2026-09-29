# Exercise Timer

A lightweight, self-contained workout timer built with vanilla HTML, CSS, and JavaScript. No frameworks, no build tools, no dependencies.

<img width="1559" height="931" alt="image" src="https://github.com/user-attachments/assets/7bcd10ce-61d4-4679-8ab8-6c9696c21480" />


## Features

### Workout Builder

- **Add exercises** with a custom name and duration (minutes:seconds).
- **Add breaks** with a configurable duration between exercises.
- **Inline editing** — click the pencil icon on any item to rename it or change its duration. Save with Enter/checkmark, cancel with Escape/X.
- **Duplicate** any item (exercise or break) with one click.
- **Remove** items individually.
- **Clear All** wipes the entire workout.
- **Load Sample** populates a pre-built 7-exercise workout to test the timer.
- **Duration persistence** — your last-used exercise and break durations are saved and restored on page reload.
- **Workout persistence** — the builder list auto-saves to `localStorage` (`exerciseTimerWorkout`) on every change and is restored on app restart, so you never have to rebuild it.

### Drag-and-Drop Reordering

- Grab the `⠿` handle on any workout item and drag it to a new position.
- Visual feedback: the dragged item fades, and a red border appears above the drop target.
- Dragging is automatically disabled while editing an item.

### Presets

- **Save as Preset** — name your current workout and store it in the browser.
- **Load** a saved preset with one click (replaces the current workout). The loaded preset is marked `✓ Loaded` and highlighted; its name is remembered across restarts (`exerciseTimerLastPreset`).
- Any manual edit (add / remove / duplicate / edit / reorder / sample / clear) marks the workout as custom and clears the loaded marker.
- **Delete** presets you no longer need (deleting the loaded preset also clears the marker).
- **Export** individual presets as `.json` files for sharing or backup.
- **Import** presets from `.json` files. Imported presets merge with your existing collection.
- All presets persist in `localStorage`.

### Timer

- **Start** begins the countdown from the first item.
- **Pause** freezes the timer; **Start** resumes from where you left off.
- **Reset** stops the timer and returns to the workout builder view.
- **Progress bar** fills across each item and resets per item.
- **Next Up** indicator shows the upcoming exercise or break, or "Last item!" for the final item.
- **Countdown beeps** play during the final 3 seconds of each item.
- **Auto-advance** — when an item finishes, the timer transitions seamlessly to the next one.
- **Manual adjustment** — `<< 10s` adds time back (capped at the item's planned duration), `10s >>` skips ahead, `⏮` / `⏭` jump to the previous / next interval (restarting it at full duration). Controls stay enabled while paused.
- **Keep awake** — the screen is kept on while the timer runs via the Screen Wake Lock API plus a NoSleep-style looping-video fallback on iOS (released on pause / reset / finish, re-acquired when the tab becomes visible again).
- **Drift-resistant ticking** — elapsed time is computed from the wall clock, so background throttling on mobile skips forward correctly instead of losing time.
- **Done!** screen with a celebratory sound and flashing timer when the workout completes.

### Fullscreen Mode
<img width="1677" height="1013" alt="image" src="https://github.com/user-attachments/assets/1c699ce5-7d19-449c-bd00-c3ebf7493e41" />

- Click the `⛶` button to enter fullscreen, showing the timer at full viewport size.
- The exercise name scales up dramatically with fluid sizing.
- Exit fullscreen with the same button (shows `✕` when active) or by pressing Escape.
- Supports standard and WebKit fullscreen APIs; on iPhone Safari/Chrome (where fullscreen on generic elements is unsupported) it falls back to a fixed-viewport pseudo-fullscreen overlay with the same large-type styling.

### Sound System

- Built on the Web Audio API — no external audio files needed.
- **Transition sound** — a layered sweep and tone when an exercise starts.
- **Break sound** — a calmer tone sequence for rest periods.
- **Finish sound** — a multi-note ascending melody when the workout ends.
- **Countdown beeps** — a quick descending sweep during the last 3 seconds.
- **Volume slider** (0–200%) with real-time percentage display.
- **Sound toggle** to mute all alerts.
- Volume preference persists in `localStorage`.

### Responsive Design

- Two-column layout on desktop (builder left, timer right).
- Single-column stacked layout on mobile (< 700px).
- Fluid font sizing on the timer label and time display using `clamp()` — scales smoothly across all screen sizes and in fullscreen.
- Text wraps at word boundaries when exercise names are too long for the viewport.
- Break row and timer controls wrap on narrow screens.
- Timer label uses `max-width: 80%` with centered alignment for multi-line text.

### Visual Design

- Dark theme with subtle radial gradient background.
- Neon-style panel borders with animated glow on the builder panel.
- Gradient buttons with hover lift effects.
- Color-coded items: red for exercises, cyan for breaks.
- Smooth CSS transitions on font size, letter spacing, and text shadow during fullscreen toggle.
- Scrollable workout list and presets list with custom scrollbar styling.

## File Structure

```
exercise_timer/
├── index.html    — HTML structure
├── style.css     — All styling
├── app.js        — All application logic
└── README.md
```

## Usage

Open `index.html` in any modern browser. No server required.

## Browser Support

- Chrome / Edge (full support, native Wake Lock + Fullscreen)
- Firefox (full support)
- Safari (WebKit fullscreen API; Screen Wake Lock on iOS 16.4+, video fallback below that and in Home Screen web apps)
- iOS Safari / Chrome (pseudo-fullscreen overlay; keep-awake via Wake Lock where available plus looping-video fallback; add `viewport-fit=cover` + standalone meta tags for best Home Screen behavior)
- Mobile browsers (responsive layout, touch-friendly controls)

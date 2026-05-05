# Zetamac Progress Tracker

A local Chrome extension that tracks your Zetamac arithmetic games and builds a dashboard with:

- highest score per day
- number of plays per day
- daily average score
- all-time best score
- current daily practice streak
- line chart for best-score improvement
- bar chart for attempts per day
- JSON export/import
- manual score entry fallback

## Install

1. Download and unzip this folder.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** in the top-right.
4. Click **Load unpacked**.
5. Select the unzipped `zetamac-tracker-extension` folder.
6. Play at `https://arithmetic.zetamac.com/`.
7. Click the extension icon, then **open dashboard**.

## How tracking works

The content script only runs on `arithmetic.zetamac.com`. It watches the game page for score changes and saves a session after it detects that a game has ended. Data is saved locally in Chrome extension storage under `zetamac_sessions_v1`.

If a game does not auto-save, open the extension popup while on the Zetamac game tab and click **save current score**.

## Notes

- This does not solve problems or automate gameplay.
- Data does not leave your browser.
- Use export/import to back up your history or move it to another computer.

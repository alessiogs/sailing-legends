# The simulation emits data, not text

`sailing/`, `race/` and `ai/` never produce player-facing text: race events, rule verdicts and leg names
carry structured data (kind, racer, rule, turns, fault) and English keys. All text the player reads comes
from the translation catalogs in `src/i18n/` (one file per language, Italian first), formatted by the UI.
We decided this during the 2026 refactor because Italian sentences in `Race.ts` and `Rules.ts` were being
string-matched by the UI to recover data, and because the game is meant to support several languages.

## Consequences

- Adding a message means adding a key to every catalog; TypeScript fails the build if a language misses one.
- Headless tests compare event kinds and data, never wording, so translations can change freely.

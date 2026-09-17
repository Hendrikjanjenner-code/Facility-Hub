---
name: Film audio timing validation
description: A valid-duration audio mix can still contain overlapping narration; verify segment placement.
---

For separately generated narration segments, validate sample placement as well
as the final mix's duration and volume. Do not rely on offset timestamps alone
to sequence voices through FFmpeg `amix`.

**Why:** An attempted timestamp-offset mix produced a technically valid
77-second AAC file without proving that the voices occupied their intended
slots. Another mixed-rate filter graph ended after a single AAC packet.
Duration and peak-volume checks alone did not establish correct narration.

**How to apply:** Normalize/decode segments to one sample rate, place them in
non-overlapping PCM intervals, then mix the complete narration with music.
Check the first, middle and last voice intervals and reject short cached audio.
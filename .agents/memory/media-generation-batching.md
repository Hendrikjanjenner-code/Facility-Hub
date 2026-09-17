---
name: Media generation batching
description: Avoid the shared per-Repl audio-generation rate limit when making multi-segment narration.
---

Start ElevenLabs speech and music requests in small batches (at most four
concurrent starts), and retain each successful output before retrying failures.

**Why:** Starting eleven speech jobs plus music together hit a shared per-Repl
10-requests-per-second limit. Speech and music count toward the same limit;
one rejected promise does not mean the other generation jobs failed.

**How to apply:** Use settled job results to identify only the failed segments.
Honor the reported retry interval and retry those segments without regenerating
the successful narration.
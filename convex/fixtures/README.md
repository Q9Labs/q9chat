# Upload sniffing fixtures

These tiny real containers were generated locally with ffmpeg from 50 ms of
mono silence (48 kHz). The video fixtures also contain a black 16 × 16 frame.
They contain no personal data.

- `voice.ogg`: libopus in Ogg.
- `voice.webm`: libopus in WebM.
- `voice.m4a`: AAC in M4A, with `-movflags +faststart`.
- `video.webm`: libvpx plus libopus.
- `video.m4a`: MPEG-4 video plus AAC, with `-movflags +faststart`.

The round-two review supplied three additional real ffmpeg audio fixtures:

- `long.m4a`: 10-second AAC/M4A with metadata after the media data (past 64 KiB).
- `noise.webm`: 10-second Opus audio whose compressed payload contains `V_`.
- `raw.aac`: ADTS AAC.

The tests classify containers by signature only, including the video fixtures
and hand-built incomplete headers. No codec or track parsing is intended: v1
accepts that a crafted signature may not play. The three review fixtures also
prove that a voice upload cannot be consumed as a file or reused.

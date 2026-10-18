# Upload sniffing fixtures

These tiny real containers were generated locally with ffmpeg from 50 ms of
mono silence (48 kHz). The video fixtures also contain a black 16 × 16 frame.
They contain no personal data.

- `voice.ogg`: libopus in Ogg.
- `voice.webm`: libopus in WebM.
- `voice.m4a`: AAC in M4A, with `-movflags +faststart`.
- `video.webm`: libvpx plus libopus.
- `video.m4a`: MPEG-4 video plus AAC, with `-movflags +faststart`.

The tests also use hand-built incomplete headers and a codec marker beyond the
64 KiB sniffing window to prove those remain generic files.

# Two Sounds of a Machine

In Sound Recorder choose **Source → Sample Tape…**, or press `T` with the canvas
focused. Select `A` or `B` with the side buttons or keyboard. `Enter` or `Space`
plays or pauses, `S` stops at zero, `R` replays, and `Esc` returns to My Recordings.
Both measured waveforms are visible before playback, with one shared playhead.
Changing sides during playback starts the new sound at the same offset; changing
sides while paused is silent. The display reports mute and unavailable audio
without substituting a fake playback clock.

The tape requests neither the microphone nor permission to record. The first
Play or Replay requests only the selected bundled, same-origin WAV. Leaving the
tape, hiding the presentation or minimizing the recorder pauses and releases the
active audio; playback does not resume on its own. The sample does not use the
desktop’s live PC Speaker recording stream, change the recording document or
enter visitor backups. There are no changes to `.snd` and `.snd.txt` behavior.

## Audio and provenance

- **A — Recording:** [IBM M2 sound.ogg](https://commons.wikimedia.org/wiki/File:IBM_M2_sound.ogg)
  is [Anonimski’s](https://commons.wikimedia.org/wiki/User:Anonimski) own recording of
  typing on an IBM M2 keyboard, released under
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The
  [original Vorbis file](https://upload.wikimedia.org/wikipedia/commons/1/16/IBM_M2_sound.ogg)
  has SHA-256 `e620684e9b03b62319fb48da6149392cfd4042615e17a891554f8a9f6ac8515e`.
  Side A is the interval `0.080–4.180 s`, mixed to mono and resampled to 16 kHz
  signed 16-bit PCM. Nothing is spliced or synthesized into A.
- **B — PC Speaker:** This is a newly synthesized arrangement, not a second
  recording. The generator finds 33 rises in the source’s 5 ms RMS windows and
  writes a short, soft-edged square pulse at each detected onset. Source energy
  controls pulse strength; the six pitches form an editorial voicing rather
  than an inference of the keys typed. Both sides are exactly `4.100 s`.
- **Sound description:** A has several quick, irregular groups of dry key clicks
  and deeper clacks with small gaps and a final short tail; B answers those beats
  with brief pitched buzzes and the same gaps. Neither side contains dialogue.

To regenerate, download the credited source and run
`node apps/desktop/scripts/generate-machine-tape.mjs <path-to-original-ogg>` with
FFmpeg on `PATH`. The generator also emits the min/max envelope of each PCM in
112 equal-width bins; the displayed tracks use that projection, not a drawn
approximation of the event count. The playhead uses the media element’s
position. Reduced motion presents it at quarter-second intervals while playing.

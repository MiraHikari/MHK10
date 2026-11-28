# Personal editions

Three small interfaces extend the existing desktop and general site without adding
applications to the Start menu. They share one rule: an object is inspectable
before it causes a side effect. No visitor note, file or story value is copied
into these views.

## Long-distance directory

`/friends/` and `/network/` render the same public entries from the authored
profile. The record opens locally; `Visit` is the only action that navigates to
the external site, with `noopener noreferrer`. The Dial-Up entry opens this
directory without playing a fake modem handshake. No remote favicon, iframe or
network request is made merely by opening a card.

## Machine tape

Sound Recorder's `Source → Sample Tape…` uses a CC0 recording and a synthesised
PC Speaker arrangement of its 33 onsets. Both sides share one transport and
waveform playhead; switching sides resumes at the same time. See
[machine tape](machine-tape.md) for the source, licence and regeneration steps.

## Safe eject

Only the confirmed `Shut down` action enters the eject sequence. The same
Signal Editions disk leaves its drive, the screen ends on `It is now safe to
turn off`, and a native `Restart MHK10` button becomes available. The button
restarts the existing shell; nothing is recorded about how long the visit
lasted. System and desktop reduced-motion preferences show the static eject
frame immediately. Cancelling the confirmation, restarting or returning to the
general site does not enter this view.

## Acceptance

Run focused checks with:

```sh
npm test -- apps/desktop/src/lib/apps/sound-recorder/machine-tape.test.ts apps/desktop/src/lib/os/desktop/desktop-lifecycle.test.ts
npm run test:e2e -- machine-tape.spec.ts startup.spec.ts
```

Visual changes require a current screenshot of both presentations. The
interfaces intentionally use one native control surface per action; do not
mirror the same input into a second canvas control.

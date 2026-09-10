# Sound and reading companion

This pass makes dialogue easier to follow for children learning to read and softens the game's soundscape. It preserves the existing artwork, battles, bonding, family missions, progression, and saved journeys.

## Playing with a reading voice

1. Select **Read to me: On** on the title screen. Reading is optional and starts off for new players.
2. Start or continue a journey. Each dialogue page appears fully and is read aloud; press A when ready for the next page. The game never chooses a companion or a menu action for you.
3. Select **Listen** to hear the current caption again, or **Stop** to stop reading it. Keyboard players can use **L**. A stopped caption stays stopped until replayed or replaced by a new caption.
4. Open **Voice & sound** beneath the game, or **Journal → Settings → Sound & reading**. Preview the voice, choose a device voice and a slower pace, or adjust the four volume controls.

Reading covers ordinary dialogue, important story scenes and their choices, journey guidance, journal and mission selections, Guardian and building selections, and battle captions and commands. It is a caption companion, not a complete screen reader for every decorative label. During battle result text, narration can hold the next event; A skips the voice and continues. Reading controls have their own strip outside the canvas and touch controls.

## Sound design

- Rounded, plucked procedural instruments replace the sharper score. Each location retains its own melody and mood.
- Woodland birds and breeze, plus gentle indoor hearth textures, play sparsely beneath the music.
- Bonding, level gains, evolution, and other feedback use distinct, softer motifs.
- Music falls to 22% and effects to 48% of their configured bus levels during speech. The mix restores smoothly afterward, including cancellation, errors, mute, or a scene change.
- Muting and backgrounding stop scheduled voices. Returning does not play an accumulated queue. Active audio nodes and ambience caches are bounded.

## Device behavior

Speech comes from the browser and its installed voices. The game prefers an English local voice and favors enhanced or natural voices when available; it cannot make every device sound identical. **Hear this voice** lets a parent audition it. A missing saved voice falls back to the device's available voice. If no voice works, the game reports this and keeps the captions and controls usable.

The first interaction unlocks browser audio. Safari may require tapping **Listen** to activate speech. No microphone, account, paid service, or API key is used. The code and soundtrack work offline; the selected speech service may require a network connection. A voice change, mute, scene exit, hidden tab, or new caption cancels stale speech. Watchdogs release a stalled voice so it cannot hold the music indefinitely.

Audio preferences are saved separately before a journey exists, then also included in the normal save once playing. Existing saves gain safe defaults. Automatic reading remains off until explicitly enabled.

## Verification

Run `npm run build`, `npm test`, and, with the preview server running, `npm run test:sound`. Browser tests use disposable browser profiles and write evidence to ignored `artifacts/`.

- Unit tests exercise voice activation, cancellation and stale callbacks, delayed voices, mute, speech failures, text-page and choice ownership, audio mixing and bounded scheduling, and preference/save isolation.
- Sound browser checks use a **mock speech engine** to verify the exact spoken text and lifecycle deterministically. This verifies behavior, not the sound of an installed voice.
- Browser Web Audio contexts are real. Offline audio renders of home, village, field, forest, battle, and effects were checked for finite samples, nonzero output, and clipping.
- Landscape layout checks include desktop 1280×800, phones 844×390 and 568×320, and iPad-sized 1024×768 viewports. They check the reading strip, scrollable settings, touch spacing, keyboard focus, and unsupported-speech fallback.
- The normal gameplay, important-conversation, and actual-input opening-journey browser suites remain part of the release checks.

Physical iPad/Safari listening, installed voice quality, speakers/headphones, and real controller audio have not been verified on hardware. Emulation does not replace that listening check.

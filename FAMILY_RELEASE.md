# Seven local family profiles

The first family milestone gives five children and two parents independent journeys while the professional Godot project develops separately. This is local save isolation, not a multiplayer or account release. The existing browser game, illustrated assets, game mechanics and narration remain in place.

## Using the profiles

1. At the title, select **Family profiles**. The original Begin/Continue menu order is unchanged.
2. Choose Child 1–5 or Parent 1–2. Enter a name and select **Save name**, if desired. Names are profile labels; changing one does not rename a hero in an existing journey.
3. Choose **Play as…**. A clean page reload opens that profile, with its own saved world and sound preferences. An empty profile offers Begin; an existing profile offers Continue.
4. While playing, use **Journal → Settings → Save and return to title** before switching. Switching is unavailable during exploration, battles, and conversations.
5. To begin again, choose New journey and confirm. Only the selected profile's progress is replaced, after the replacement can be written successfully. That profile's reading preferences remain.

Original journey is an additional compatibility entry, separate from the seven new family slots. No save is moved, copied, or assigned to a person automatically. An empty slot offers **Copy original journey here** when a readable original exists. Confirmation first creates an immutable local backup, then copies the original bytes into the empty slot. The original and backup remain available and are never overwritten by later profile imports. Failed backup creation blocks the copy. A destination write failure leaves the verified backup and original intact.

## Persistence boundary

| Data | Storage key |
| --- | --- |
| Original journey | `hearth.save.v1` |
| Original pre-journey preferences | `hearth.preferences.v1` |
| First protected original snapshot | `hearth.backup.legacy.v1` |
| Selected profile for the next page boot | `hearth.family.active.v1` |
| Editable family labels | `hearth.family.names.v1` |
| One family journey | `hearth.profile.{child1…child5,parent1,parent2}.save.v1` |
| That profile's pre-journey preferences | `hearth.profile.{id}.preferences.v1` |

Each running tab retains its own profile identity. Selecting a different profile changes only the next boot target; the current runtime cannot redirect an old scene's save to the next person. The title picker clears narration/input and reloads the runtime so old map caches, pending captions, scenes and world callbacks are discarded. Autosaving runs only while an overworld scene exists. Choosing reading options on a profile with no journey cannot manufacture Continue.

Before writing a journey or preferences, the runtime compares the stored bytes with the exact last-loaded or last-written bytes. A stale same-profile write is refused, and a notice explains how to reload the latest saved journey. Different tabs using different profiles keep independent ownership. This is optimistic local conflict detection, not a server transaction or a cross-device lock; simultaneous writes cannot be guaranteed atomic across all browsers.

Unreadable saved data and unknown/future save versions do not appear as playable Continue journeys. Corrupt entries stay in storage until a user explicitly chooses a replacement. Storage read/write failures are handled without switching profiles or claiming a successful save. A failed new-journey write keeps both previous saved bytes and current in-memory progress.

## Scope and verification

Run `npm run build`, `npm test`, and `npm run test:family` with the preview server running. The browser test uses disposable storage and does not touch the family's real saves. Evidence is written under ignored `artifacts/`.

- Focused persistence tests cover all seven independent villages, Guardians, currencies, flags, and reading settings; exact original-copy semantics; immutable backup and destination-write failures; replacement isolation; corrupt metadata and saves; blocked storage; and two separate tab runtimes.
- Family browser checks exercise the native picker, editable names, cancel/confirm import, repeated actual-input Begin and save/return flows, reloads, new-journey cancellation and replacement, prevented in-game switching, same-profile and separate-profile browser tabs, and storage failures. A documented synthetic progress fixture distinguishes each profile; full gameplay remains covered by the existing opening-journey suite.
- Touch geometry and interactions cover desktop 1280×800, iPad-sized 1024×768, and phone landscape 844×390 and 568×320. The picker scrolls, keeps controls at least 44 pixels tall, traps keyboard focus, and prevents name editing from activating game controls.

Release-candidate verification: **154 unit tests**, **9 family browser acceptance groups / 4 layouts**, **24 general gameplay checks**, **12 important-conversation checks**, **12 actual-input opening checks**, and **13 sound checks** passed. A separate narrow-touch storage-failure check verified that a save warning cannot cover the profile dialog's Done button. Browser suites reported no page errors. Desktop and narrow-phone profile screenshots were visually inspected.

Profiles and their backup are stored in this browser's site data. They do not provide cloud backup, device synchronization, passwords, private family sessions, simultaneous visits, or multiplayer. Clearing site data removes these local records. Physical iPad/Safari verification is still required; browser emulation is not hardware testing.

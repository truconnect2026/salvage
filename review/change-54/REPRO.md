# change 54 — reproduction (HEAD, before any fix took effect)

HEAD arm: commit 10768c1, built in a separate worktree, build `XNk21jIaUQuNZ45oCyunO`,
`next start -p 3312`, Chromium. Discriminator (`discriminator-head-vs-clean.txt`):
HEAD serves `Send a photo for a quote` on the salon door; the change-54 build
(`yav3FJ6YqlgS6N7RyS5pZ`) serves `Send a photo of the look you want`. The arms differ.

The change's two new gates, run against HEAD (`repro-head.log`):

| gate | HEAD reading |
|---|---|
| 262 salon | photo slot `Send a photo for a quote`; pre-filled text `Hi Shop Fifty Four, I need help with a job.`; FORBIDDEN quote, job |
| 262 dental | same photo slot and text; FORBIDDEN quote, job, miles; `Serves 25 miles` shown |
| 262 other | same photo slot and text; FORBIDDEN quote, job, miles |
| 262 no name, salon | `Harbor Row Aesthetics` |
| 262 no name, hvac | `Ridgeline Plumbing` on a door labelled HEATING AND AIR |
| 263 legal links | Privacy 42x20, Terms 36x20 on /go and on /start, at 390, 601 and 800 |

Design (no gate, screenshots `before-*.png`): the job, time, field and button
parts of the booking sheet were square hairline boxes under the change-51 rounded
lifted cards; the sheet's only action, Confirm booking, was a teal outline that
read as secondary; the salon photo label ran to 3 lines (156px tile, measured)
in a half-width tile; /start's Pay was a 40%-opacity gold that read as mud, the
agreement floated as a grey paragraph, the checkbox and radios were white browser
defaults, and nothing on /start said Salvage.

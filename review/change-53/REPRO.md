# change 53 — REPRO (HEAD 03e5ebf, before any edit)

Build `rS5H1B18LkpYLoJNxi_NU` (HEAD), `next start -p 3311`, Chromium.
URL: `/go?biz=Shortpump%20Threading&preset=salon&demo=1` — what the Client-mode
tablet opens for a threading / brow salon.

Served HTML (curl, counts):

| string | count |
|---|---|
| `Filler` | 4 |
| `Serves 25 miles` | 2 |
| `rS5H1B18LkpYLoJNxi_NU` (BUILD_ID on disk) | 1 |

Rendered (`[data-go]` innerText, 390x844 and 800x1280 identical):

- owner card: `Booked · Danielle R.` / `Filler` / `+$340`
- proof row: `Serves 25 miles`
- job sheet chips: `Filler, Color, Facial, Lash fill, Something else`

Screenshots: `before-go-390.png`, `before-go-800.png`, `before-go-390-jobs.png`,
`before-go-800-jobs.png`.

Deterministic (server-rendered from config), not intermittent: 2/2 viewports.

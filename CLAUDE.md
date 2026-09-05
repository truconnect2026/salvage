@AGENTS.md

# Salvage — standing rules

Missed-call-recovery demo for Davy Jones' Locker. Shared on Facebook by referral
partners, so the OG thumbnail is a first-class deliverable, not an afterthought.

Brand "Drowned Arcana": dark abyss/navy ground, teal = interactivity,
gold = CTA and money only. Cormorant display + Inter body.

1. **Never `git add -A`.** Stage by explicit path only.
2. **Sequential changes.** Artifacts for change N live under `review/change-N/`.
3. **All user-facing strings live in `lib/client.config.ts`** and are a human veto.
   Never invent or alter copy.
4. **Deploy = push to `main`.** Never run `vercel --prod`. Never change project settings.
5. **Rendered state is the only truth.** Every gate must be proven red on a mutated build.
6. **Never kill a browser by process name.** Port-scoped PID kills and own-handle
   closes only. Gate 190 enforces this.

## Deploy target

- GitHub: `truconnect2026/salvage` (main)
- Vercel: `salvage-demo`, scope `davids-projects-d8eca120`, auto-deploys on push to main
- Live: https://salvage-demo.vercel.app

## Data note

`recovered` is an explicit stored value on each preset, never computed from
`ticket × callsCaught`. Gates assert against the stored field. Do not introduce
derived math anywhere.

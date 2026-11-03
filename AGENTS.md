<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- All winery business logic (graph, balances, capacity, inherited conditions, line validator, recall) lives in pure functions in `src/lib/bodega/engine.ts`; UI only calls `applyMovement`/`annulMovement` — keeps rules testable in `src/test/bodega.test.ts`.
- Data persists only in localStorage via `src/lib/bodega/store.ts`; seed is deterministic in `seed.ts` and bumping `SEED_VERSION` forces a reload — the client integrates its own backend later.
- Plant colors are semantic tokens (`mq`, `fo`) and `warn` is reserved for capacity/merma/attention states.

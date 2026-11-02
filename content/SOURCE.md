# Content snapshot

`content.json` is a byte-for-byte snapshot of the reviewed invitation copy (spec 0.1). The generator
(`scripts/gen-i18n.mjs`) reads only this file, never the source path. The source is read-only from this repo.

| Field         | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| Source        | `/Volumes/workplace/WeddingInvite2/assets/copy/content.json`       |
| sha256        | `bcd39fd66ed2bd1c10b9db92e265b94806ab038b0734e9897c991943daf7e453` |
| Snapshot date | 2026-11-02                                                         |
| Last verified | 2026-11-02 (byte-identical to the source)                          |

Native reviews of this copy: `/Volumes/workplace/WeddingInvite2/assets/copy/NOTES.md`.

## Check it

```sh
shasum -a 256 content/content.json /Volumes/workplace/WeddingInvite2/assets/copy/content.json   # Mac, no install
```

`tests/unit/ground-rules.test.tsx` fails if the snapshot's sha256 differs from the value above or from
`CONTENT_SHA256` in `src/generated/facts.ts`, and if the facts table in `docs/SPEC.md` 0.3 differs from the snapshot.

## Refresh it (a deliberate commit)

1. Change the copy only in WeddingInvite2's `content.json`, with native review there.
2. `cp /Volumes/workplace/WeddingInvite2/assets/copy/content.json content/content.json`
3. Put the new sha256 and date in the table above.
4. On dvd: `npm run gen:i18n && npm test` (regenerates `src/i18n/*.json` and `src/generated/*`; validates every fact).
5. If a date, time, venue or address changed, update the table in `docs/SPEC.md` 0.3 to match.
6. Review the diff of `src/i18n/*.json`, then commit the snapshot, this file and the generated files together.

UI strings (buttons, labels) live in `ui.json`, not here, and are listed for native review in `docs/NATIVE_REVIEW.md`.
Facts never live in `src/config.ts` or in components: they reach the page only through the generated language files.

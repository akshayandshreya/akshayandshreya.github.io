# Font licences

Every font in `files/` is licensed under the **SIL Open Font License, Version 1.1** (https://openfontlicense.org).
They are subsets or unmodified copies of the Google Fonts files the invitation engine ships
(`WeddingInvite2/engine/fonts/`, fetched by its `tools/fetch-fonts.mjs`). Subsetting keeps the fonts' own name tables,
including the copyright notice (name ID 0), licence description (13) and licence URL (14).

| Family | Files | Upstream |
|---|---|---|
| Pinyon Script | pinyon-latin, pinyon-mono | https://fonts.google.com/specimen/Pinyon+Script |
| Marcellus | marcellus-latin | https://fonts.google.com/specimen/Marcellus |
| Cormorant Garamond | cormorant-*-latin, cormorant-i500-amp | https://fonts.google.com/specimen/Cormorant+Garamond |
| Amita | amita-* | https://fonts.google.com/specimen/Amita |
| Sahitya | sahitya-* | https://fonts.google.com/specimen/Sahitya |
| Noto Serif Devanagari | noto-deva-* | https://fonts.google.com/noto/specimen/Noto+Serif+Devanagari |
| Atma | atma-* | https://fonts.google.com/specimen/Atma |
| Tiro Bangla | tiro-bangla-* | https://fonts.google.com/specimen/Tiro+Bangla |
| Noto Serif Bengali | noto-beng-500 | https://fonts.google.com/noto/specimen/Noto+Serif+Bengali |
| Noto Sans Tirhuta | (build time only: outlines in `../glyphs/tirhuta-mithila.svg`) | https://fonts.google.com/noto/specimen/Noto+Sans+Tirhuta |

OFL fonts may be bundled and served with a website. A subset is a "Modified Version" under OFL 1.1: if a family's
licence declares a Reserved Font Name, a modified version must not be distributed under that name. Not verified here
(2026-11-02): before publishing, check each family's upstream OFL.txt (or name ID 13 in the file) for a Reserved Font
Name declaration; the CSS family names in `fonts.<lang>.css` are local labels and can be renamed if needed.

# QA round 1, lens "design"

Date: 2026-11-02 (evening). Tree: `main` at `f125ab9`, clean. Reviewer: QA r1 design pass. Code was not edited.

## How it was checked

- HEAD synced to dvd by `git archive | ssh tar` into `~/wedding_site/qar1d` (chmod 700). Built in Docker
  (`wedding-site-qa`, node 20): `npm run build` passed. Budget: initial JS 108.8 KB gz. Fonts are over the
  160 KB target for hi/mai/bn (218/218/210 KB), which is only a note.
- `tools/shots/shots.mjs --dist dist` default matrix per language (4 x G1 x 7 viewports + B0 390/1440 + reduced
  390) plus B1 at 390/1440: 32 contact sheets and about 550 section shots. Output in
  `~/wedding_site/qar1d/work/shots/<lang>` and `work/shotsB1/<lang>` on dvd. Not at rest: only
  `#celebrations` at 360x640 in all four languages (`paint 1`, the Mehndi brush still running at the bottom of the
  viewport).
- Probe scripts (kept outside the repo at `~/wedding_site/qar1d-tools/`): Cultures at scroll progress 0/0.5/1 and
  stepped through its full height (390, 768, 1440, 1920). Menu sheet open (390, 1440). Calendar disclosure open.
  Hover and focus on the gilt buttons. The opening entrance filmed every 400 ms. 844x390 landscape (hi).
  Reduced motion (mai, bride side). WebKit phone 390 (iPhone emulation). Output in `work/probe`, `work/cul2`,
  `work/wk`.
- Compared by eye against the card PDF
  `Akshay_Shreya_Invite_v2_Bengali_BrideFirst_OriginalCouple_NoReception.pdf` (7 pages) and the shots.

## Verdict

The site does read as the card: the palettes, the double gold frame with corner diamonds, Ganesh with its saffron
glow, the kalash, shehnai and diya, the toran and marigold strands, the event couples, and the order of the pages
all match. The opening entrance is calm and finishes in about 1.6 s. The wedding and reception plates look rich
at 1440. The bride-first and no-reception variants follow the card exactly (SA monogram, Sil family first, no 29).

Fish: one blocker. It is in the Cultures aripan (D1); no fish shows anywhere else. These were checked and are clean:
the toran, the marigold strands, the bamboo and lotus on the reception edge, the reception ring, the alpana, the
lotus, shankha, topor, paag, the shehnai and the venue ghosts (except the aripan ghost, which is D1 again).

Open: 1 blocker, 4 high, 9 medium and 6 low findings. Fix D1 to D5 before anyone else sees the site.

## Findings

Severity: **S1** blocker (an owner rule, or something a guest would notice and frown at), **S2** high (visibly
unpolished on a common device), **S3** medium (the posh feel suffers), **S4** low (polish).

### D1 (S1) The aripan corner buds read as fish
- **Where:** Cultures, the Mithila aripan square, all viewports and languages
  (`work/cul2/en-1440-3.jpg`, the corners of the square). The same buds appear in the aripan ghost in the corner of
  the Saharsa venue card (`en-G1-1440x900-venues`, top right).
- **What:** Each corner holds an almond shape with one dot inside, set on a curled stem at 45°. At display size
  the dot reads as an eye and the stem as a tail: a small fish. Fish in the four corners is exactly the classic
  Maithil aripan layout, so a Maithili guest will see a fish first. The owner's rule is no fish anywhere.
  `INDEX.md` names these "corner buds", so they are not meant as fish, but they read as fish.
- **Fix:** In `src/assets/motifs/aripan.svg` (and its source `aripan_line/paint.svg` and the ghost), replace the four
  corner buds with something that cannot read as a fish:
  - the closed lotus bud from `lotus_bud` (upright, straight stem, two sepals, no dot inside), or
  - three sindoor dots in a triangle.
  If a bud stays, take the dot out of it and point the bud along the diagonal, upright. Re-export the line, paint and
  ghost files, then repeat the fish check on the sheets at 390 and 1440.

### D2 (S2) Cultures: guests arrive at half-drawn art; the split lotus reads oddly
- **Where:** Cultures at 1024-1920 (the section is about one viewport tall, so what shows when its top reaches the
  bar is what guests read the title over), and the top of the phone scroll (`probe/en-1440-cultures-p0..1.jpg`,
  `probe/en-390-cultures-p0.jpg`).
- **What:**
  - The aripan lotus shows 3 of its 8 petals, all on the right side, so it looks broken rather than "being drawn".
  - The seam lotus is two outer half-cups with a gap where the centre should be. In mirror image the halves look
    like two creatures facing each other, which brings back the D1 fish risk.
  - Paag, topor and shankha are only strokes. All of them complete only after another 300-600 px of scroll.
- **Fix:**
  - Map the draw progress per motif rather than per section: 0 when the motif's centre crosses 85% of the viewport,
    1 at 45%. The top row is then complete while the title is read.
  - Draw the lotus and aripan petals in symmetric pairs, centre first and outwards, so a partial drawing is always
    a smaller whole flower.
  - Show the seam lotus complete with a fade, not drawn.
  - Keep the draw for the alpana ring and the leaf vine, where a partial drawing still looks deliberate.

### D3 (S2) The Tirhuta flourish still reads as a misspelt word, and the two script words do not pair (F15 open)
- **Where:** Cultures, every viewport (`en-G1-1440x900-cultures`, `bn-G1-390x844` sheet).
- **What:**
  - "মিথিনা" is set at heading size and weight right under the title. Bengali readers read it as a misspelt
    "মিথিলা", Hindi readers as "मिथिना".
  - At 1440 it is 40 px while "বাংলা" opposite is 60 px and bolder, on a different baseline (y 330 against 300). The
    pair looks accidental.
- **Fix:**
  - Follow F15: about 60% size, gold, a lighter stroke, the caption joined to it.
  - Give both words the same optical height and baseline, and the same gold.
  - Put a thin gold rule or the 3-dot ornament between the word and its caption, so both read as labelled
    specimens rather than headings.

### D4 (S2) The top bar collides with the card frame
- **Where:**
  - The opening at all sizes (`en-G1-390x844-opening`, `en-G1-1440x900-opening`, `probe/hi-844x390-opening`).
  - The plate sections at wide sizes (wedding, engagement, cultures at 1440).
- **What:**
  - On the opening the language pill and the monogram button sit on the frame's hairlines. The top-right corner
    diamond is hidden under the pill, and at 844x390 both hairlines run through the pill.
  - On pinned plate sections at wide sizes, the frame's top edge coincides with the bar's bottom border. The double
    frame therefore looks open at the top: no second hairline, no top corner diamonds.
  - The card's frame is always closed on four sides.
- **Fix:**
  - Opening: inset the frame from the top by `var(--bar-h)` (it starts below the bar), or float the bar inside the
    frame: bar inset `var(--frame-in-2)`, no bar border, pill fully inside the inner hairline.
  - Pinned sections: offset the frame top by `--bar-h` while the bar is shown (it is hidden on scroll down on
    phones, so animate the offset with the bar), or drop the bar's bottom hairline over plates.

### D5 (S2) Landscape phone: the opening dateline overflows the frame
- **Where:** 844x390, hi (`probe/hi-844x390-opening.jpg`). Likely the same in mai and bn, which have taller
  scripts.
- **What:** "कोलकाता · सहरसा" sits below the inner frame, and both bottom hairlines cross the line above it. It is
  the only place where text breaks the frame.
- **Fix:** In the `short` layout (max-height 520 px, landscape):
  - cap the h1 at `min(…, 16svh)`;
  - make the monogram ring 64 px;
  - set the dateline as one line ("२५, २६ एवं २९ नवंबर · कोलकाता · सहरसा") or move it beside the names.
  - Add 844x390 and 740x360 for hi/mai/bn to the `e2e/layout` text-inside-frame check.

### D6 (S3) Compact language labels on phones: "हि" and "मै"
- **Where:** The bar under 480 px (every 390 shot).
- **What:**
  - "मै" reads as a misspelt "मैं" ("I"), and "हि" and "मै" are two Devanagari stubs that are hard to tell apart.
  - "বা" is fine but terse. It does not feel posh.
  - There is room: between the monogram and the menu button about 250 px are free at 390. The full endonyms
    "English हिन्दी मैथिली বাংলা" at 13-14 px need about 220 px.
- **Fix:** Show the full endonyms down to 360 px, and keep the compact form (with a full `aria-label`) only below
  360. A native reader confirms (`NATIVE_REVIEW.md`).

### D7 (S3) Event action buttons on phones are heavy and unequal
- **Where:** Every event at 360/390 (`en-G1-390x844-engagement`, `-haldi`).
- **What:**
  - Two stacked pills of different widths (calendar about 233 px, maps about 181 px), with 16 px tracked capitals
    and 44 px height.
  - After the couple they are the strongest shapes on the screen, and the unequal widths make a stepped silhouette
    under a centred composition. The card has no buttons, so they should be as quiet as the dateline.
- **Fix:**
  - Give both the same inline size (the wider of the two), set the label at 13-14 px with 0.12em tracking, and
    keep the 44 px tap height through padding.
  - Alternatively, put one row of two equal pills at 360 px and up ("Calendar" and "Maps", full words in
    `aria-label`).

### D8 (S3) The same couple twice in a row (Wedding, then Reception)
- **Where:** Wedding and Reception at every size. On phones they are identical: centred, same size.
- **What:** The owner chose the original 4 couples and Reception reuses the wedding couple, which is fine. Shown
  at the same scale and placement in consecutive screens, though, it looks like a repeated slide.
- **Fix** (no new art):
  - Show the Reception couple at about 85% scale, standing on the aripan ring that is already there.
  - Add a soft gold halo or arch hairline behind them (in the evening-lights palette).
  - On phones, keep the facts above the couple in Reception (reversed order) or offset it.
  - Do not mirror the art: it would swap the bride's and groom's sides and the saree drape.

### D9 (S3) Venues at wide sizes: a stretched card and clipped ghosts
- **Where:** 1024-1920 (`en-G1-1440x900-venues`).
- **What:**
  - The Saharsa card is stretched to the Kolkata card's height, leaving about 300 px of empty card.
  - The ghost corner motifs spill over the cards' inner hairline. The Kolkata alpana crosses it; the Saharsa aripan
    is cut off by the outer edge.
- **Fix:**
  - Either `align-items: start` (each card keeps its own height, and the pair is centred on a shared top), or
    centre the Saharsa content vertically and put the diya or lotus line art at its foot.
  - Clip each ghost to the inner frame (`clip-path: inset(var(--card-gap))` on the ghost layer) and keep it about
    70% inside the corner.

### D10 (S3) Hard seams between paper bands
- **Where:** Countdown to Celebrations at 1440 (`en-G1-1440x900-countdown`, y about 687), and the same seam at
  390 and 768.
- **What:** Two slightly different paper tones meet in a straight horizontal line. The plates end with brush edges,
  so this square seam looks like a layout bug.
- **Fix:** Use one paper token for consecutive paper bands, or feather the join with the brush-edge texture used
  for the plates (60-80 px).

### D11 (S3) Desktop scale: small islands in big fields
- **Where:** 1440 and 1920: the countdown card (`en-G1-1440x900-countdown`), the celebrations chips, the event facts
  column at 1920 (the mai sheet), and the menu sheet.
- **What:**
  - The countdown card is 640 px wide in a 1440x900 field, with 64 px digits.
  - The chips are 200x60 px.
  - At 1920 the event facts block is about 15% of the width, and its address is 20 px.
  - The result is elegant but slightly underdressed. The card fills its page with the composition.
- **Fix:**
  - Countdown: `inline-size: clamp(640px, 46vw, 880px)` and digits `clamp(56px, 6vw, 112px)`.
  - Chips: grow to about 240x68 at xl.
  - Facts: +10-15% type at `xl` (address 22 px, venue 32 px).
  - Event title: make sure it is at least 1.4x the tagline block width.

### D12 (S3) The Haldi frame is red; the card's is gold
- **Where:** Haldi at all sizes (the frame hairlines, the corner diamonds and the Haldi chip border).
- **What:** On the card all event frames are the same fine gold-brown; only the title is red.
- **Fix:** Use the gold frame tokens on the haldi palette. Keep `--title` red.

### D13 (S3) The menu sheet looks unfinished at wide sizes
- **Where:** 1440 (`probe/en-1440-menu.jpg`).
- **What:**
  - A 420 px panel with 17 px items. The lower 40% of the panel is empty.
  - The header hairline stops short of the close button.
  - The close button sits off the list's right edge.
  - On phones it looks good: the event diamonds in each event's colour are a lovely touch.
- **Fix:**
  - Centre the list vertically in the panel.
  - Set the items at 22-24 px with 1.6 line height.
  - Run the header rule to the close button and align the button with the list's right edge.
  - Close the panel with the diya or the "Jha family & Sil family" line in small caps.

### D14 (S3) Failed image decode leaves outlined boxes and grey ovals (verify on a real iPhone)
- **Where:** Playwright WebKit at 390 (`work/wk/*.jpg`): engagement, haldi and wedding.
- **What:**
  - Linux WebKit claims AVIF but does not decode it (F9, the environment). The plates fall back to the blurred
    placeholder and the couples are missing.
  - What shows instead is the design risk: a 1 px grey rectangle where the couple should be, and the text glazes
    become visible as grey smoky ovals behind the tagline and facts.
  - Real Safari decodes AVIF, but any slow or failed image would look the same.
- **Fix:**
  - `img { border: 0 }`, with the alt text hidden visually (the facts are in the text).
  - `onerror` on the couple and plate `<img>`: drop the AVIF `<source>` and retry with WebP.
  - Hold the glaze at opacity 0 until the plate's `decode()` resolves.
  - Owner's iPhone check (QA.md manual 3) covers the real device.

### D15 (S4) Edge motifs cross the frame on phones
- **Where:** 390: the Haldi banana leaf (bottom left, cut by the viewport and over both hairlines) and the
  Engagement toran (the right leaf over the corner diamond).
- **What:** The card keeps the banana leaf inside the frame.
- **Fix:** Inset the leaf by `--frame-in-2`, and end the toran string at the inner hairline on tall frames.

### D16 (S4) Kalash and shankha touch the wedding couple
- **Where:** Wedding at 1024-1920 (`en-G1-1440x900-wedding`).
- **What:** The kalash leaves overlap the groom's feet and the shankha the bride's hem. On the card they stand
  clear of the couple.
- **Fix:** Move each 24-40 px outward, or anchor them to the couple box edges plus a gap.

### D17 (S4) The tile edge at the bottom of the wedding plate is still visible (F2)
- **Where:** 1440, wedding bottom right, a lighter band at y about 868-900 from x 1065 to 1410.
- **What:** As F2: headless software raster under the scale loop.
- **Fix:** As F2. Check on a low-end Android device.

### D18 (S4) At 360x640 the Mehndi brush still runs when Celebrations is reached
- **Where:** 360x640, all languages: "not at rest: #celebrations (paint 1)".
- **What:** The Mehndi plate's reveal is in view at the bottom of Celebrations and keeps its `data-paint` phase. A
  guest who stops there sees half a brush.
- **Fix:** Start a plate's reveal only when 25% of it is visible (as the content entrances do), or finish it within
  the reveal time even when it is barely in view.

### D19 (S4) Closing and footer repeat each other
- **Where:** The end of the page, every size.
- **What:** The closing has the monogram and "Jha family & Sil family". The footer below it repeats the monogram
  and adds the pair of names. With the sticky closing frame both are on screen at once (the `footer` shots).
- **Fix:** Drop the footer monogram (keep the names and languages), or shrink it to 24 px.

### D20 (S4) Couple images look soft at wide sizes
- **Where:** Wedding and reception at 1440 and 1920.
- **What:** The 720 px tall source is shown at about 600 css px. There is light JPEG-like softness on the saree
  zari.
- **Fix:** Add a 1080h step to the couple `srcset` for DPR >= 1.5 at wide sizes, if the budget allows (it is
  lazy-loaded, so it does not affect LCP).

## What is good (keep)

- The palettes and plates are true to the card: ivory marble, blush invitation, mehndi green, engagement lilac,
  haldi turmeric, wedding vermilion, and a new reception teal that fits the family.
- Type: Pinyon titles, Cormorant body and tracked dateline caps in English. Tiro Bangla, Sahitya and Atma read
  naturally in bn/hi/mai. No clipped conjuncts were seen on the sheets.
- Culture: the kalash, shehnai and Ganesh as on the card, the aripan versus alpana pairing, paag versus topor, and
  bamboo and lotus at the Mithila reception. The event-coloured diamonds in the menu.
- Motion: the opening builds in the card's order in about 1.6 s with no flash. Reduced motion shows everything at
  once.
- The menu, calendar disclosure (double gilt frame) and focus ring (double ring) are on-brand.

## Not covered in this pass

- A real iPhone or Android device.
- Native-reader review of the hi/mai/bn wording.
- Motion filmstrips of every event (covered by the earlier `frames.mjs` record; only the opening was filmed here).
- 360 px detail beyond the contact sheets.

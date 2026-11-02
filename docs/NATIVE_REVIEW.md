# Native review list (spec 4.8)

This is the list for the Hindi, Maithili and Bengali reviewers. It covers only the new website words (buttons, menu
labels, captions). Names, dates, times, venues, addresses and the invitation text come from the reviewed card copy
(WeddingInvite2 `content.json`) and are not reviewed again here.

## 1. How to review

1. Open the site in your language (`/hi/`, `/mai/`, `/bn/`) or look at the screenshots that come with this file
   (section 2). Each string below appears there in context.
2. In the table (section 4), write `ok` in the last column, or the replacement text. Add a note if a word is right but
   the tone is not (too formal, too casual, too literal).
3. An agent copies the answers into `content/ui.json` and runs `npm run gen:i18n`. The table is regenerated from
   `content/ui.json` by that command; what you wrote in the last column is kept, row by row.
4. Content strings (names, dates, venues, taglines) change only in WeddingInvite2's `content.json`, which is then
   re-snapshotted into this repo (spec 0.1).

## 2. Screenshots

Taken from the built site (`npm run build`, `vite preview`, Chromium) at 390x844 (phone) and 1440x900 (laptop), in the
default order (Jha family hosts) with the Reception shown. File names: `<lang>-<width>-<view>.png`, where `view` is
`page` (the whole page), `menu` (the menu sheet open: every navigation label) and `countdown` (the countdown band).
They are handed over with this file; they are not committed (they show the invitation's personal details).

## 3. Points to check first

- **Maithili polite imperatives**: करू (बंद करू, स्क्रॉल करू), जोड़ू (कैलेंडरमे जोड़ू), देखू (मैपमे देखू), जाउ (ऊपर जाउ,
  सोझे निमंत्रण पर जाउ), बजाउ, रोकू, दिअ. Are they the right register for guests (respectful, not stiff)?
- **The countdown label in the menu**: hi "उलटी गिनती" (literal "countdown"), mai "बाँकी दिन" ("days remaining"), bn
  "ক্ষণগণনা" (literary; would "কাউন্টডাউন" read more naturally?).
- **Countdown heading**: hi "शुभ विवाह में शेष" (शेष or बाकी?), mai "शुभ विवाहमे बाँकी", bn "শুভ বিবাহের আর বাকি".
- **Hindi hour plural**: one घंटा for exactly 1 (१ घंटा), other घंटे for 0 and 2 or more (० घंटे, ५ घंटे). Maithili and
  Bengali use one form (घंटा, ঘণ্টা). The screen-reader sentence `countdown.sr` follows the same rule.
- **Spelling of "second"**: hi सेकंड, mai सेकेंड. Both on purpose?
- **Bengali genitive** in the picture description (`alt.couple`): the code adds "র" after a final vowel or vowel sign
  (মেহেন্দির) and "এর" after a final consonant (বাগদানের, গায়ে হলুদের, শুভ বিবাহের, প্রীতিভোজের).
- **Maithili genitive** in the same description: `{event}क` gives मेंहदीक, सगाईक, हरदिक, शुभ विवाहक, बहुभोजक.
- **The Mithilakshar caption** (`cultures.tirhuta`) and the Bengali-script caption (`cultures.bangla`): do the quotes and
  the order of words read naturally?

## 4. UI strings (`content/ui.json`)

`{d}`, `{h}`, `{m}` are numbers (written in your digits: २४, ২৪). `{h:countdown.hours}` is the word for hours in the
right number (१ घंटा, ५ घंटे). `{event}` is an event title from the card (मेहंदी, শুভ বিবাহ ...). "(reviewed)" marks
strings already approved for the card. Apple, Outlook, .ics stay in Latin letters in every language.

<!-- ui-review:start -->

| Key                 | en                                                                                              | hi (draft)                                                     | mai (draft)                                    | bn (draft)                                         | What to check                                                                                                                                    | Review (ok, or the replacement) |
| ------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `nav.menu`          | Menu                                                                                            | मेनू                                                           | मेनू                                           | মেনু                                               |                                                                                                                                                  |                                 |
| `nav.close`         | Close                                                                                           | बंद करें                                                       | बंद करू                                        | বন্ধ করুন                                          | mai: is the polite imperative करू right here, or बंद करी?                                                                                        |                                 |
| `nav.invitation`    | Invitation                                                                                      | निमंत्रण                                                       | निमंत्रण                                       | আমন্ত্রণ                                           |                                                                                                                                                  |                                 |
| `nav.countdown`     | Countdown                                                                                       | उलटी गिनती                                                     | बाँकी दिन                                      | ক্ষণগণনা                                           | mai: बाँकी दिन (days remaining) as the menu label for the countdown; hi: उलटी गिनती; bn: ক্ষণগণনা is literary, is কাউন্টডাউন more natural?       |                                 |
| `nav.cultures`      | Mithila & Bengal                                                                                | मिथिला और बंगाल                                                | मिथिला आ बंगाल                                 | মিথিলা ও বাংলা                                     |                                                                                                                                                  |                                 |
| `nav.venues`        | Venues                                                                                          | आयोजन स्थल                                                     | आयोजन स्थल                                     | অনুষ্ঠানস্থল                                       |                                                                                                                                                  |                                 |
| `nav.top`           | Back to top                                                                                     | ऊपर जाएँ                                                       | ऊपर जाउ                                        | উপরে যান                                           | mai: जाउ (polite imperative)                                                                                                                     |                                 |
| `a11y.skip`         | Skip to the invitation                                                                          | सीधे निमंत्रण पर जाएँ                                          | सोझे निमंत्रण पर जाउ                           | সরাসরি আমন্ত্রণে যান                               | mai: सोझे ... जाउ                                                                                                                                |                                 |
| `a11y.newTab`       | (opens in a new tab)                                                                            | (नए टैब में खुलेगा)                                            | (नव टैबमे खुजत)                                | (নতুন ট্যাবে খুলবে)                                | mai: खुजत (will open)                                                                                                                            |                                 |
| `a11y.scrollCue`    | Scroll to open the invitation                                                                   | निमंत्रण देखने के लिए नीचे स्क्रॉल करें                        | निमंत्रण देखबाक लेल नीचाँ स्क्रॉल करू          | আমন্ত্রণ দেখতে নিচে স্ক্রোল করুন                   | mai: नीचाँ स्क्रॉल करू                                                                                                                           |                                 |
| `lang.label`        | Language                                                                                        | भाषा                                                           | भाषा                                           | ভাষা                                               |                                                                                                                                                  |                                 |
| `countdown.title`   | Until the wedding                                                                               | शुभ विवाह में शेष                                              | शुभ विवाहमे बाँकी                              | শুভ বিবাহের আর বাকি                                | all: the heading above the numbers (Until the wedding). hi: शेष vs बाकी                                                                          |                                 |
| `countdown.days`    | day / days                                                                                      | दिन                                                            | दिन                                            | দিন                                                |                                                                                                                                                  |                                 |
| `countdown.hours`   | hour / hours                                                                                    | घंटा / घंटे                                                    | घंटा                                           | ঘণ্টা                                              | hi: one घंटा for 1, other घंटे for 0 and 2+ (१ घंटा, ५ घंटे); mai and bn one form                                                                |                                 |
| `countdown.minutes` | minute / minutes                                                                                | मिनट                                                           | मिनट                                           | মিনিট                                              |                                                                                                                                                  |                                 |
| `countdown.seconds` | second / seconds                                                                                | सेकंड                                                          | सेकेंड                                         | সেকেন্ড                                            | hi सेकंड vs mai सेकेंड: both spellings on purpose?                                                                                               |                                 |
| `countdown.sr`      | {d} {d:countdown.days}, {h} {h:countdown.hours} and {m} {m:countdown.minutes} until the wedding | शुभ विवाह में {d} दिन, {h} {h:countdown.hours} और {m} मिनट शेष | शुभ विवाहमे {d} दिन, {h} घंटा आ {m} मिनट बाँकी | শুভ বিবাহের আর {d} দিন, {h} ঘণ্টা ও {m} মিনিট বাকি | read by screen readers only. hi takes the hour plural from countdown.hours                                                                       |                                 |
| `cal.add`           | Add to calendar                                                                                 | कैलेंडर में जोड़ें                                             | कैलेंडरमे जोड़ू                                | ক্যালেন্ডারে যোগ করুন                              | mai: जोड़ू (polite imperative)                                                                                                                   |                                 |
| `cal.addAll`        | Add all to calendar                                                                             | सभी कार्यक्रम कैलेंडर में जोड़ें                               | सभ कार्यक्रम कैलेंडरमे जोड़ू                   | সব অনুষ্ঠান ক্যালেন্ডারে যোগ করুন                  | mai: सभ कार्यक्रम ... जोड़ू                                                                                                                      |                                 |
| `cal.ics`           | Apple · Outlook (.ics)                                                                          | Apple · Outlook (.ics) (reviewed)                              | Apple · Outlook (.ics) (reviewed)              | Apple · Outlook (.ics) (reviewed)                  |                                                                                                                                                  |                                 |
| `cal.google`        | Google Calendar                                                                                 | गूगल कैलेंडर                                                   | गूगल कैलेंडर                                   | গুগল ক্যালেন্ডার                                   |                                                                                                                                                  |                                 |
| `maps.open`         | Open in Maps                                                                                    | मैप पर देखें (reviewed)                                        | मैपमे देखू                                     | ম্যাপে খুঁজুন (reviewed)                           | mai: मैपमे देखू (hi and bn are the reviewed card labels)                                                                                         |                                 |
| `cultures.title`    | Mithila & Bengal                                                                                | मिथिला और बंगाल                                                | मिथिला आ बंगाल                                 | মিথিলা ও বাংলা                                     |                                                                                                                                                  |                                 |
| `cultures.aripan`   | Aripan · Mithila                                                                                | अरिपन · मिथिला                                                 | अरिपन · मिथिला                                 | অরিপন · মিথিলা                                     |                                                                                                                                                  |                                 |
| `cultures.paag`     | Paag                                                                                            | पाग                                                            | पाग                                            | পাগ                                                |                                                                                                                                                  |                                 |
| `cultures.lotus`    | Lotus                                                                                           | कमल                                                            | कमल                                            | পদ্ম                                               |                                                                                                                                                  |                                 |
| `cultures.alpana`   | Alpana · Bengal                                                                                 | अल्पना · बंगाल                                                 | अल्पना · बंगाल                                 | আলপনা · বাংলা                                      |                                                                                                                                                  |                                 |
| `cultures.topor`    | Topor                                                                                           | टोपर                                                           | टोपर                                           | টোপর                                               |                                                                                                                                                  |                                 |
| `cultures.shankha`  | Shankha                                                                                         | शंख                                                            | शंख                                            | শঙ্খ                                               |                                                                                                                                                  |                                 |
| `cultures.tirhuta`  | “Mithila” in Mithilakshar (Tirhuta)                                                             | मिथिलाक्षर (तिरहुता) में “मिथिला”                              | मिथिलाक्षर (तिरहुता)मे “मिथिला”                | মিথিলাক্ষরে (তিরহুতা) “মিথিলা”                     | the caption under the Mithilakshar flourish                                                                                                      |                                 |
| `cultures.bangla`   | “Bangla” in Bengali script                                                                      | बांग्ला लिपि में “बांग्ला”                                     | बांग्ला लिपिमे “बांग्ला”                       | বাংলা লিপিতে “বাংলা”                               |                                                                                                                                                  |                                 |
| `alt.couple`        | Illustrated bride and groom dressed for the {event}                                             | {event} के परिधान में वर-वधू का चित्र                          | {event}क परिधानमे वर-कनियाँक चित्र             | {event}{gen} সাজে বর-কনের ছবি                      | bn: the genitive {gen} (মেহেন্দির, বাগদানের, গায়ে হলুদের, শুভ বিবাহের, প্রীতিভোজের); mai: {event}क (मेंहदीक, सगाईक, हरदिक, शुभ विवाहक, बहुभोजक) |                                 |
| `music.play`        | Play music                                                                                      | संगीत चलाएँ                                                    | संगीत बजाउ                                     | গান চালান                                          | mai: बजाउ (polite imperative)                                                                                                                    |                                 |
| `music.pause`       | Pause music                                                                                     | संगीत रोकें                                                    | संगीत रोकू                                     | গান থামান                                          | mai: रोकू (polite imperative)                                                                                                                    |                                 |
| `rsvp.cta`          | RSVP                                                                                            | उपस्थिति की सूचना दें                                          | अपन उपस्थितिक सूचना दिअ                        | উপস্থিতি জানান                                     | mai: दिअ (polite imperative); only shown if the owner sets an RSVP link                                                                          |                                 |
| `gallery.title`     | Gallery                                                                                         | गैलरी                                                          | गैलरी                                          | গ্যালারি                                           |                                                                                                                                                  |                                 |

<!-- ui-review:end -->

## 5. Reused card strings (already reviewed, not in the table)

- The Celebrations heading and its menu item: `single_page.events_heading` of the card.
- Screen-reader labels for date, time and venue: the card's `labels.date`, `labels.time`, `labels.venue`.
- "Open in Maps" in hi (मैप पर देखें) and bn (ম্যাপে খুঁজুন): the card's map label.
- Event titles, dates, times, venues and family names everywhere.

## 6. What the code does to the text (no action needed; tell us if a line breaks badly)

- Numbers are written with your digits (०१२३४५६७८९, ০১২৩৪৫৬৭৮৯); the countdown pads hours and minutes with the native
  zero (०७, ০৫).
- Lines never break before a postposition (के, में, पर, ...), after शुभ / শুভ, inside a name with its honorific
  (चि. अक्षय आनंद), between a number and its unit (२९ नवंबर, संध्या ६ बजे, সন্ধ্যা ৬টা), or before the dot separator
  "·".
- Addresses are split into two lines after a comma, the split that keeps the longer line shortest.

## 7. Tirhuta flourish (spec 2.3.5)

"मिथिला" in Mithilakshar (U+114A7 U+114B1 U+1149F U+114B1 U+114AA U+114B0): spelling, glyph shapes, and whether it
sits well with Bengali-reading guests. It is drawn as an outline (not live text), so a correction means a rebuild of
that one SVG.

## 8. Carried from the content (`WeddingInvite2/assets/copy/NOTES.md`, still open)

सील vs शील (hi/mai), mai बहुभोज, bn প্রীতিভোজ, en "&" vs "with". (The site's checks accept सील and शील for the Sil
family while this is open.)

// An independent RFC 5545 reader/validator for the site's .ics files (A-EV-5). Shared by the unit tests (on the output
// of src/lib/ics.ts) and the e2e tests (on the downloaded file). It never imports the code under test.

export interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

export interface IcsComponent {
  name: string;
  props: IcsProperty[];
  children: IcsComponent[];
}

const enc = new TextEncoder();
const strict = new TextDecoder('utf-8', { fatal: true });

/** Octets of a string in UTF-8. */
export const octets = (s: string): number => enc.encode(s).length;

/**
 * Reference folding (RFC 5545 3.1): a physical line holds at most 75 octets; a continuation starts with one space
 * (which counts towards the 75). Splits only between code points, so a multi-byte sequence is never cut.
 */
export function foldReference(line: string): string {
  const out: string[] = [];
  let cur = '';
  let curOctets = 0;
  for (const ch of line) {
    const n = octets(ch);
    const limit = out.length === 0 ? 75 : 74;
    if (curOctets + n > limit) {
      out.push(cur);
      cur = '';
      curOctets = 0;
    }
    cur += ch;
    curOctets += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Escape a TEXT value (RFC 5545 3.3.11). */
export const escapeReference = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Unescape a TEXT value; throws on an escape RFC 5545 does not define. */
export function unescapeText(v: string): string {
  return v.replace(/\\(.)/g, (_, c: string) => {
    if (c === 'n' || c === 'N') return '\n';
    if (c === '\\' || c === ';' || c === ',') return c;
    throw new Error(`invalid escape "\\${c}"`);
  });
}

/** Unfold the logical lines of a file (after validation, so CRLF is guaranteed). */
export function unfold(text: string): string[] {
  return text
    .replace(/\r\n[ \t]/g, '')
    .split('\r\n')
    .filter((l) => l !== '');
}

function parseLine(line: string): IcsProperty {
  // name *(";" param) ":" value; parameter values may be quoted
  const m = /^([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=(?:"[^"]*"|[^;:,"]*)(?:,(?:"[^"]*"|[^;:,"]*))*)*):(.*)$/.exec(line);
  if (!m) throw new Error(`not a content line: ${line}`);
  const params: Record<string, string> = {};
  for (const p of (m[2] ?? '').split(';').filter(Boolean)) {
    const [k, ...rest] = p.split('=');
    params[k!.toUpperCase()] = rest.join('=').replace(/^"|"$/g, '');
  }
  return { name: m[1]!.toUpperCase(), params, value: m[3] ?? '' };
}

/** Parse a whole file into its component tree (VCALENDAR at the root). */
export function parseIcs(text: string): IcsComponent {
  const stack: IcsComponent[] = [];
  let root: IcsComponent | null = null;
  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (p.name === 'BEGIN') {
      const c: IcsComponent = { name: p.value.toUpperCase(), props: [], children: [] };
      if (stack.length) stack[stack.length - 1]!.children.push(c);
      else if (root) throw new Error('more than one root component');
      else root = c;
      stack.push(c);
    } else if (p.name === 'END') {
      const top = stack.pop();
      if (!top || top.name !== p.value.toUpperCase()) throw new Error(`END:${p.value} does not close ${top?.name}`);
    } else {
      if (!stack.length) throw new Error(`property outside a component: ${p.name}`);
      stack[stack.length - 1]!.props.push(p);
    }
  }
  if (stack.length) throw new Error(`unclosed ${stack.map((c) => c.name).join(' > ')}`);
  if (!root) throw new Error('empty file');
  return root;
}

export const prop = (c: IcsComponent, name: string): IcsProperty | undefined => c.props.find((p) => p.name === name);
export const props = (c: IcsComponent, name: string): IcsProperty[] => c.props.filter((p) => p.name === name);
export const events = (cal: IcsComponent): IcsComponent[] => cal.children.filter((c) => c.name === 'VEVENT');

/** A TEXT value with a ";" or "," that is not escaped. */
function hasUnescaped(v: string): boolean {
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\') i++;
    else if (v[i] === ';' || v[i] === ',') return true;
  }
  return false;
}

const UTC = /^\d{8}T\d{6}Z$/;
const TEXT_PROPS = new Set(['SUMMARY', 'DESCRIPTION', 'LOCATION']);

/** Every RFC 5545 rule the site promises (A-EV-5), on a string. Returns error strings; empty = valid. */
export function validateIcs(text: string): string[] {
  return validateIcsBytes(enc.encode(text));
}

/**
 * The same on the raw bytes of a file (a downloaded .ics): a fold that cuts a UTF-8 sequence can only be seen here,
 * because decoding to a string would already have replaced the broken halves.
 */
export function validateIcsBytes(bytes: Uint8Array): string[] {
  const errors: string[] = [];
  const n = bytes.length;
  const bare = new Set<string>();
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] !== 0x0a) bare.add('bare CR');
    if (bytes[i] === 0x0a && bytes[i - 1] !== 0x0d) bare.add('bare LF');
  }
  if (bare.size) return [...bare].map((b) => `${b}: every line must end with CRLF`);
  if (n < 2 || bytes[n - 2] !== 0x0d || bytes[n - 1] !== 0x0a) errors.push('the file must end with CRLF');
  // physical lines on the byte level: <= 75 octets, valid UTF-8 on their own (no sequence split by a fold)
  let start = 0;
  let lineNo = 0;
  for (let i = 0; i < n; i++) {
    if (!(bytes[i] === 0x0d && bytes[i + 1] === 0x0a)) continue;
    const line = bytes.subarray(start, i);
    lineNo++;
    if (line.length > 75) errors.push(`line ${lineNo}: ${line.length} octets (max 75)`);
    try {
      strict.decode(line);
    } catch {
      errors.push(`line ${lineNo}: a fold splits a UTF-8 sequence`);
    }
    start = i + 2;
    i++;
  }
  if (errors.length) return errors;
  const text = strict.decode(bytes);
  let cal: IcsComponent;
  try {
    cal = parseIcs(text);
  } catch (e) {
    return [`parse: ${(e as Error).message}`];
  }
  if (cal.name !== 'VCALENDAR') errors.push(`root is ${cal.name}, not VCALENDAR`);
  if (prop(cal, 'VERSION')?.value !== '2.0') errors.push('VERSION must be 2.0');
  if (!prop(cal, 'PRODID')?.value) errors.push('PRODID missing');
  const evs = events(cal);
  if (!evs.length) errors.push('no VEVENT');
  const uids = new Set<string>();
  for (const [i, ev] of evs.entries()) {
    const where = `VEVENT ${i + 1}`;
    for (const name of ['UID', 'DTSTAMP', 'DTSTART', 'SUMMARY']) {
      const n = props(ev, name).length;
      if (n !== 1) errors.push(`${where}: ${name} appears ${n} times (exactly 1 required)`);
    }
    const uid = prop(ev, 'UID')?.value ?? '';
    if (uids.has(uid)) errors.push(`${where}: duplicate UID ${uid}`);
    uids.add(uid);
    for (const name of ['DTSTAMP', 'DTSTART', 'DTEND']) {
      const p = prop(ev, name);
      if (p && !UTC.test(p.value)) errors.push(`${where}: ${name} "${p.value}" is not a UTC date-time`);
    }
    if (prop(ev, 'DTEND') && prop(ev, 'DURATION')) errors.push(`${where}: DTEND and DURATION together`);
    for (const p of ev.props) {
      if (!TEXT_PROPS.has(p.name)) continue;
      if (hasUnescaped(p.value)) errors.push(`${where}: unescaped ; or , in ${p.name}`);
      try {
        unescapeText(p.value);
      } catch (e) {
        errors.push(`${where}: ${p.name}: ${(e as Error).message}`);
      }
    }
  }
  return errors;
}

/** The ICS UTC form of an ISO instant: 2026-11-26T12:30:00Z -> 20261126T123000Z. */
export const icsUtc = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

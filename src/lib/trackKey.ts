import { createHash } from 'crypto';

const PAREN_OR_BRACKET = /\s*[\(\[].*?[\)\]]\s*/g;
const FEAT = /\b(feat\.?|featuring|ft\.?|with)\b.*/i;
const REMASTER = /\s*-\s*(remaster(ed)?|mono|stereo|deluxe|edit|version|live|radio edit).*$/i;
const PUNCT = /[^a-z0-9 ]/g;
const MULTI_SPACE = /\s+/g;

export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(PAREN_OR_BRACKET, ' ')
    .replace(FEAT, ' ')
    .replace(REMASTER, ' ')
    .replace(PUNCT, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim();
}

export function normalizeArtist(raw: string): string {
  // Spotify notifications often join multiple artists with ", " or " & ".
  // Use only the first artist for keying to keep matches resilient.
  const primary = raw.split(/,|&|;|\/| feat\.? | ft\.? | with /i)[0] ?? raw;
  return primary
    .toLowerCase()
    .replace(PUNCT, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim();
}

export function trackRawKey(artist: string, name: string, durationMs: number): string {
  const a = normalizeArtist(artist);
  const n = normalizeTitle(name);
  const d = Math.round(durationMs / 1000);
  return createHash('sha1').update(`${a}|${n}|${d}`).digest('hex');
}

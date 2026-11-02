import { describe, expect, it } from 'vitest';
import { mapsUrl } from '../../src/lib/maps';
import { FILES } from '../helpers';

describe('Open in Maps (A-EV-4)', () => {
  it('builds the Google Maps search URL from the English map line', () => {
    const urls = Object.fromEntries(FILES.bn.variants.G1.events.map((e) => [e.key, mapsUrl(e.mapQuery)]));
    expect(urls.mehndi).toBe(
      'https://www.google.com/maps/search/?api=1&query=Agora%20Banquets%2C%2067%20Nalini%20Ranjan%20Ave%2C%20Block%20H%2C%20New%20Alipore%2C%20Kolkata',
    );
    expect(urls.haldi).toBe(
      'https://www.google.com/maps/search/?api=1&query=Roy%20Bari%20Events%20(Gate%20No.%202)%2C%20192B%20%26%20C%2C%20Netaji%20Subhas%20Chandra%20Bose%20Rd%2C%20Regent%20Park%2C%20Kolkata',
    );
    expect(urls.reception).toBe(
      'https://www.google.com/maps/search/?api=1&query=Dev%20Resort%2C%20Gangjala%20Chowk%20Dhala%2C%20near%20Bus%20Stand%2C%20Sant%20Nagar%2C%20Saharsa%2C%20Bihar%20852201',
    );
    expect(urls.engagement).toBe(urls.mehndi);
    expect(urls.wedding).toBe(urls.haldi);
  });
});

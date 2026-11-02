// The one long page, in the order of spec 2.2.
import { config } from '../config';
import { Opening } from './Opening';
import { Invitation } from './Invitation';
import { Countdown } from './Countdown';
import { Celebrations } from './Celebrations';
import { Cultures } from './Cultures';
import { Venues } from './Venues';
import { Rsvp } from './Rsvp';
import { Gallery } from './Gallery';
import { Closing } from './Closing';

export function Page() {
  return (
    <>
      <Opening />
      <Invitation />
      <Countdown />
      <Celebrations />
      {config.sections.cultures && <Cultures />}
      <Venues />
      <Rsvp />
      <Gallery />
      <Closing />
    </>
  );
}

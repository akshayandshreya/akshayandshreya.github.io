// Event actions (spec 2.3.4): "Add to calendar" (.ics + Google, a disclosure) and "Open in Maps" (English map line).
import type { EventCopy } from '../i18n/types';
import { AddToCalendar } from '../components/actions/AddToCalendar';
import { OpenInMaps } from '../components/actions/OpenInMaps';

export function EventActions({ event }: { event: EventCopy }) {
  return (
    <div className="event__actions" data-slot="calendar">
      <AddToCalendar events={[event]} />
      <OpenInMaps query={event.mapQuery} />
    </div>
  );
}

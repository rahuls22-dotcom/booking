# Prosperr CMS — Call booking

The two booking flows from the CMS prototype, running with no build step:
open `index.html` or serve the folder.

    python3 -m http.server 8080

## The flows

**Client-first** — Users ▸ pick a client ▸ Manage Appointment ▸ Create Event.
The client is fixed; you choose the advisor, the consultation type, and a slot
that is free for everyone on the invite. Review the invite, then send.

**Advisor-first** — Team ▸ Schedule Meetings. The advisors are fixed and the
client changes, which is an RM working down a call list. Tick advisors and
their columns appear beside each other; pick a slot and a panel opens from the
right for the agenda, the client and anyone else. Both paths end at the same
review-then-send screen, so nothing is sent unseen.

## Two decisions worth knowing

**A busy block carries start and end, never a title.** The calendar answers
"when are they free", not "what else are they doing" — a client's name on
another client's screen is a leak, not a feature.

**Free time is the working window minus what is booked.** An earlier version
generated slots by stepping `length + gap`, which with a 30-minute length and
a 60-minute gap offered four pills in a six-hour day and left four hours
rendering as blank space that was neither free, busy, nor out of hours. The
gap was a booking cadence, and cadence does not belong in what the calendar
claims is free. Clicking a band books from where the pointer lands, snapped to
the quarter hour.

## Layout

    index.html                 load order matters; the DS carries a compiled
                               copy of the app, so data.js loads after it
    src/data.js                clients, staff, availability, appointments
    src/app.jsx                shell, nav, routing between the flows
    src/screens/
      users.jsx                client list and the client page
      book-a-call.jsx          client-first booking
      team-schedule.jsx        advisor-first board and the booking panel
      email-draft.jsx          invite review
      confirmation.jsx         the booked appointment
    src/components/time-picker.jsx
    src/ds/prosperr-ds.js      design-system namespace
    styles/                    tokens, components, app

All client data is generated. No real people, no credentials.

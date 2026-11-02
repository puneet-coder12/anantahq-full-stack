# Clinic Slots

React (Vite) UI + Express API, MongoDB storage, deployable on Vercel.

## Run locally
```bash
npm install
cp .env.example .env     # set MONGODB_URI, or delete it to use the in-memory DB
npm run dev              # UI http://localhost:5173, API :3001
npm test                 # booking rules + HTTP tests (no database needed)
```

## Deploy to Vercel
1. Push to GitHub, import the repo in Vercel (Vite is auto-detected).
2. Add env vars `MONGODB_URI` and `MONGODB_DB`. In MongoDB Atlas, allow network access from `0.0.0.0/0`.
3. Deploy. `/api/*` is served by `api/index.js`.

## How double-booking is prevented
`book()` does an atomic compare-and-set on the slot: `status: open -> booked`. Only one concurrent caller can win; the rest get `409 SLOT_TAKEN`. In MongoDB this is a single-document `findOneAndUpdate`. A partial unique index on `bookings.slotId` (where `status = confirmed`) is a second safety net. Cancelling a slot uses the same compare-and-set, so it cannot race a booking.

## Swapping the database
All rules are in `server/services/bookingService.js` and use only the repo contract documented at the top of `server/db/memoryRepo.js`. To use Postgres/SQLite/etc., write a repo with those 8 methods (the two `update*If` ones must be atomic, e.g. `UPDATE ... WHERE id=$1 AND status='open' RETURNING *`), register it in `server/db/index.js`, and set `DB_DRIVER`. The tests run against the same contract.

## API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/slots` | `clinicName, provider?, startsAt (ISO), durationMinutes?` |
| GET | `/api/slots` | `clinicName, status, from, to` |
| POST | `/api/slots/:id/cancel` | 409 if booked |
| POST | `/api/slots/:id/bookings` | `patientName, patientEmail, note?` |
| GET | `/api/bookings` | needs `patientEmail`, `clinicName` or `slotId` |
| POST | `/api/bookings/:id/cancel` | `patientEmail` must match |

Errors: `{ "error": { "code", "message", "details": [{ "field", "message" }] } }`

## Known limits
No login: clinics are identified by name and patients by email. Add auth before real patient data goes in.

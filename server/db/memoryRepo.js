/**
 * Storage contract (implement these 8 methods to add a new database):
 *   insertSlot(slot) -> slot            getSlot(id) -> slot|null
 *   findSlots({clinicName,status,from,to}) -> slot[]
 *   updateSlotIf(id, cond, patch) -> updated slot | null   <- MUST be atomic compare-and-set
 *   insertBooking(b) -> b               getBooking(id) -> b|null
 *   findBookings({patientEmail,clinicName,slotId}) -> b[]
 *   updateBookingIf(id, cond, patch) -> updated b | null   <- MUST be atomic compare-and-set
 * `cond` is an equality match on fields; `patch` is applied only if it matches.
 */
const matches = (doc, cond) => Object.entries(cond).every(([k, v]) => doc[k] === v);

export function createMemoryRepo() {
  const slots = new Map();
  const bookings = new Map();
  const clone = (o) => (o ? structuredClone(o) : null);
  // No `await` inside, so check-and-set cannot interleave with another call.
  const updateIf = (store) => async (id, cond, patch) => {
    const doc = store.get(id);
    if (!doc || !matches(doc, cond)) return null;
    Object.assign(doc, patch);
    return clone(doc);
  };

  return {
    async insertSlot(s) { slots.set(s.id, clone(s)); return clone(s); },
    async getSlot(id) { return clone(slots.get(id)); },
    async findSlots({ clinicName, status, from, to } = {}) {
      return [...slots.values()]
        .filter((s) => (!clinicName || s.clinicName === clinicName) && (!status || s.status === status)
          && (!from || s.startsAt >= from) && (!to || s.startsAt < to))
        .sort((a, b) => a.startsAt - b.startsAt).map(clone);
    },
    updateSlotIf: updateIf(slots),
    async insertBooking(b) { bookings.set(b.id, clone(b)); return clone(b); },
    async getBooking(id) { return clone(bookings.get(id)); },
    async findBookings({ patientEmail, clinicName, slotId } = {}) {
      return [...bookings.values()]
        .filter((b) => (!patientEmail || b.patientEmail === patientEmail) && (!clinicName || b.clinicName === clinicName) && (!slotId || b.slotId === slotId))
        .sort((a, b) => a.startsAt - b.startsAt).map(clone);
    },
    updateBookingIf: updateIf(bookings),
  };
}

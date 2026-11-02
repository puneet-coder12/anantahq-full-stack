import { randomUUID } from 'node:crypto';
import { AppError, notFound, conflict } from '../errors.js';
import { parse, createSlotSchema, bookSchema, cancelBookingSchema, listSlotsSchema, listBookingsSchema } from '../validation.js';

/**
 * All booking rules live here and talk to storage only through `repo`
 * (see server/db/memoryRepo.js for the contract). Concurrency safety comes from
 * repo.updateSlotIf(): an atomic compare-and-set. Whoever flips the slot
 * open -> booked wins; everyone else gets a 409.
 */
export function createBookingService(repo, now = () => new Date()) {
  const started = (iso) => new Date(iso) <= now();

  return {
    async createSlot(input) {
      const d = parse(createSlotSchema, input);
      const startsAt = new Date(d.startsAt);
      if (startsAt <= now()) throw new AppError(422, 'SLOT_IN_PAST', 'Slots must start in the future.');
      return repo.insertSlot({
        id: randomUUID(), clinicName: d.clinicName, provider: d.provider, startsAt,
        durationMinutes: d.durationMinutes, status: 'open', bookingId: null, createdAt: now(),
      });
    },

    async listSlots(query) {
      const q = parse(listSlotsSchema, query);
      return repo.findSlots({ ...q, from: q.from && new Date(q.from), to: q.to && new Date(q.to) });
    },

    async cancelSlot(id) {
      const cancelled = await repo.updateSlotIf(id, { status: 'open' }, { status: 'cancelled' });
      if (cancelled) return cancelled;
      const slot = await repo.getSlot(id);
      if (!slot) throw notFound('Slot');
      if (slot.status === 'booked') throw conflict('SLOT_BOOKED', 'This slot has a booking. Cancel the booking first.');
      throw conflict('ALREADY_CANCELLED', 'This slot is already cancelled.');
    },

    async book(slotId, input) {
      const d = parse(bookSchema, input);
      const slot = await repo.getSlot(slotId);
      if (!slot) throw notFound('Slot');
      if (started(slot.startsAt)) throw new AppError(422, 'SLOT_IN_PAST', 'This slot has already started.');

      const bookingId = randomUUID();
      // The atomic step: only one caller can move the slot from open to booked.
      const reserved = await repo.updateSlotIf(slotId, { status: 'open' }, { status: 'booked', bookingId });
      if (!reserved) {
        const cancelled = slot.status === 'cancelled';
        throw conflict(cancelled ? 'SLOT_CANCELLED' : 'SLOT_TAKEN',
          cancelled ? 'The clinic cancelled this slot.' : 'Someone else just booked this slot. Pick another time.');
      }
      try {
        return await repo.insertBooking({
          id: bookingId, slotId, clinicName: slot.clinicName, provider: slot.provider,
          startsAt: slot.startsAt, durationMinutes: slot.durationMinutes,
          patientName: d.patientName, patientEmail: d.patientEmail, note: d.note ?? null,
          status: 'confirmed', createdAt: now(), cancelledAt: null,
        });
      } catch (err) {
        await repo.updateSlotIf(slotId, { bookingId }, { status: 'open', bookingId: null }); // roll back
        throw err;
      }
    },

    async cancelBooking(id, input) {
      const d = parse(cancelBookingSchema, input);
      const booking = await repo.getBooking(id);
      // Same 404 for "wrong email" so booking ids can't be probed.
      if (!booking || booking.patientEmail !== d.patientEmail) throw notFound('Booking');
      if (booking.status === 'cancelled') throw conflict('ALREADY_CANCELLED', 'This booking is already cancelled.');
      if (started(booking.startsAt)) throw new AppError(422, 'SLOT_IN_PAST', 'This appointment has already started.');

      const cancelled = await repo.updateBookingIf(id, { status: 'confirmed' }, { status: 'cancelled', cancelledAt: now() });
      if (!cancelled) throw conflict('ALREADY_CANCELLED', 'This booking is already cancelled.');
      await repo.updateSlotIf(booking.slotId, { bookingId: id }, { status: 'open', bookingId: null });
      return cancelled;
    },

    async listBookings(query) {
      return repo.findBookings(parse(listBookingsSchema, query));
    },
  };
}

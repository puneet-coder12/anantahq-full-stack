import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo } from '../server/db/memoryRepo.js';
import { createBookingService } from '../server/services/bookingService.js';

const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const setup = () => createBookingService(createMemoryRepo());
const newSlot = (svc, over = {}) => svc.createSlot({ clinicName: 'Green Cross', provider: 'Dr. Rao', startsAt: inHours(24), durationMinutes: 30, ...over });
const patient = (n = 1) => ({ patientName: `Patient ${n}`, patientEmail: `p${n}@example.com` });
const rejects = (p, code) => assert.rejects(p, (e) => e.code === code);

test('books an open slot and marks it booked', async () => {
  const svc = setup();
  const slot = await newSlot(svc);
  const booking = await svc.book(slot.id, patient());
  assert.equal(booking.status, 'confirmed');
  const [after] = await svc.listSlots({});
  assert.equal(after.status, 'booked');
  assert.equal(after.bookingId, booking.id);
});

test('a second booking for the same slot is rejected', async () => {
  const svc = setup();
  const slot = await newSlot(svc);
  await svc.book(slot.id, patient(1));
  await rejects(svc.book(slot.id, patient(2)), 'SLOT_TAKEN');
});

test('simultaneous requests: exactly one booking wins', async () => {
  const svc = setup();
  const slot = await newSlot(svc);
  const results = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => svc.book(slot.id, patient(i))));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'SLOT_TAKEN'));
  assert.equal((await svc.listBookings({ slotId: slot.id })).length, 1);
});

test('cancel-slot racing with book never leaves a booking on a cancelled slot', async () => {
  for (let i = 0; i < 20; i++) {
    const svc = setup();
    const slot = await newSlot(svc);
    const [b, c] = await Promise.allSettled([svc.book(slot.id, patient()), svc.cancelSlot(slot.id)]);
    assert.notEqual(b.status === 'fulfilled', c.status === 'fulfilled', 'exactly one of them must win');
    const [after] = await svc.listSlots({});
    assert.equal(after.status, b.status === 'fulfilled' ? 'booked' : 'cancelled');
  }
});

test('cancelling a booking frees the slot for someone else', async () => {
  const svc = setup();
  const slot = await newSlot(svc);
  const b = await svc.book(slot.id, patient(1));
  await svc.cancelBooking(b.id, { patientEmail: 'p1@example.com' });
  assert.equal((await svc.listSlots({}))[0].status, 'open');
  await svc.book(slot.id, patient(2));
});

test('only the booking owner can cancel, and only once', async () => {
  const svc = setup();
  const slot = await newSlot(svc);
  const b = await svc.book(slot.id, patient(1));
  await rejects(svc.cancelBooking(b.id, { patientEmail: 'other@example.com' }), 'NOT_FOUND');
  await svc.cancelBooking(b.id, { patientEmail: 'p1@example.com' });
  await rejects(svc.cancelBooking(b.id, { patientEmail: 'p1@example.com' }), 'ALREADY_CANCELLED');
});

test('slot rules: no booked-slot cancel, no booking a cancelled slot, no past slots', async () => {
  const svc = setup();
  const booked = await newSlot(svc);
  await svc.book(booked.id, patient());
  await rejects(svc.cancelSlot(booked.id), 'SLOT_BOOKED');

  const open = await newSlot(svc, { startsAt: inHours(48) });
  await svc.cancelSlot(open.id);
  await rejects(svc.book(open.id, patient(2)), 'SLOT_CANCELLED');
  await rejects(svc.cancelSlot(open.id), 'ALREADY_CANCELLED');

  await rejects(newSlot(svc, { startsAt: inHours(-1) }), 'SLOT_IN_PAST');
  await rejects(svc.book('missing', patient()), 'NOT_FOUND');
});

test('validation errors list each bad field', async () => {
  const svc = setup();
  await assert.rejects(svc.createSlot({ clinicName: 'x', startsAt: 'tomorrow', durationMinutes: 1 }), (e) =>
    e.code === 'VALIDATION_ERROR' && ['clinicName', 'startsAt', 'durationMinutes'].every((f) => e.details.some((d) => d.field === f)));
  const slot = await newSlot(svc);
  await assert.rejects(svc.book(slot.id, { patientName: 'Asha', patientEmail: 'nope' }), (e) =>
    e.status === 400 && e.details[0].field === 'patientEmail');
});

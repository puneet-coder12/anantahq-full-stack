import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { createMemoryRepo } from '../server/db/memoryRepo.js';
import { createBookingService } from '../server/services/bookingService.js';

let server, base;
before(async () => {
  const svc = createBookingService(createMemoryRepo());
  server = createApp(() => svc).listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

const call = async (path, method = 'GET', body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

test('HTTP flow: publish, book, double-book gives 409, bad input gives 400', async () => {
  const bad = await call('/slots', 'POST', { clinicName: '' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');

  const slot = (await call('/slots', 'POST', { clinicName: 'Green Cross', startsAt: new Date(Date.now() + 864e5).toISOString() })).body;
  const who = { patientName: 'Asha', patientEmail: 'asha@example.com' };
  assert.equal((await call(`/slots/${slot.id}/bookings`, 'POST', who)).status, 201);
  const again = await call(`/slots/${slot.id}/bookings`, 'POST', who);
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'SLOT_TAKEN');
  assert.equal((await call('/bookings')).status, 400);
});

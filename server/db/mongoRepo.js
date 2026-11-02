import { MongoClient } from 'mongodb';
import { conflict } from '../errors.js';

const out = (d) => { if (!d) return null; const { _id, ...rest } = d; return { id: _id, ...rest }; };
const inn = (o) => { const { id, ...rest } = o; return { _id: id, ...rest }; };

export async function createMongoRepo(uri, dbName) {
  const client = await new MongoClient(uri).connect();
  const db = client.db(dbName);
  const slots = db.collection('slots');
  const bookings = db.collection('bookings');

  await Promise.all([
    slots.createIndex({ clinicName: 1, startsAt: 1 }),
    bookings.createIndex({ patientEmail: 1 }),
    bookings.createIndex({ clinicName: 1 }),
    // Second line of defence: the database itself refuses two confirmed bookings for one slot.
    bookings.createIndex({ slotId: 1 }, { unique: true, partialFilterExpression: { status: 'confirmed' } }),
  ]);

  // findOneAndUpdate on a single document is atomic in MongoDB.
  const updateIf = (col) => async (id, cond, patch) =>
    out(await col.findOneAndUpdate({ _id: id, ...cond }, { $set: patch }, { returnDocument: 'after' }));

  return {
    async insertSlot(s) { await slots.insertOne(inn(s)); return s; },
    async getSlot(id) { return out(await slots.findOne({ _id: id })); },
    async findSlots({ clinicName, status, from, to } = {}) {
      const q = {};
      if (clinicName) q.clinicName = clinicName;
      if (status) q.status = status;
      if (from || to) q.startsAt = { ...(from && { $gte: from }), ...(to && { $lt: to }) };
      return (await slots.find(q).sort({ startsAt: 1 }).toArray()).map(out);
    },
    updateSlotIf: updateIf(slots),
    async insertBooking(b) {
      try { await bookings.insertOne(inn(b)); } catch (e) {
        if (e.code === 11000) throw conflict('SLOT_TAKEN', 'Someone else just booked this slot. Pick another time.');
        throw e;
      }
      return b;
    },
    async getBooking(id) { return out(await bookings.findOne({ _id: id })); },
    async findBookings({ patientEmail, clinicName, slotId } = {}) {
      const q = {};
      if (patientEmail) q.patientEmail = patientEmail;
      if (clinicName) q.clinicName = clinicName;
      if (slotId) q.slotId = slotId;
      return (await bookings.find(q).sort({ startsAt: 1 }).toArray()).map(out);
    },
    updateBookingIf: updateIf(bookings),
  };
}

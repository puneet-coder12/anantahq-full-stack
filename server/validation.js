import { z } from 'zod';
import { AppError } from './errors.js';

const text = (label, min = 2, max = 80) =>
  z.string({ required_error: `${label} is required` }).trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);
const isoDate = (label) =>
  z.string({ required_error: `${label} is required` })
    .datetime({ offset: true, message: `${label} must be an ISO 8601 date-time, e.g. 2026-11-05T09:30:00Z` });
const email = z.string({ required_error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email address');

export const createSlotSchema = z.object({
  clinicName: text('Clinic name'),
  provider: text('Provider').default('General'),
  startsAt: isoDate('Start time'),
  durationMinutes: z.coerce.number().int('Duration must be a whole number').min(5, 'Duration must be at least 5 minutes').max(480, 'Duration must be at most 480 minutes').default(30),
});
export const bookSchema = z.object({
  patientName: text('Patient name'),
  patientEmail: email,
  note: z.string().trim().max(300, 'Note must be at most 300 characters').optional(),
});
export const cancelBookingSchema = z.object({ patientEmail: email });
export const listSlotsSchema = z.object({
  clinicName: z.string().trim().min(1).optional(),
  status: z.enum(['open', 'booked', 'cancelled'], { message: 'status must be open, booked or cancelled' }).optional(),
  from: isoDate('from').optional(),
  to: isoDate('to').optional(),
});
export const listBookingsSchema = z.object({
  patientEmail: email.optional(),
  clinicName: z.string().trim().min(1).optional(),
  slotId: z.string().min(1).optional(),
}).refine((q) => q.patientEmail || q.clinicName || q.slotId, {
  message: 'Provide patientEmail, clinicName or slotId',
});

export function parse(schema, input) {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.',
    r.error.issues.map((i) => ({ field: i.path.join('.') || 'request', message: i.message })));
}

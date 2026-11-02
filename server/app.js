import express from 'express';
import { AppError } from './errors.js';

export function createApp(getService) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  const route = (fn) => (req, res, next) =>
    Promise.resolve(getService()).then((svc) => fn(svc, req, res)).catch(next);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.post('/api/slots', route(async (s, req, res) => res.status(201).json(await s.createSlot(req.body))));
  app.get('/api/slots', route(async (s, req, res) => res.json(await s.listSlots(req.query))));
  app.post('/api/slots/:id/cancel', route(async (s, req, res) => res.json(await s.cancelSlot(req.params.id))));
  app.post('/api/slots/:id/bookings', route(async (s, req, res) => res.status(201).json(await s.book(req.params.id, req.body))));
  app.get('/api/bookings', route(async (s, req, res) => res.json(await s.listBookings(req.query))));
  app.post('/api/bookings/:id/cancel', route(async (s, req, res) => res.json(await s.cancelBooking(req.params.id, req.body))));

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Unknown endpoint.')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } });
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Try again.' } });
  });
  return app;
}

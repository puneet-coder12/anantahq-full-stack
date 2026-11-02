import { createBookingService } from '../services/bookingService.js';

// To switch databases: add a driver here that returns the repo contract
// (documented in memoryRepo.js) and set DB_DRIVER. Nothing else changes.
const drivers = {
  memory: async () => (await import('./memoryRepo.js')).createMemoryRepo(),
  mongo: async () => (await import('./mongoRepo.js')).createMongoRepo(
    process.env.MONGODB_URI, process.env.MONGODB_DB || 'clinic_booking'),
};

let cached; // reused across warm serverless invocations
export function getService() {
  if (!cached) {
    const name = process.env.DB_DRIVER || (process.env.MONGODB_URI ? 'mongo' : 'memory');
    if (!drivers[name]) throw new Error(`Unknown DB_DRIVER "${name}". Use: ${Object.keys(drivers).join(', ')}`);
    cached = drivers[name]().then(createBookingService).catch((e) => { cached = undefined; throw e; });
  }
  return cached;
}

// Vercel serverless entry. vercel.json rewrites /api/* here; Express does the routing.
import { createApp } from '../server/app.js';
import { getService } from '../server/db/index.js';

export default createApp(getService);

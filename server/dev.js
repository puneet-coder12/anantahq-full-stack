import 'dotenv/config';
import { createApp } from './app.js';
import { getService } from './db/index.js';

const port = process.env.PORT || 3001;
createApp(getService).listen(port, () => console.log(`API on http://localhost:${port}`));

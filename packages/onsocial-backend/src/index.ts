import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { storageRouter } from './services/storage/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors()); // Open CORS - rate limiting provides protection
app.use(express.json());

// Trust proxy (Fly.io, etc.)
app.set('trust proxy', 1);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.use('/storage', storageRouter);

app.listen(PORT, () => console.log(`onsocial-backend :${PORT}`));

export default app;

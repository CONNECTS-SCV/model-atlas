import { pool } from '../src/lib/db';
import { seedDocumentQueue, enrichDocuments } from '../src/lib/documents';
await seedDocumentQueue();
await enrichDocuments(2400);
console.log('공식 논문·가중치 보완 완료');await pool.end();

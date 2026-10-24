import mongoose from 'mongoose';
import { bootstrap } from '../bootstrap.js';
import { resetDemo, seedDemo } from '../services/demo.js';

// Usage: npm run seed:demo            -> recreate demo data
//        npm run seed:demo -- --reset  -> remove demo data only
const ctx = await bootstrap();
if (process.argv.includes('--reset')) console.log('Removed demo records:', await resetDemo());
else console.log('Seeded demo data (all records flagged isDemo):', await seedDemo(ctx));
await mongoose.disconnect();

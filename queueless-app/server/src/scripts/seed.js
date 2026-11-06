import { seedPilotData } from './seed-pilot.js';
import { connectDB, disconnectDB } from '../config/database.js';

(async () => {
  try {
    await connectDB();
    const res = await seedPilotData();
    console.log('\n================ SEED COMPLETE ================');
    console.log(JSON.stringify(res, null, 2));
    console.log('===============================================\n');
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    await disconnectDB().catch(() => {});
    process.exit(1);
  }
})();


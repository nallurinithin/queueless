import mongoose from 'mongoose';
import { QueueEntry } from '../src/models/QueueEntry.js';
import { Appointment } from '../src/models/Appointment.js';
import { Clinic } from '../src/models/Clinic.js';
import { QueueSequenceCounter } from '../src/models/QueueSequenceCounter.js';

async function analyzeDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/queueless_test';
  await mongoose.connect(uri);
  console.log('Connected to:', mongoose.connection.name);

  console.log('\n=== INDEX ANALYSIS ===');
  const collections = ['queueentries', 'appointments', 'queuesequencecounters', 'clinics'];
  for (const collName of collections) {
    const indexes = await mongoose.connection.db.collection(collName).indexes();
    console.log(`\nCollection [${collName}] indexes:`);
    for (const idx of indexes) {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} (unique: ${!!idx.unique})`);
    }
  }

  console.log('\n=== QUERY EXPLAIN PLANS ===');
  // 1. Queue Display Query (Aggregating active queue for today)
  const today = '2026-11-07';
  const displayExplain = await QueueEntry.find({
    queueDate: today,
    queueStatus: { $in: ['CALLED', 'SERVING'] },
  }).explain('executionStats');
  console.log('\n1. Queue Display Query (CALLED/SERVING):');
  console.log('  Stage:', displayExplain.executionStats.executionStages.stage);
  console.log('  Total Docs Examined:', displayExplain.executionStats.totalDocsExamined);
  console.log('  Total Keys Examined:', displayExplain.executionStats.totalKeysExamined);
  console.log('  Execution Time (ms):', displayExplain.executionStats.executionTimeMillis);

  // 2. Doctor Queue Query
  const doctorId = new mongoose.Types.ObjectId('6aeeec247cec8b5d06d01be5');
  const doctorQueueExplain = await QueueEntry.find({
    doctorId,
    queueDate: today,
    queueStatus: { $in: ['WAITING', 'CALLED', 'SERVING'] },
  }).sort({ tokenSequence: 1 }).explain('executionStats');
  console.log('\n2. Doctor Queue Query:');
  console.log('  Stage:', doctorQueueExplain.executionStats.executionStages.stage);
  console.log('  Total Docs Examined:', doctorQueueExplain.executionStats.totalDocsExamined);
  console.log('  Total Keys Examined:', doctorQueueExplain.executionStats.totalKeysExamined);
  console.log('  Execution Time (ms):', doctorQueueExplain.executionStats.executionTimeMillis);

  // 3. Appointment Check-in Lookup
  const apptExplain = await Appointment.find({
    bookingReference: 'CHK-LOAD-0001',
  }).explain('executionStats');
  console.log('\n3. Appointment Lookup Query:');
  console.log('  Stage:', apptExplain.executionStats.executionStages.stage);
  console.log('  Total Docs Examined:', apptExplain.executionStats.totalDocsExamined);
  console.log('  Total Keys Examined:', apptExplain.executionStats.totalKeysExamined);
  console.log('  Execution Time (ms):', apptExplain.executionStats.executionTimeMillis);

  await mongoose.disconnect();
}

analyzeDatabase().catch(console.error);


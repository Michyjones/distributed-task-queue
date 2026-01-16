
const { DistributedQueue, Worker } = require('../src');
const metrics = require('../src/utils/metrics');

async function benchmark() {
  console.log('🚀 Starting Distributed Task Queue Benchmark\n');
  console.log('Target: 100,000+ jobs/hour\n');
  console.log('='.repeat(60));

  const queue = new DistributedQueue({
    name: 'benchmark-queue',
    maxRetries: 2,
    jobTimeout: 60000,
    cleanupInterval: 30000
  });

  const TOTAL_JOBS = 10000; // 10K jobs for benchmark
  const WORKER_COUNT = 20;  // 20 concurrent workers
  const JOB_DURATION = 100; // 100ms per job (simulated work)

  // Track metrics
  let completed = 0;
  let failed = 0;
  const startTime = Date.now();

  // Event listeners
  queue.on('job:completed', () => {
    completed++;
    if (completed % 1000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = Math.round((completed / elapsed) * 3600);
      console.log(`✅ Completed: ${completed}/${TOTAL_JOBS} | Rate: ${rate.toLocaleString()} jobs/hour`);
    }
  });

  queue.on('job:failed', () => {
    failed++;
  });

  // Add jobs with various priorities
  console.log(`\n📝 Adding ${TOTAL_JOBS.toLocaleString()} jobs...`);
  const addStart = Date.now();
  
  const addPromises = [];
  for (let i = 0; i < TOTAL_JOBS; i++) {
    const priority = i % 100 === 0 ? 10 : 0; // 1% high priority
    addPromises.push(
      queue.addJob({
        id: i,
        task: 'process-data',
        data: `item-${i}`
      }, { priority })
    );

    // Batch commits every 100 jobs
    if (i > 0 && i % 100 === 0) {
      await Promise.all(addPromises);
      addPromises.length = 0;
    }
  }
  
  if (addPromises.length > 0) {
    await Promise.all(addPromises);
  }

  const addDuration = Date.now() - addStart;
  console.log(`✓ Jobs added in ${addDuration}ms (${Math.round(TOTAL_JOBS / addDuration)} jobs/ms)`);

  // Create worker pool
  console.log(`\n👷 Starting ${WORKER_COUNT} workers...\n`);
  const workers = [];
  
  for (let i = 0; i < WORKER_COUNT; i++) {
    const worker = new Worker(queue, async (data) => {
      // Simulate work (database query, API call, etc.)
      await new Promise(resolve => setTimeout(resolve, JOB_DURATION));
      
      // Simulate occasional failures (1%)
      if (Math.random() < 0.01) {
        throw new Error('Random failure for testing retry logic');
      }
      
      return { processed: true, timestamp: Date.now() };
    }, i);
    
    workers.push(worker);
    worker.start();
  }

  console.log('='.repeat(60));
  console.log('Processing jobs...\n');

  // Monitor progress
  const statsInterval = setInterval(async () => {
    const stats = await queue.getStats();
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round((completed / elapsed) * 3600);
    const eta = stats.pending > 0 ? Math.round((stats.pending / (completed / elapsed))) : 0;

    console.log(`📊 Stats:
   Pending:     ${stats.pending.toString().padStart(6)}
   Processing:  ${stats.processing.toString().padStart(6)}
   Completed:   ${completed.toString().padStart(6)} / ${TOTAL_JOBS}
   Failed:      ${failed.toString().padStart(6)}
   Rate:        ${rate.toLocaleString().padStart(10)} jobs/hour
   ETA:         ${eta}s
`);

    // Check if done
    if (completed + failed >= TOTAL_JOBS) {
      clearInterval(statsInterval);
      await displayFinalResults();
    }
  }, 5000);

  async function displayFinalResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📈 BENCHMARK RESULTS');
    console.log('='.repeat(60));

    const totalTime = (Date.now() - startTime) / 1000;
    const jobsPerSecond = completed / totalTime;
    const jobsPerHour = Math.round(jobsPerSecond * 3600);
    const avgJobTime = (totalTime * 1000) / completed;
    const successRate = ((completed / TOTAL_JOBS) * 100).toFixed(2);

    console.log(`
Total Jobs:           ${TOTAL_JOBS.toLocaleString()}
Completed:            ${completed.toLocaleString()}
Failed:               ${failed.toLocaleString()}
Success Rate:         ${successRate}%

Total Time:           ${totalTime.toFixed(2)}s
Jobs/Second:          ${jobsPerSecond.toFixed(2)}
Jobs/Hour:            ${jobsPerHour.toLocaleString()}

Avg Job Time:         ${avgJobTime.toFixed(2)}ms
Worker Count:         ${WORKER_COUNT}
Concurrency:          ${WORKER_COUNT} concurrent workers

Target Achievement:   ${jobsPerHour >= 100000 ? '✅ PASSED' : '⚠️  Below target'}
`);

    console.log('='.repeat(60));

    // Get final stats
    const finalStats = await queue.getStats();
    console.log('\n📊 Final Queue Statistics:');
    console.log(`   Total:      ${finalStats.total}`);
    console.log(`   Completed:  ${finalStats.completed}`);
    console.log(`   Failed:     ${finalStats.failed}`);
    console.log(`   Pending:    ${finalStats.pending}`);
    console.log(`   Processing: ${finalStats.processing}`);
    console.log(`   Delayed:    ${finalStats.delayed}`);

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    workers.forEach(w => w.stop());
    await new Promise(resolve => setTimeout(resolve, 2000));
    await queue.close();
    
    console.log('\n✨ Benchmark complete!\n');
    process.exit(0);
  }
}

// Run benchmark
benchmark().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
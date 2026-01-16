const { DistributedQueue, Worker } = require('../src');

async function main() {
  // Create queue
  const queue = new DistributedQueue({
    name: 'demo-queue',
    maxRetries: 3
  });

  // Add some jobs
  console.log('Adding jobs...');
  for (let i = 0; i < 10; i++) {
    await queue.addJob({ 
      task: 'process-data', 
      value: i 
    }, {
      priority: i % 3 === 0 ? 10 : 0
    });
  }

  // Create workers
  console.log('Starting workers...');
  const workers = [];
  for (let i = 0; i < 3; i++) {
    const worker = new Worker(queue, async (data) => {
      console.log(`Processing: ${data.task} with value ${data.value}`);
      await new Promise(r => setTimeout(r, 1000));
      return { processed: true, value: data.value * 2 };
    }, i);
    
    workers.push(worker);
    worker.start();
  }

  // Show stats
  setInterval(async () => {
    const stats = await queue.getStats();
    console.log('Stats:', stats);
    
    if (stats.completed === 10) {
      console.log('All jobs completed!');
      workers.forEach(w => w.stop());
      await queue.close();
      process.exit(0);
    }
  }, 2000);
}

main().catch(console.error);
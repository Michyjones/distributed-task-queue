
const { DistributedQueue, Worker } = require('../src');

// Simulated email service
class EmailService {
  constructor() {
    this.sentEmails = [];
    this.failureRate = 0.1; // 10% failure rate for testing
  }

  async send(email) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    // Simulate occasional failures
    if (Math.random() < this.failureRate) {
      throw new Error('Email service temporarily unavailable');
    }

    this.sentEmails.push({
      ...email,
      sentAt: new Date().toISOString()
    });

    return {
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'sent'
    };
  }

  getStats() {
    return {
      totalSent: this.sentEmails.length,
      lastSent: this.sentEmails[this.sentEmails.length - 1]
    };
  }
}

async function main() {
  console.log('📧 Email Queue System Demo\n');
  console.log('This example demonstrates:');
  console.log('  - Priority email handling (VIP users)');
  console.log('  - Automatic retry with exponential backoff');
  console.log('  - Scheduled/delayed emails');
  console.log('  - Fault tolerance\n');
  console.log('='.repeat(60));

  // Initialize services
  const emailService = new EmailService();
  const queue = new DistributedQueue({
    name: 'email-queue',
    maxRetries: 3,
    retryDelay: 2000,      // Start with 2s delay
    retryBackoff: 2,       // Double delay each retry
    jobTimeout: 15000      // 15s timeout
  });

  // Track statistics
  let stats = {
    sent: 0,
    failed: 0,
    retried: 0
  };

  // Event listeners
  queue.on('job:added', (job) => {
    console.log(`\n📬 Job queued: ${job.id}`);
    console.log(`   To: ${job.data.to}`);
    console.log(`   Priority: ${job.priority || 0}`);
  });

  queue.on('job:completed', (job) => {
    stats.sent++;
    console.log(`\n✅ Email sent: ${job.id}`);
    console.log(`   To: ${job.data.to}`);
    console.log(`   Subject: ${job.data.subject}`);
    console.log(`   Attempts: ${job.attempts + 1}`);
  });

  queue.on('job:failed', (job) => {
    stats.failed++;
    console.log(`\n❌ Email failed permanently: ${job.id}`);
    console.log(`   To: ${job.data.to}`);
    console.log(`   Error: ${job.lastError}`);
    console.log(`   Total attempts: ${job.attempts}`);
  });

  queue.on('job:retry', (job) => {
    stats.retried++;
    const nextAttemptIn = Math.round((job.attempts ** 2) * 2); // Exponential backoff calculation
    console.log(`\n🔄 Email retry scheduled: ${job.id}`);
    console.log(`   Attempt: ${job.attempts}/${job.maxRetries}`);
    console.log(`   Next attempt in: ~${nextAttemptIn}s`);
  });

  // Sample email data
  const emails = [
    {
      to: 'john@example.com',
      subject: 'Welcome to our service!',
      body: 'Thank you for signing up...',
      priority: 0
    },
    {
      to: 'vip@example.com',
      subject: 'Exclusive VIP Offer',
      body: 'As a VIP member...',
      priority: 10 // High priority
    },
    {
      to: 'jane@example.com',
      subject: 'Password Reset Request',
      body: 'Click here to reset...',
      priority: 5
    },
    {
      to: 'scheduled@example.com',
      subject: 'Weekly Newsletter',
      body: 'Here are this week\'s updates...',
      delay: 10000 // Delayed by 10 seconds
    }
  ];

  // Add regular emails
  console.log('\n\n📝 Adding emails to queue...\n');
  
  for (const email of emails) {
    const options = {};
    if (email.priority) options.priority = email.priority;
    if (email.delay) options.delay = email.delay;
    
    await queue.addJob(email, options);
  }

  // Add batch of regular priority emails
  console.log('\n📦 Adding batch of 20 regular emails...\n');
  for (let i = 1; i <= 20; i++) {
    await queue.addJob({
      to: `user${i}@example.com`,
      subject: `Update Notification ${i}`,
      body: 'You have new updates...'
    });
  }

  // Create worker pool
  console.log('\n👷 Starting 5 email workers...\n');
  console.log('='.repeat(60));

  const workers = [];
  for (let i = 0; i < 5; i++) {
    const worker = new Worker(queue, async (emailData) => {
      // Process email
      console.log(`\n⚙️  Worker ${i} processing: ${emailData.to}`);
      
      try {
        const result = await emailService.send(emailData);
        return result;
      } catch (error) {
        console.log(`⚠️  Worker ${i} encountered error: ${error.message}`);
        throw error; // Will trigger retry logic
      }
    }, i);

    worker.on('started', (id) => {
      console.log(`   Worker ${id} ready`);
    });

    workers.push(worker);
    worker.start();
  }

  // Display real-time statistics
  const statsInterval = setInterval(async () => {
    const queueStats = await queue.getStats();
    const emailStats = emailService.getStats();

    console.log('\n' + '='.repeat(60));
    console.log('📊 REAL-TIME STATISTICS');
    console.log('='.repeat(60));
    console.log('\nQueue Status:');
    console.log(`   Pending:     ${queueStats.pending}`);
    console.log(`   Processing:  ${queueStats.processing}`);
    console.log(`   Delayed:     ${queueStats.delayed}`);
    console.log(`   Completed:   ${queueStats.completed}`);
    console.log(`   Failed:      ${queueStats.failed}`);
    
    console.log('\nEmail Service:');
    console.log(`   Sent:        ${stats.sent}`);
    console.log(`   Failed:      ${stats.failed}`);
    console.log(`   Retried:     ${stats.retried}`);
    console.log(`   Success Rate: ${((stats.sent / (stats.sent + stats.failed)) * 100 || 0).toFixed(1)}%`);
    console.log('='.repeat(60));

    // Check if all done
    if (queueStats.pending === 0 && queueStats.processing === 0 && queueStats.delayed === 0) {
      console.log('\n✨ All emails processed!\n');
      
      // Final summary
      console.log('📈 FINAL SUMMARY:');
      console.log(`   Total Emails: ${queueStats.total}`);
      console.log(`   Successfully Sent: ${stats.sent}`);
      console.log(`   Permanently Failed: ${stats.failed}`);
      console.log(`   Total Retry Attempts: ${stats.retried}`);
      console.log(`   Success Rate: ${((stats.sent / queueStats.total) * 100).toFixed(1)}%`);
      
      // Cleanup
      clearInterval(statsInterval);
      console.log('\n🧹 Shutting down workers...');
      workers.forEach(w => w.stop());
      
      setTimeout(async () => {
        await queue.close();
        console.log('✅ Email queue system shut down gracefully\n');
        process.exit(0);
      }, 2000);
    }
  }, 5000);

  // Graceful shutdown handler
  process.on('SIGTERM', async () => {
    console.log('\n\n⚠️  Received SIGTERM signal...');
    console.log('🛑 Initiating graceful shutdown...');
    
    clearInterval(statsInterval);
    workers.forEach(w => w.stop());
    
    setTimeout(async () => {
      await queue.close();
      console.log('✅ Shutdown complete\n');
      process.exit(0);
    }, 5000);
  });

  process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Received SIGINT signal (Ctrl+C)...');
    console.log('🛑 Initiating graceful shutdown...');
    
    clearInterval(statsInterval);
    workers.forEach(w => w.stop());
    
    setTimeout(async () => {
      await queue.close();
      console.log('✅ Shutdown complete\n');
      process.exit(0);
    }, 2000);
  });
}

// Run the email queue
main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
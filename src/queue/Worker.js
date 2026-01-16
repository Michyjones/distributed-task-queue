const EventEmitter = require('events');
const logger = require('../utils/logger');

class Worker extends EventEmitter {
  constructor(queue, processorFn, workerId) {
    super();
    this.queue = queue;
    this.processorFn = processorFn;
    this.workerId = workerId;
    this.isRunning = false;
    this.currentJob = null;
    this.processedCount = 0;
  }

  async start() {
    this.isRunning = true;
    this.emit('started', this.workerId);
    logger.info(`Worker ${this.workerId} started`);
    this._processLoop();
  }

  async stop() {
    this.isRunning = false;
    this.emit('stopped', this.workerId);
    logger.info(`Worker ${this.workerId} stopped (processed ${this.processedCount} jobs)`);
  }

  async _processLoop() {
    while (this.isRunning) {
      try {
        const job = await this.queue.getNextJob();
        
        if (!job) {
          await this._sleep(1000);
          continue;
        }
        
        this.currentJob = job;
        this.emit('job:started', job);
        
        try {
          const result = await this.processorFn(job.data);
          await this.queue.completeJob(job.id, result);
          this.processedCount++;
          this.emit('job:completed', job);
        } catch (error) {
          await this.queue.failJob(job.id, error);
          this.emit('job:failed', { job, error });
        }
        
        this.currentJob = null;
        
      } catch (error) {
        this.emit('error', error);
        logger.error(`Worker ${this.workerId} error:`, error);
        await this._sleep(1000);
      }
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Worker;
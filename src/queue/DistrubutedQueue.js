const Redis = require('ioredis');
const EventEmitter = require('events');
const logger = require('../utils/logger');

class DistributedQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.name = options.name || 'default';
    this.redis = options.redis || new Redis({
      host: options.redisHost || 'localhost',
      port: options.redisPort || 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });
    
    this.config = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      retryBackoff: options.retryBackoff || 2,
      jobTimeout: options.jobTimeout || 30000,
      cleanupInterval: options.cleanupInterval || 60000,
      maxConcurrency: options.maxConcurrency || 10
    };
    
    this.keys = {
      pending: `queue:${this.name}:pending`,
      processing: `queue:${this.name}:processing`,
      completed: `queue:${this.name}:completed`,
      failed: `queue:${this.name}:failed`,
      delayed: `queue:${this.name}:delayed`,
      priority: `queue:${this.name}:priority`,
      jobs: `queue:${this.name}:jobs`,
      stats: `queue:${this.name}:stats`
    };
    
    this._startCleanup();
    logger.info(`Queue "${this.name}" initialized`);
  }

  async addJob(data, options = {}) {
    const jobId = options.jobId || this._generateJobId();
    const priority = options.priority || 0;
    const delay = options.delay || 0;
    
    const job = {
      id: jobId,
      data,
      priority,
      attempts: 0,
      maxRetries: options.maxRetries || this.config.maxRetries,
      createdAt: Date.now(),
      status: 'pending'
    };
    
    await this.redis.hset(this.keys.jobs, jobId, JSON.stringify(job));
    
    if (delay > 0) {
      const executeAt = Date.now() + delay;
      await this.redis.zadd(this.keys.delayed, executeAt, jobId);
    } else if (priority > 0) {
      await this.redis.zadd(this.keys.priority, -priority, jobId);
    } else {
      await this.redis.rpush(this.keys.pending, jobId);
    }
    
    await this.redis.hincrby(this.keys.stats, 'total', 1);
    await this.redis.hincrby(this.keys.stats, 'pending', 1);
    
    this.emit('job:added', job);
    logger.debug(`Job added: ${jobId}`);
    return jobId;
  }

  async getNextJob() {
    const priorityJob = await this.redis.eval(
      `local jobId = redis.call('zpopmin', KEYS[1], 1)
       if #jobId > 0 then
         redis.call('hset', KEYS[2], jobId[1], ARGV[1])
         return jobId[1]
       end
       return nil`,
      2,
      this.keys.priority,
      this.keys.processing,
      Date.now()
    );
    
    if (priorityJob) {
      return await this._getJobData(priorityJob);
    }
    
    const jobId = await this.redis.eval(
      `local jobId = redis.call('lpop', KEYS[1])
       if jobId then
         redis.call('hset', KEYS[2], jobId, ARGV[1])
         return jobId
       end
       return nil`,
      2,
      this.keys.pending,
      this.keys.processing,
      Date.now()
    );
    
    if (jobId) {
      await this.redis.hincrby(this.keys.stats, 'pending', -1);
      await this.redis.hincrby(this.keys.stats, 'processing', 1);
      return await this._getJobData(jobId);
    }
    
    return null;
  }

  async completeJob(jobId, result) {
    const job = await this._getJobData(jobId);
    if (!job) return false;
    
    job.status = 'completed';
    job.completedAt = Date.now();
    job.result = result;
    
    await this.redis.hset(this.keys.jobs, jobId, JSON.stringify(job));
    await this.redis.hdel(this.keys.processing, jobId);
    await this.redis.rpush(this.keys.completed, jobId);
    
    await this.redis.hincrby(this.keys.stats, 'processing', -1);
    await this.redis.hincrby(this.keys.stats, 'completed', 1);
    
    this.emit('job:completed', job);
    logger.debug(`Job completed: ${jobId}`);
    return true;
  }

  async failJob(jobId, error) {
    const job = await this._getJobData(jobId);
    if (!job) return false;
    
    job.attempts++;
    job.lastError = error.message || String(error);
    job.failedAt = Date.now();
    
    if (job.attempts < job.maxRetries) {
      return await this._retryJob(job);
    }
    
    job.status = 'failed';
    await this.redis.hset(this.keys.jobs, jobId, JSON.stringify(job));
    await this.redis.hdel(this.keys.processing, jobId);
    await this.redis.rpush(this.keys.failed, jobId);
    
    await this.redis.hincrby(this.keys.stats, 'processing', -1);
    await this.redis.hincrby(this.keys.stats, 'failed', 1);
    
    this.emit('job:failed', job);
    logger.warn(`Job failed permanently: ${jobId}`);
    return false;
  }

  async _retryJob(job) {
    const delay = this.config.retryDelay * Math.pow(this.config.retryBackoff, job.attempts);
    const executeAt = Date.now() + delay;
    
    job.status = 'retrying';
    await this.redis.hset(this.keys.jobs, job.id, JSON.stringify(job));
    await this.redis.hdel(this.keys.processing, job.id);
    await this.redis.zadd(this.keys.delayed, executeAt, job.id);
    
    await this.redis.hincrby(this.keys.stats, 'processing', -1);
    
    this.emit('job:retry', job);
    logger.info(`Job retry scheduled: ${job.id} (attempt ${job.attempts})`);
    return true;
  }

  async processDelayedJobs() {
    const now = Date.now();
    const jobs = await this.redis.zrangebyscore(this.keys.delayed, 0, now);
    
    for (const jobId of jobs) {
      const job = await this._getJobData(jobId);
      if (!job) continue;
      
      await this.redis.zrem(this.keys.delayed, jobId);
      
      if (job.priority > 0) {
        await this.redis.zadd(this.keys.priority, -job.priority, jobId);
      } else {
        await this.redis.rpush(this.keys.pending, jobId);
      }
      
      await this.redis.hincrby(this.keys.stats, 'pending', 1);
    }
    
    return jobs.length;
  }

  async checkStalledJobs() {
    const processingJobs = await this.redis.hgetall(this.keys.processing);
    const now = Date.now();
    let recovered = 0;
    
    for (const [jobId, startTime] of Object.entries(processingJobs)) {
      const elapsed = now - parseInt(startTime);
      
      if (elapsed > this.config.jobTimeout) {
        const job = await this._getJobData(jobId);
        if (job) {
          await this.failJob(jobId, new Error('Job timeout - stalled'));
          recovered++;
        }
      }
    }
    
    if (recovered > 0) {
      this.emit('jobs:recovered', recovered);
      logger.warn(`Recovered ${recovered} stalled jobs`);
    }
    
    return recovered;
  }

  async getStats() {
    const stats = await this.redis.hgetall(this.keys.stats);
    const pendingCount = await this.redis.llen(this.keys.pending);
    const processingCount = await this.redis.hlen(this.keys.processing);
    const delayedCount = await this.redis.zcard(this.keys.delayed);
    const priorityCount = await this.redis.zcard(this.keys.priority);
    
    return {
      total: parseInt(stats.total) || 0,
      pending: pendingCount + priorityCount,
      processing: processingCount,
      delayed: delayedCount,
      completed: parseInt(stats.completed) || 0,
      failed: parseInt(stats.failed) || 0
    };
  }

  async _getJobData(jobId) {
    const data = await this.redis.hget(this.keys.jobs, jobId);
    return data ? JSON.parse(data) : null;
  }

  _generateJobId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  _startCleanup() {
    this.cleanupInterval = setInterval(async () => {
      await this.processDelayedJobs();
      await this.checkStalledJobs();
    }, this.config.cleanupInterval);
  }

  async close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    await this.redis.quit();
    logger.info(`Queue "${this.name}" closed`);
  }
}

module.exports = DistributedQueue;
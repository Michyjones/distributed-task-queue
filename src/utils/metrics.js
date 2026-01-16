class Metrics {
  constructor() {
    this.metrics = {
      jobsProcessed: 0,
      jobsFailed: 0,
      totalProcessingTime: 0,
      startTime: Date.now()
    };
  }

  recordJobCompleted(processingTime) {
    this.metrics.jobsProcessed++;
    this.metrics.totalProcessingTime += processingTime;
  }

  recordJobFailed() {
    this.metrics.jobsFailed++;
  }

  getMetrics() {
    const uptime = Date.now() - this.metrics.startTime;
    const avgProcessingTime = this.metrics.jobsProcessed > 0
      ? this.metrics.totalProcessingTime / this.metrics.jobsProcessed
      : 0;
    
    const throughput = (this.metrics.jobsProcessed / uptime) * 1000 * 60 * 60; // jobs/hour

    return {
      jobsProcessed: this.metrics.jobsProcessed,
      jobsFailed: this.metrics.jobsFailed,
      avgProcessingTime: Math.round(avgProcessingTime),
      throughput: Math.round(throughput),
      uptime: Math.round(uptime / 1000)
    };
  }

  reset() {
    this.metrics = {
      jobsProcessed: 0,
      jobsFailed: 0,
      totalProcessingTime: 0,
      startTime: Date.now()
    };
  }
}

module.exports = new Metrics();
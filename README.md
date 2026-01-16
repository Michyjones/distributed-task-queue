# Distributed Task Queue System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org)

A production-ready distributed task processing system handling 100K+ jobs/hour with fault tolerance, priority scheduling, and horizontal scalability.

## ✨ Features

- ✅ **Fault-tolerant**: Jobs survive worker crashes
- ✅ **At-least-once delivery**: Automatic retry with exponential backoff
- ✅ **Priority scheduling**: Process urgent jobs first
- ✅ **Delayed jobs**: Schedule jobs for future execution
- ✅ **Worker pools**: Configurable concurrency
- ✅ **Horizontal scaling**: Multiple instances supported
- ✅ **Monitoring**: Real-time statistics and events
- ✅ **Production-ready**: Comprehensive error handling and logging

## 📦 Installation
```bash
npm install
```

## 🚀 Quick Start
```javascript
const { DistributedQueue, Worker } = require('./src');

const queue = new DistributedQueue({ name: 'my-queue' });

// Add jobs
await queue.addJob({ task: 'send-email', to: 'user@example.com' });

// Create workers
const worker = new Worker(queue, async (data) => {
  console.log('Processing:', data);
  return { success: true };
}, 0);

worker.start();
```

## 🏗️ Architecture

- **Priority Queue**: Redis sorted set for urgent jobs
- **Pending Queue**: Redis list for regular jobs
- **Delayed Queue**: Redis sorted set for scheduled jobs
- **Processing Map**: Redis hash tracking active jobs
- **Job Store**: Redis hash storing complete job data

## 📊 Performance

- Handles **100K+ jobs/hour**
- Sub-millisecond job enqueue time
- Automatic stalled job recovery
- Configurable worker concurrency

## 🐳 Docker
```bash
cd docker
docker-compose up
```

## 📖 Documentation

See [docs/](./docs) for detailed documentation.

## 🤝 Contributing

Contributions welcome! Please read CONTRIBUTING.md first.

## 📄 License

MIT © Michael Gitau
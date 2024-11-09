const EventEmitter = require('events')

const makeMethod = (key) => {
  // Not an arrow as Worker is a class and can be called with new
  return function () {
    throw new Error(`cluster.${key} unsupported in bundled mode`)
  }
}

const cluster = new EventEmitter()

Object.assign(cluster, {
  isWorker: false,
  isPrimary: true,
  workers: {},
  settings: {},
  SCHED_NONE: 1,
  SCHED_RR: 2,
  schedulingPolicy: 2,
})

for (const key of ['Worker', 'setupPrimary', 'fork', 'disconnect']) cluster[key] = makeMethod(key)

cluster.isMaster = cluster.isPrimary
cluster.setupMaster = cluster.setupPrimary

module.exports = cluster

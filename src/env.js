const truthy = new Set(['true', '1', 'yes', 'y', 'on'])

export function isTruthy(envVar) {
  return truthy.has(envVar)
}

const fRps = (rps) => (rps > 10 ? Math.round(rps).toLocaleString() : rps.toPrecision(2))
const fTime = (ns) => {
  const us = ns / 10n ** 3n
  if (us < 2n) return `${ns}ns`
  const ms = us / 10n ** 3n
  if (ms < 2n) return `${us}μs`
  const s = ms / 10n ** 3n
  if (s < 10n) return `${ms}ms`
  const min = s / 60n
  return min < 5n ? `${s}s` : `${min}min`
}

const { performance, scheduler, process, requestAnimationFrame, gc } = globalThis
const getTime = (() => {
  if (process) return () => process.hrtime.bigint()
  if (performance) return () => BigInt(Math.round(performance.now() * 1e6))
  return () => BigInt(Math.round(Date.now() * 1e6))
})()

let gcWarned = false
export async function benchmark(name, options, fn) {
  if (typeof options === 'function') [fn, options] = [options, undefined]
  if (options?.skip) return
  const { args, timeout = 1000 } = options ?? {}

  // This will pause us for a bit, but we don't care - having a non-busy process is more important
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (requestAnimationFrame) await new Promise((resolve) => requestAnimationFrame(resolve))
  if (scheduler?.yield) await scheduler.yield()

  if (gc) for (let i = 0; i < 4; i++) gc()
  if (!gc && !gcWarned) {
    gcWarned = true
    console.log('Warning: no gc() available\n')
  }

  let min, max
  let total = 0n
  let count = 0
  while (true) {
    const arg = args ? args[count % args.length] : count
    count++
    const start = getTime()
    const val = fn(arg)
    if (val instanceof Promise) await val
    const stop = getTime()
    const diff = stop - start
    total += diff
    if (min === undefined || min > diff) min = diff
    if (max === undefined || max < diff) max = diff
    if (total >= BigInt(timeout) * 10n ** 6n) break
  }

  const mean = total / BigInt(count)
  let res = `${name} x ${fRps(1e9 / Number(mean))} ops/sec @ ${fTime(mean)}/op`
  if (fTime(min) !== fTime(max)) res += ` (${fTime(min)}..${fTime(max)})`
  console.log(res)

  if (gc) for (let i = 0; i < 4; i++) gc()
}

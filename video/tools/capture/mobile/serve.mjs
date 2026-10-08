// Keep one of the two apps up while iterating.
//
//   node tools/capture/mobile/serve.mjs student|academy [--port N]
//
// Stop it with Ctrl-C, or by the pid that http://127.0.0.1:<N>/__harness reports.

import { DEFAULT_PORT, VARIANTS } from './paths.mjs'
import { startServer } from './server.mjs'

const args = process.argv.slice(2)
const variant = args.find((a) => VARIANTS.includes(a))
if (!variant) {
  console.error('usage: node serve.mjs student|academy [--port N]')
  process.exit(2)
}
const ix = args.indexOf('--port')
const port = ix >= 0 ? Number(args[ix + 1]) : DEFAULT_PORT[variant]

try {
  const server = await startServer(variant, port)
  const stop = async () => {
    await server.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
} catch (e) {
  console.error(String(e?.message ?? e))
  process.exit(1)
}

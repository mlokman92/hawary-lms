// Start the web harness and keep it running until Ctrl-C.
//
//   node tools/capture/web/serve.mjs --port 5311        (from video/)
//
// Then open http://127.0.0.1:5311/?as=director in a browser, or shoot with
// run.mjs. To shoot without keeping a server around, use `run.mjs … --serve`.

import { startServer } from './server.mjs'

const args = process.argv.slice(2)
const pi = args.indexOf('--port')
const port = pi >= 0 ? Number(args[pi + 1]) : NaN
if (!Number.isInteger(port)) {
  console.error('usage: node serve.mjs --port <free port>   (not 5173, 5199, 8081, 8191, 8192)')
  process.exit(2)
}

try {
  const server = await startServer(port)
  console.log(`\n  capture harness (real apps/web, fake backend) on ${server.url}`)
  console.log(`  try  ${server.url}/?as=director   ·   ${server.url}/learn?as=student   ·   ${server.url}/signin?as=anon`)
  console.log(`  pid ${process.pid} — stop with Ctrl-C\n`)
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

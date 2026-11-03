// npm run status: says whether the server is running.
const PORT = Number(process.env.PORT) || 4747
const url = `http://127.0.0.1:${PORT}`

const isUp = await fetch(url, { signal: AbortSignal.timeout(500) }).then(
  res => res.ok,
  () => false,
)
console.log(isUp ? `running at ${url}` : 'not running')

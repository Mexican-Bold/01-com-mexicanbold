<script>
  let status = "Testing..."
  let result = null

  async function test() {
    status = "Calling /api/test..."
    const res = await fetch('/api/test')
    result = await res.text()
    status = "Done"
  }

  // Run test on load
  test()
</script>

<main>
  <h1>🔧 AI & API Test</h1>
  <p><strong>Status:</strong> {status}</p>
  {#if result}
    <h2>Response:</h2>
    <pre>{result}</pre>
  {/if}
</main>

<style>
  main { max-width: 800px; margin: 4rem auto; padding: 0 1rem; }
  pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow: auto; }
</style>

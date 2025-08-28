/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

/**
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ platform }) {
  const env = platform.env;

  // Test 1: Is AI available?
  if (!env.AI) {
    return new Response(
      JSON.stringify({ error: "AI binding not available — check wrangler.jsonc" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // Test 2: Can we run a simple AI model?
  try {
    const { response } = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      prompt: "Reply in one sentence: Is Workers AI working?"
    });

    return new Response(
      JSON.stringify({
        success: true,
        ai: "working",
        message: response.trim()
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "AI failed to run",
        message: err.message
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

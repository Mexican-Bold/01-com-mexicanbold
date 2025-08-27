/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

/**
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, platform }) {
  const env = platform.env;

  // ✅ Extract environment variables
  const ACCOUNT_ID = env.ACCOUNT_ID;
  const IMAGES_API_TOKEN = env.IMAGES_API_TOKEN;

  // ✅ Validate required environment variables
  if (!ACCOUNT_ID) {
    return new Response(
      JSON.stringify({ error: "Server error: ACCOUNT_ID not configured" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
  if (!IMAGES_API_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Server error: IMAGES_API_TOKEN not configured" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // ✅ Parse form data
  const formData = await request.formData();
  const imageFile = formData.get("image");
  const prompt = formData.get("prompt");

  if (!imageFile || !prompt) {
    return new Response(
      JSON.stringify({ error: "Missing image or prompt" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  if (!(imageFile instanceof File)) {
    return new Response(
      JSON.stringify({ error: "Invalid image file" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // Step 1: Upload to Cloudflare Images API
  let imageResult;
  try {
    const imageBuffer = await imageFile.arrayBuffer();

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/images/v1`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${IMAGES_API_TOKEN}`,
        },
        body: imageBuffer,
      }
    );

    const data = await response.json();

    if (!data.success) {
      return new Response(
        JSON.stringify({
          error: "Image upload failed",
          details: data.errors,
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    imageResult = data.result;
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Image upload error",
        message: err.message,
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // ✅ Construct public image URL
  const imageUrl =
    imageResult.urls?.default || `https://imagedelivery.net/${imageResult.id}/public`;

  // Step 2: Use LLaVA to understand the image
  const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
  const llavaResponse = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
    prompt:
      "Describe this image in detail. Identify objects that could animate: eyes, vines, flowers, limbs, etc. Note their positions.",
    image: [...imageBytes],
  });

  const imageDescription = String(llavaResponse.response).trim();

  // Step 3: Use Llama 3 to generate animation plan
  const llamaPrompt = `
You are an animation director for hand-drawn art. Given:
Image: "${imageDescription}"
Request: "${prompt}"

Generate a JSON animation plan with:
- target: object to animate (e.g., "left eye", "vine from ear")
- action: "blink", "grow", "wiggle", "pulse", "sway"
- duration: in milliseconds
- origin: where motion starts
- notes: for animator

Return ONLY JSON.
  `.trim();

  const llamaResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
    prompt: llamaPrompt,
  });

  let animationPlan;
  try {
    animationPlan = JSON.parse(llamaResponse.response.trim());
  } catch (e) {
    // Fallback if LLM doesn't return valid JSON
    animationPlan = {
      raw: llamaResponse.response.trim(),
      warning: "Failed to parse animation plan as JSON",
    };
  }

  // ✅ Return structured response
  return new Response(
    JSON.stringify({
      imageUrl,
      imageId: imageResult.id,
      imageDescription,
      userPrompt: prompt,
      animationPlan,
    }),
    { headers: { "content-type": "application/json" } }
  );
}

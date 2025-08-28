/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

/**
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, platform }) {
  const env = platform.env;

  // Validate environment
  if (!env.ACCOUNT_ID) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: ACCOUNT_ID missing" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
  if (!env.IMAGES_API_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: IMAGES_API_TOKEN missing" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
  if (!env.AI) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: AI binding missing" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  try {
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

    // --- Step 1: Upload to Cloudflare Images ---
    let imageResult;
    try {
      const imageBuffer = await imageFile.arrayBuffer();

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/images/v1`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.IMAGES_API_TOKEN}`,
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
            response: data,
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
          stack: err.stack,
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const imageUrl =
      imageResult.urls?.default || `https://imagedelivery.net/${imageResult.id}/public`;

    // --- Step 2: Use LLaVA to describe the image ---
    let imageDescription = "No description generated";
    try {
      const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
      const llavaResponse = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
        prompt:
          "Describe this image in detail. Identify objects that could animate: eyes, vines, flowers, limbs, etc. Note their positions.",
        image: [...imageBytes],
      });
      imageDescription = String(llavaResponse.response).trim();
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "LLaVA AI failed",
          message: err.message,
          stack: err.stack,
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // --- Step 3: Use Llama 3 to generate animation plan ---
    let animationPlan;
    try {
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

      animationPlan = JSON.parse(llamaResponse.response.trim());
    } catch (err) {
      // Fallback if JSON fails
      animationPlan = {
        raw: llamaResponse?.response || "Failed to generate",
        warning: "LLM did not return valid JSON",
        parseError: err.message,
      };
    }

    // ✅ Return success
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
  } catch (err) {
    // 🚨 Catch any unexpected top-level error
    return new Response(
      JSON.stringify({
        error: "Unexpected server error",
        message: err.message,
        stack: err.stack,
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

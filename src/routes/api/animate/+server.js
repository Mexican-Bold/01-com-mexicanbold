/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

/**
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, platform }) {
  const env = platform.env;

  // ✅ STEP 1: Extract and validate environment variables early
  const ACCOUNT_ID = env.ACCOUNT_ID;
  const IMAGES_API_TOKEN = env.IMAGES_API_TOKEN;

  if (!ACCOUNT_ID) {
    return new Response(
      JSON.stringify({ error: "Server error: ACCOUNT_ID is not configured" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  if (!IMAGES_API_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Server error: IMAGES_API_TOKEN is not configured" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  if (!env.AI) {
    return new Response(
      JSON.stringify({ error: "Server error: AI binding is not configured" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const formData = await request.formData();
    const imageFile = formData.get("image");
    const prompt = formData.get("prompt");

    if (!imageFile || !prompt) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: image or prompt" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    if (!(imageFile instanceof File)) {
      return new Response(
        JSON.stringify({ error: "Invalid image file provided" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // --- STEP 2: Upload to Cloudflare Images ---
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
            message: "Failed to upload image to Cloudflare Images",
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

    // --- STEP 3: Use LLaVA to describe the image ---
    let imageDescription = "No description generated";
    try {
      // Re-read buffer (safe because we're not reusing the stream)
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
          error: "AI image analysis failed",
          message: err.message,
          stack: err.stack,
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // --- STEP 4: Use Llama 3 to generate animation plan ---
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
      // Fallback if LLM doesn't return valid JSON
      animationPlan = {
        raw: llamaResponse?.response || "LLM output not available",
        warning: "Failed to parse animation plan as JSON",
        parseError: err.message,
      };
    }

    // ✅ Return success response
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
    // 🚨 Final fallback for any uncaught error
    return new Response(
      JSON.stringify({
        error: "Unexpected server error",
        message: err.message,
        stack: err.stack || "No stack trace available",
        ...(err.cause && { cause: err.cause }),
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

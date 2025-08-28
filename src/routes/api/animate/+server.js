/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

/**
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, platform }) {
  const env = platform.env;

  // ✅ Validate environment
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

    // ✅ Helper: Timeout wrapper for AI calls
    function withTimeout(promise, ms) {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
        )
      ]);
    }

    // --- Step 1: Upload to Cloudflare Images as multipart/form-data ---
    let imageResult;
    try {
      const imageBuffer = await imageFile.arrayBuffer();
      const boundary = '----CloudflareWorkerFormBoundary' + Math.random().toString(16);
      const crlf = '\r\n';

      const formDataBlob = new Blob([
        crlf + `--${boundary}${crlf}` +
        `Content-Disposition: form-data; name="file"; filename="drawing.png"${crlf}` +
        `Content-Type: image/png${crlf}${crlf}`
      ], { type: 'multipart/form-data' });

      const fullBody = new Blob([
        formDataBlob,
        new Uint8Array(imageBuffer),
        crlf + `--${boundary}--${crlf}`
      ]);

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/images/v1`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${IMAGES_API_TOKEN}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`
          },
          body: fullBody
        }
      );

      const data = await response.json();

      if (!data.success) {
        return new Response(
          JSON.stringify({
            error: "Image upload failed",
            details: data.errors,
            response: data
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
          stack: err.stack
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const imageUrl = (imageResult.urls?.default || `https://imagedelivery.net/${imageResult.id}/public`).trim();

    // --- Step 2: Use LLaVA to describe the image ---
    let imageDescription = "A simple hand-drawn character or scene.";
    try {
      const imageBytes = new Uint8Array(await imageFile.arrayBuffer());

      const llavaResponse = await withTimeout(
        env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
          prompt:
            "Describe this hand-drawn image in detail. Identify any parts that could animate: eyes, arms, vines, flowers, etc. Be specific about positions and colors.",
          image: [...imageBytes],
        }),
        12000
      );

      if (!llavaResponse || !llavaResponse.response) {
        throw new Error("LLaVA returned empty response");
      }

      const desc = String(llavaResponse.response).trim();
      imageDescription = desc && desc !== "undefined" ? desc : "A simple hand-drawn character or scene.";
    } catch (err) {
      console.error("LLaVA error:", err);
      imageDescription = "A simple hand-drawn character or scene.";
    }

    // --- Step 3: Use Llama 3 to generate animation plan ---
    let animationPlan = [];
    try {
      const llamaPrompt = `
You are an animation director for hand-drawn art. 

Image description: "${imageDescription}"
User request: "${prompt}"

IMPORTANT: Even if the image description is vague or generic, you MUST create animations based on the user's request. Make reasonable assumptions about what could be animated.

For the request "${prompt}", generate realistic animation targets and actions:

Common animation targets for drawings:
- arms, hands, legs, body parts
- eyes, mouth, facial features  
- plants, vines, flowers, leaves
- hair, clothing, accessories
- geometric shapes, lines, circles

Available actions:
- "wiggle": slight back and forth motion
- "blink": appear/disappear rapidly
- "grow": expand or extend over time
- "pulse": scale up and down
- "sway": gentle swaying motion
- "bounce": up and down movement

Create 1-3 animation objects. Return ONLY valid JSON array format:

[
  { "target": "arms", "action": "wiggle", "duration": 1000, "notes": "wiggle the arm-like parts" },
  { "target": "eyes", "action": "blink", "duration": 500, "notes": "blink any circular eye-like shapes" }
]

Return ONLY the JSON array, no other text.
      `.trim();

      const llamaResponse = await withTimeout(
        env.AI.run("@cf/meta/llama-3-8b-instruct", { prompt: llamaPrompt }),
        10000
      );

      const raw = llamaResponse.response.trim();
      console.log("LLM raw response:", raw);

      // Parse and normalize the response
      let parsed;
      try {
        // Clean the response - sometimes LLMs add extra text
        let cleanResponse = raw;
        
        // Try to extract JSON if there's extra text
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          cleanResponse = jsonMatch[0];
        }
        
        parsed = JSON.parse(cleanResponse);
      } catch (parseErr) {
        console.error("Failed to parse LLM response as JSON:", raw);
        // Fallback: create a default animation based on the prompt
        if (prompt.toLowerCase().includes('wiggle') && prompt.toLowerCase().includes('arms')) {
          animationPlan = [
            { "target": "arms", "action": "wiggle", "duration": 1000, "notes": "fallback wiggle animation" }
          ];
        } else if (prompt.toLowerCase().includes('blink')) {
          animationPlan = [
            { "target": "eyes", "action": "blink", "duration": 500, "notes": "fallback blink animation" }
          ];
        } else {
          animationPlan = [
            { "target": "main element", "action": "pulse", "duration": 800, "notes": "generic fallback animation" }
          ];
        }
        console.log("Using fallback animation:", animationPlan);
      }

      if (parsed) {
        // Normalize nested structures: { animations: [...] }
        if (Array.isArray(parsed) && parsed.length > 0 && 'animations' in parsed[0]) {
          animationPlan = parsed.flatMap(group => Array.isArray(group.animations) ? group.animations : []);
        }
        // Handle single object response
        else if (!Array.isArray(parsed)) {
          animationPlan = [parsed];
        }
        // Handle normal array
        else if (Array.isArray(parsed)) {
          animationPlan = parsed;
        }

        // Final safety: ensure all items are valid objects with target/action
        animationPlan = animationPlan.filter(item => 
          item && 
          typeof item === 'object' && 
          item.target && 
          item.action
        );
      }
    } catch (err) {
      console.error("LLM processing error:", err);
      animationPlan = [];
    }

    console.log("Final animation plan:", animationPlan);

    // ✅ Return success
    return new Response(
      JSON.stringify({
        imageUrl,
        imageId: imageResult.id,
        imageDescription,
        userPrompt: prompt,
        animationPlan
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Unexpected server error",
        message: err.message,
        stack: err.stack || "No stack trace"
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

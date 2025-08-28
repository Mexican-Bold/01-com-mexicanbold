<script>
  let image = null;
  let prompt = "";
  let result = null;

  // ✅ Resize image to max 800px width
  async function resizeImage(file) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    return new Promise((resolve) => {
      img.onload = () => {
        const maxSize = 800;
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(resolve, "image/png", 0.8);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function submit() {
    if (!image || !prompt) return;

    // ✅ Resize before sending
    const resizedImage = await resizeImage(image);
    const formData = new FormData();
    formData.append("image", resizedImage, "drawing.png");
    formData.append("prompt", prompt);

    const res = await fetch("/api/animate", {
      method: "POST",
      body: formData,
    });

    result = await res.json();
  }
</script>

<main>
  <h1>Animate My Drawing</h1>
  <p>Upload a hand-drawn PNG and bring it to life with natural language.</p>

  <input
    type="file"
    accept="image/png"
    on:change={(e) => (image = e.target.files?.[0] || null)}
  />
  <br /><br />

  <label>
    <input
      type="text"
      placeholder="Make the vine grow slowly"
      bind:value={prompt}
      style="width: 300px"
    />
  </label>

  <button on:click={submit} disabled={isProcessing}>
    {isProcessing ? "Animating..." : "Animate"}
  </button>

  {#if result}
    <div id="result">
      <img src={result.imageUrl} alt="Uploaded drawing" />

      <h3>Animation Plan</h3>
      <pre>{JSON.stringify(result.animationPlan, null, 2)}</pre>

      <p><small>Next: Use this JSON to animate with Anime.js, GSAP, or PixiJS!</small></p>
    </div>
  {/if}
</main>

<style>
  main { max-width: 800px; margin: 4rem auto; padding: 0 1rem; }
  img { max-width: 100%; border: 1px solid #ddd; margin: 1rem 0; }
  pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow: auto; }
  button { padding: 0.5rem 1rem; font-size: 1rem; }
</style>

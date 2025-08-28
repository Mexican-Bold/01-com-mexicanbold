<script>
  // State
  /** @type {File | null} */ let image = null;
  /** @type {string | null} */ let imagePreview = null;
  /** @type {string} */ let prompt = "";
  /** @type {Object | null} */ let result = null;
  /** @type {boolean} */ let isProcessing = false;

  // Handle file input and create local preview
  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) {
      image = file;
      imagePreview = URL.createObjectURL(file);
    }
  }

  // Resize image to prevent Worker timeout
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

  // Submit form
  async function submit() {
    if (!image || !prompt) {
      alert("Please upload an image and enter a prompt.");
      return;
    }

    isProcessing = true;

    try {
      const resizedImage = await resizeImage(image);
      const formData = new FormData();
      formData.append("image", resizedImage, "drawing.png");
      formData.append("prompt", prompt);

      const res = await fetch("/api/animate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!Array.isArray(data.animationPlan)) {
        data.animationPlan = [];
      }

      result = data;

      if (result.animationPlan.length > 0) {
        setTimeout(() => {
          animateFromPlan(result.animationPlan);
        }, 100);
      }
    } catch (err) {
      result = { error: "Request failed", message: err.message };
    } finally {
      isProcessing = false;
    }
  }

  // Animation placeholder
  function animateFromPlan(animations) {
    console.log("Animation plan received:", animations);
    // Future: Use Anime.js or GSAP here
  }
</script>

<main>
  <h1>Animate My Drawing</h1>
  <p>Upload a hand-drawn PNG and bring it to life with natural language.</p>

  <input type="file" accept="image/png" on:change={handleFileInput} />
  
  {#if imagePreview}
    <img src={imagePreview} alt="Preview" style="max-width: 300px; margin: 1rem 0;" />
  {/if}

  <br />
  <label>
    <input
      type="text"
      placeholder="Make the green arms wiggle"
      bind:value={prompt}
      style="width: 300px"
    />
  </label>
  <button on:click={submit} disabled={isProcessing}>
    {isProcessing ? "Animating..." : "Animate"}
  </button>

  {#if result}
    {#if result.imageUrl}
      <img src={result.imageUrl} alt="Uploaded drawing" style="max-width: 100%; border: 1px solid #ccc; margin: 1rem 0;" />
    {/if}
{#if result.animationPlan.length > 0}
  <h3>Animation: {result.animationPlan[0].action} {result.animationPlan[0].target}</h3>
  <pre>{JSON.stringify(result.animationPlan, null, 2)}</pre>
{:else}
  <p style="color: #ff9800">
    No animation generated. AI didn't understand the image or prompt.
  </p>
{/if}
  {/if}
</main>

<style>
  main { max-width: 800px; margin: 4rem auto; padding: 0 1rem; }
  img { max-width: 100%; border: 1px solid #ddd; display: block; }
  pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow: auto; }
  button { padding: 0.5rem 1rem; font-size: 1rem; }
  input[type="file"], input[type="text"] { margin-bottom: 1rem; }
</style>

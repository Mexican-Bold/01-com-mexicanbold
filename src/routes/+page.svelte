<script>
  // State
  /** @type {File | null} */ let image = null;
  /** @type {string} */ let prompt = "";
  /** @type {Object | null} */ let result = null;
  /** @type {boolean} */ let isProcessing = false;

  // ✅ Resize image before upload
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

  // ✅ Submit form
  async function submit() {
    if (!image || !prompt) return;
    isProcessing = true;

    try {
      const resizedImage = await resizeImage(image);
      const formData = new FormData();
      formData.append("image", resizedImage, "drawing.png");
      formData.append("prompt", prompt);

      const res = await fetch("/api/animate", { method: "POST", body: formData });
      result = await res.json();

      // ✅ Trigger animation after receiving JSON
      if (result.animationPlan) {
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

  // ✅ Use the JSON to animate!
  function animateFromPlan(animations) {
    animations.forEach((anim) => {
      if (anim.action === "wiggle" && anim.target.includes("arms")) {
        anime({
          targets: '#arm-left, #arm-right',
          rotate: '10deg',
          duration: anim.duration || 1000,
          easing: 'easeInOutSine',
          loop: true,
          direction: 'alternate',
          delay: anime.stagger(100)
        });
      }
      if (anim.action === "blink") {
        anime({
          targets: '.eye',
          opacity: [1, 0],
          duration: 200,
          easing: 'linear',
          loop: true,
          direction: 'alternate',
          interval: anim.duration || 2000
        });
      }
    });
  }
</script>

<main>
  <h1>Animate My Drawing</h1>
  <p>Upload a hand-drawn PNG and bring it to life with natural language.</p>

  <input type="file" accept="image/png" on:change={(e) => (image = e.target.files?.[0] || null)} />
  <br /><br />
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
    <div id="result">
      <img src={result.imageUrl} alt="Uploaded drawing" style="max-width: 100%; border: 1px solid #ccc;" />

      <!-- ✅ Overlay SVG for animation -->
      {#if result.animationPlan?.some(a => a.target.includes('arms'))}
        <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
          <path id="arm-left" d="M100,200 C120,180 140,220 160,200" stroke="green" stroke-width="8" fill="none" />
          <path id="arm-right" d="M300,200 C320,180 340,220 360,200" stroke="green" stroke-width="8" fill="none" />
        </svg>
      {/if}

      <h3>Animation Plan</h3>
      <pre>{JSON.stringify(result.animationPlan, null, 2)}</pre>
    </div>
  {/if}
</main>

<style>
  main { max-width: 800px; margin: 4rem auto; padding: 0 1rem; position: relative; }
  img { max-width: 100%; border: 1px solid #ddd; display: block; }
  svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
  pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow: auto; }
  button { padding: 0.5rem 1rem; font-size: 1rem; }
</style>

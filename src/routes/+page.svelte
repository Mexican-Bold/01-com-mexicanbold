<script>
  // Import Anime.js from npm
  import anime from 'animejs';

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

      // ✅ Trigger animation if plan exists
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

  // ✅ Use Anime.js to animate based on the plan
  function animateFromPlan(animations) {
    animations.forEach((anim) => {
      // 🌀 Wiggle arms
      if (anim.action === "wiggle" && anim.target.includes("arms")) {
        anime({
          targets: '#arm-left, #arm-right',
          rotate: '15deg',
          duration: anim.duration || 1000,
          easing: 'easeInOutSine',
          loop: true,
          direction: 'alternate',
          delay: anime.stagger(100)
        });
      }

      // 👁️ Blink eyes
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

      // 🌿 Grow a vine
      if (anim.action === "grow" && anim.target.includes("vine")) {
        anime({
          targets: '#vine-path',
          strokeDashoffset: [anime.setDashoffset, 0],
          duration: anim.duration || 2000,
          easing: 'easeInOutQuad',
          loop: false
        });
      }
    });
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
      <div style="position: relative; display: inline-block; margin: 1rem 0;">
        <img src={result.imageUrl} alt="Uploaded drawing" style="max-width: 100%; border: 1px solid #ccc;" />

        <!-- ✅ SVG Overlay for Animation -->
        <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
          <!-- Left Arm -->
          {#if result.animationPlan?.some(a => a.target.includes('arms') && a.action === 'wiggle')}
            <path id="arm-left" d="M100,200 C120,180 140,220 160,200" stroke="green" stroke-width="8" fill="none" />
          {/if}

          <!-- Right Arm -->
          {#if result.animationPlan?.some(a => a.target.includes('arms') && a.action === 'wiggle')}
            <path id="arm-right" d="M300,200 C320,180 340,220 360,200" stroke="green" stroke-width="8" fill="none" />
          {/if}

          <!-- Eyes -->
          {#if result.animationPlan?.some(a => a.action === 'blink')}
            <circle class="eye" cx="180" cy="120" r="10" fill="black" />
            <circle class="eye" cx="220" cy="120" r="10" fill="black" />
          {/if}

          <!-- Vine -->
          {#if result.animationPlan?.some(a => a.target.includes('vine') && a.action === 'grow')}
            <path id="vine-path"
                  d="M250,300 C260,280 280,270 300,280 C320,290 330,310 320,330"
                  stroke="green"
                  stroke-width="6"
                  fill="none"
                  stroke-dasharray="100"
                  stroke-dashoffset="100" />
          {/if}
        </svg>
      </div>
    {/if}

    {#if result.animationPlan.length}
      <h3>Animation Plan</h3>
      <pre>{JSON.stringify(result.animationPlan, null, 2)}</pre>
    {:else if result.error}
      <p style="color: red">Error: {result.error}</p>
    {:else}
      <p>No animation generated.</p>
    {/if}
  {/if}
</main>

<style>
  main { max-width: 800px; margin: 4rem auto; padding: 0 1rem; }
  img { max-width: 100%; border: 1px solid #ddd; display: block; }
  svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
  pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow: auto; }
  button { padding: 0.5rem 1rem; font-size: 1rem; }
  input[type="file"], input[type="text"] { margin-bottom: 1rem; }
</style>

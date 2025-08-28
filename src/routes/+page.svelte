<script>
  // ✅ Fixed import for animejs
  import anime from 'animejs/lib/anime.es.js';

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
      console.log('Animation result received:', result);

      // ✅ Trigger animation if plan exists
      if (result.animationPlan.length > 0) {
        setTimeout(() => {
          animateFromPlan(result.animationPlan);
        }, 500);
      }
    } catch (err) {
      result = { error: "Request failed", message: err.message };
      console.error('Request error:', err);
    } finally {
      isProcessing = false;
    }
  }

  // ✅ Fixed animation function
  function animateFromPlan(animations) {
    if (!Array.isArray(animations)) return;
    
    console.log('Starting animations:', animations);
    
    animations.forEach((anim, index) => {
      if (!anim.target || !anim.action) return;

      console.log(`Animating ${index + 1}/${animations.length}:`, anim);

      // Arms wiggling
      if (anim.action === "wiggle" && anim.target.includes("arms")) {
        anime({
          targets: '#arm-left, #arm-right',
          rotate: [-15, 15],
          duration: anim.duration || 1000,
          loop: true,
          direction: 'alternate',
          easing: 'easeInOutSine',
          delay: index * 200
        });
      }
      
      // Eye blinking
      if (anim.action === "blink") {
        anime({
          targets: '.eye',
          opacity: [1, 0, 1],
          duration: anim.duration || 400,
          easing: 'linear',
          loop: true,
          delay: anime.stagger(150, {start: index * 300})
        });
      }

      // Vine growing
      if (anim.action === "grow" && anim.target.includes("vine")) {
        // Set initial dash offset
        const vineElement = document.querySelector('#vine-path');
        if (vineElement) {
          const pathLength = vineElement.getTotalLength();
          vineElement.style.strokeDasharray = pathLength;
          vineElement.style.strokeDashoffset = pathLength;
          
          anime({
            targets: '#vine-path',
            strokeDashoffset: [pathLength, 0],
            duration: anim.duration || 2000,
            easing: 'easeInOutQuad',
            loop: false,
            delay: index * 300
          });
        }
      }

      // Pulse animation
      if (anim.action === "pulse") {
        anime({
          targets: `[data-animation-target*="${anim.target}"]`,
          scale: [1, 1.2, 1],
          duration: anim.duration || 800,
          loop: true,
          easing: 'easeInOutQuad',
          delay: index * 200
        });
      }

      // Sway animation
      if (anim.action === "sway") {
        anime({
          targets: `[data-animation-target*="${anim.target}"]`,
          translateX: [-10, 10],
          duration: anim.duration || 1500,
          loop: true,
          direction: 'alternate',
          easing: 'easeInOutSine',
          delay: index * 250
        });
      }

      // Generic wiggle for any target
      if (anim.action === "wiggle" && !anim.target.includes("arms")) {
        anime({
          targets: `[data-animation-target*="${anim.target}"]`,
          rotate: [-5, 5],
          duration: anim.duration || 600,
          loop: true,
          direction: 'alternate',
          easing: 'easeInOutSine',
          delay: index * 200
        });
      }
    });
  }
</script>

<main>
  <h1>Animate My Drawing</h1>
  <p>Upload a hand-drawn PNG and bring it to life with natural language.</p>

  <input type="file" accept="image/png,image/jpg,image/jpeg" on:change={handleFileInput} />

  {#if imagePreview}
    <img src={imagePreview} alt="Preview" style="max-width: 300px; margin: 1rem 0;" />
  {/if}

  <br />
  <label>
    Animation Request:
    <input
      type="text"
      placeholder="Make the green arms wiggle"
      bind:value={prompt}
      style="width: 300px; margin-left: 0.5rem;"
    />
  </label>
  <br>
  <button on:click={submit} disabled={isProcessing}>
    {isProcessing ? "Animating..." : "Animate"}
  </button>

  {#if result}
    {#if result.error}
      <div class="error">
        <h3>Error</h3>
        <p>{result.error}</p>
        {#if result.message}
          <p><strong>Details:</strong> {result.message}</p>
        {/if}
      </div>
    {:else if result.imageUrl}
      <div class="result-container">
        <h3>Your Animated Drawing</h3>
        <div class="image-container">
          <img src={result.imageUrl} alt="Uploaded drawing" class="main-image" />

          <!-- ✅ SVG Overlay for Animation -->
          <svg class="animation-overlay" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">
            <!-- Left Arm -->
            {#if result.animationPlan?.some(a => a.target.includes('arms') && a.action === 'wiggle')}
              <path 
                id="arm-left" 
                d="M100,200 C120,180 140,220 160,200" 
                stroke="rgba(0,255,0,0.7)" 
                stroke-width="8" 
                fill="none"
                data-animation-target="left arm" />
            {/if}

            <!-- Right Arm -->
            {#if result.animationPlan?.some(a => a.target.includes('arms') && a.action === 'wiggle')}
              <path 
                id="arm-right" 
                d="M300,200 C320,180 340,220 360,200" 
                stroke="rgba(0,255,0,0.7)" 
                stroke-width="8" 
                fill="none"
                data-animation-target="right arm" />
            {/if}

            <!-- Eyes -->
            {#if result.animationPlan?.some(a => a.action === 'blink')}
              <circle class="eye" cx="180" cy="120" r="10" fill="rgba(0,0,0,0.8)" data-animation-target="left eye" />
              <circle class="eye" cx="220" cy="120" r="10" fill="rgba(0,0,0,0.8)" data-animation-target="right eye" />
            {/if}

            <!-- Vine -->
            {#if result.animationPlan?.some(a => a.target.includes('vine') && a.action === 'grow')}
              <path 
                id="vine-path"
                d="M250,300 C260,280 280,270 300,280 C320,290 330,310 320,330"
                stroke="rgba(0,150,0,0.8)"
                stroke-width="6"
                fill="none"
                data-animation-target="vine" />
            {/if}

            <!-- Generic animated elements -->
            {#each result.animationPlan as anim}
              {#if !['arms', 'eye', 'vine'].some(type => anim.target.includes(type))}
                <circle 
                  cx={Math.random() * 300 + 50} 
                  cy={Math.random() * 300 + 50} 
                  r="15" 
                  fill="rgba(255,100,100,0.6)"
                  data-animation-target={anim.target} />
              {/if}
            {/each}
          </svg>
        </div>

        {#if result.imageDescription}
          <div class="description">
            <h4>Image Analysis</h4>
            <p>{result.imageDescription}</p>
          </div>
        {/if}

        {#if result.animationPlan.length}
          <div class="animation-plan">
            <h4>Animation Plan</h4>
            <ul>
              {#each result.animationPlan as anim}
                <li>
                  <strong>{anim.target}</strong> will <em>{anim.action}</em>
                  {#if anim.duration}
                    for {anim.duration}ms
                  {/if}
                  {#if anim.notes}
                    <br><small>{anim.notes}</small>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {:else}
          <p>No animations were generated. Try a more specific request!</p>
        {/if}
      </div>
    {/if}
  {/if}
</main>

<style>
  main { 
    max-width: 800px; 
    margin: 2rem auto; 
    padding: 0 1rem; 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  
  .image-container {
    position: relative;
    display: inline-block;
    margin: 1rem 0;
    border: 2px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
  }
  
  .main-image { 
    max-width: 100%; 
    display: block; 
  }
  
  .animation-overlay { 
    position: absolute; 
    top: 0; 
    left: 0; 
    width: 100%; 
    height: 100%; 
    pointer-events: none; 
  }
  
  .error {
    background: #fee;
    border: 1px solid #fcc;
    padding: 1rem;
    border-radius: 6px;
    margin: 1rem 0;
    color: #c00;
  }
  
  .result-container {
    margin: 2rem 0;
  }
  
  .description, .animation-plan {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 6px;
    margin: 1rem 0;
  }
  
  .animation-plan ul {
    list-style: none;
    padding: 0;
  }
  
  .animation-plan li {
    padding: 0.5rem 0;
    border-bottom: 1px solid #eee;
  }
  
  .animation-plan li:last-child {
    border-bottom: none;
  }
  
  button { 
    padding: 0.75rem 1.5rem; 
    font-size: 1rem; 
    background: #007acc;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    margin: 0.5rem 0;
  }
  
  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  
  button:hover:not(:disabled) {
    background: #005fa3;
  }
  
  input[type="file"], input[type="text"] { 
    margin: 0.5rem 0; 
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
  }
  
  input[type="text"] {
    font-size: 1rem;
  }
  
  label {
    display: block;
    margin: 1rem 0;
    font-weight: 500;
  }
</style>
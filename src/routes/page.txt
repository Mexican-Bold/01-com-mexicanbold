<script>
  // ✅ Import animejs - fallback to CDN if not installed
  let anime;
  let imageLoaded = false;
  let pendingAnimations = null;
  
  import { onMount } from 'svelte';
  
  onMount(() => {
    // Load anime.js from CDN
    if (!window.anime) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js';
      script.onload = () => {
        anime = window.anime;
        console.log('Anime.js loaded successfully');
        // If we have pending animations, run them now
        if (pendingAnimations && imageLoaded) {
          animateFromPlan(pendingAnimations);
          pendingAnimations = null;
        }
      };
      script.onerror = () => {
        console.error('Failed to load anime.js from CDN');
      };
      document.head.appendChild(script);
    } else {
      anime = window.anime;
      console.log('Anime.js already available');
    }
  });

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

  // Handle image load event
  function handleImageLoad() {
    imageLoaded = true;
    console.log('Image loaded, ready for animation');
    // If we have pending animations, run them now
    if (pendingAnimations && anime) {
      setTimeout(() => {
        animateFromPlan(pendingAnimations);
        pendingAnimations = null;
      }, 100); // Small delay to ensure DOM is fully rendered
    }
  }

  // NEW: Check image status manually
  function checkImageStatus() {
    const img = document.querySelector('.main-image');
    if (img && img.complete && img.naturalHeight !== 0) {
      console.log('Image already loaded, triggering load handler manually');
      handleImageLoad();
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
    imageLoaded = false; // Reset image loaded state
    pendingAnimations = null;

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

      // ✅ Store animations to run after image loads
      if (result.animationPlan.length > 0) {
        console.log('Animation plan:', result.animationPlan);
        pendingAnimations = result.animationPlan;
        
        // NEW: Check if image is already loaded
        setTimeout(checkImageStatus, 100);
        
        // NEW: Set a fallback timeout in case image loading fails
        setTimeout(() => {
          if (pendingAnimations && anime) {
            console.log('Running animations as fallback after timeout');
            imageLoaded = true; // Force set to true
            animateFromPlan(pendingAnimations);
            pendingAnimations = null;
          }
        }, 3000); // 3 second fallback
        
        // If image is already loaded and anime is ready, run immediately
        if (imageLoaded && anime) {
          setTimeout(() => {
            animateFromPlan(pendingAnimations);
            pendingAnimations = null;
          }, 500);
        }
      }
    } catch (err) {
      result = { error: "Request failed", message: err.message };
      console.error('Request error:', err);
    } finally {
      isProcessing = false;
    }
  }

  // ✅ Fixed animation function with better DOM targeting
  function animateFromPlan(animations) {
    if (!Array.isArray(animations)) {
      console.log('No animations array provided');
      return;
    }
    
    if (!anime) {
      console.log('Anime.js not loaded yet, storing as pending...');
      pendingAnimations = animations;
      return;
    }

    if (!imageLoaded) {
      console.log('Image not loaded yet, storing as pending...');
      pendingAnimations = animations;
      return;
    }
    
    console.log('Starting animations:', animations);
    
    // NEW: Enhanced debugging
    setTimeout(() => {
      const allTargets = document.querySelectorAll('[data-animation-target], #arm-left, #arm-right, .eye, #vine-path');
      console.log('All available animation targets:', allTargets);
      
      // Specifically check for arm elements
      const armElements = document.querySelectorAll('#arm-left, #arm-right, [data-animation-target="arms"]');
      console.log('Arm elements specifically:', armElements);
    }, 100);
    
    animations.forEach((anim, index) => {
      if (!anim.target || !anim.action) return;

      console.log(`Animating ${index + 1}/${animations.length}:`, anim);

      // Arms wiggling - target both specific arms and generic "arms"
      if (anim.action === "wiggle" && anim.target.includes("arms")) {
        const targets = '#arm-left, #arm-right, [data-animation-target="arms"]';
        console.log('Wiggling arms with targets:', targets);
        
        const foundElements = document.querySelectorAll(targets);
        console.log('Found arm elements:', foundElements);
        
        if (foundElements.length > 0) {
          anime({
            targets: targets,
            rotate: [-15, 15],
            duration: anim.duration || 1000,
            loop: true,
            direction: 'alternate',
            easing: 'easeInOutSine',
            delay: index * 200
          });
        } else {
          console.warn('No arm elements found for wiggling');
        }
      }
      
      // Hair swaying
      if (anim.action === "sway" && anim.target.includes("hair")) {
        const targets = `[data-animation-target="hair"], #hair-${index}`;
        console.log('Swaying hair with targets:', targets);
        anime({
          targets: targets,
          rotate: [-5, 5],
          transformOrigin: 'top center',
          duration: anim.duration || 1200,
          loop: true,
          direction: 'alternate',
          easing: 'easeInOutSine',
          delay: index * 200
        });
      }
      
      // Eye blinking
      if (anim.action === "blink") {
        const eyeElements = document.querySelectorAll('.eye');
        console.log('Found eye elements for blinking:', eyeElements);
        
        if (eyeElements.length > 0) {
          anime({
            targets: '.eye',
            opacity: [1, 0, 1],
            duration: anim.duration || 400,
            easing: 'linear',
            loop: true,
            delay: anime.stagger(150, {start: index * 300})
          });
        }
      }

      // Vine growing
      if (anim.action === "grow" && anim.target.includes("vine")) {
        const vineElement = document.querySelector('#vine-path');
        console.log('Found vine element:', vineElement);
        
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
        const targets = `[data-animation-target*="${anim.target}"], #generic-${index}`;
        console.log('Pulse targets:', targets);
        
        const foundElements = document.querySelectorAll(targets);
        if (foundElements.length > 0) {
          anime({
            targets: targets,
            scale: [1, 1.2, 1],
            duration: anim.duration || 800,
            loop: true,
            easing: 'easeInOutQuad',
            delay: index * 200
          });
        }
      }

      // Sway animation (non-hair)
      if (anim.action === "sway" && !anim.target.includes("hair")) {
        const targets = `[data-animation-target*="${anim.target}"], #generic-${index}`;
        console.log('Generic sway targets:', targets);
        
        const foundElements = document.querySelectorAll(targets);
        if (foundElements.length > 0) {
          anime({
            targets: targets,
            translateX: [-10, 10],
            duration: anim.duration || 1500,
            loop: true,
            direction: 'alternate',
            easing: 'easeInOutSine',
            delay: index * 250
          });
        }
      }

      // Generic wiggle for non-arms
      if (anim.action === "wiggle" && !anim.target.includes("arms")) {
        const targets = `[data-animation-target="${anim.target}"], #generic-${index}`;
        console.log('Generic wiggle targets:', targets);
        
        const foundElements = document.querySelectorAll(targets);
        if (foundElements.length > 0) {
          anime({
            targets: targets,
            rotate: [-5, 5],
            duration: anim.duration || 600,
            loop: true,
            direction: 'alternate',
            easing: 'easeInOutSine',
            delay: index * 200
          });
        }
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
          <img 
            src={result.imageUrl} 
            alt="Uploaded drawing" 
            class="main-image"
            on:load={handleImageLoad}
            on:error={() => {
              console.error('Image failed to load');
              // Try to run animations anyway
              if (pendingAnimations && anime) {
                imageLoaded = true; // Force set to true
                animateFromPlan(pendingAnimations);
                pendingAnimations = null;
              }
            }}
            crossorigin="anonymous"
          />

          <!-- ✅ SVG Overlay for Animation - Always render animation elements -->
          <svg class="animation-overlay" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">
            <!-- Always include common animation targets -->
            
            <!-- Arms (always present for wiggle animations) -->
            <path 
              id="arm-left" 
              d="M80,180 C100,160 120,200 140,180" 
              stroke="rgba(0,255,0,0.7)" 
              stroke-width="8" 
              fill="none"
              data-animation-target="arms"
              opacity="0.8" />
            <path 
              id="arm-right" 
              d="M260,180 C280,160 300,200 320,180" 
              stroke="rgba(0,255,0,0.7)" 
              stroke-width="8" 
              fill="none"
              data-animation-target="arms"
              opacity="0.8" />

            <!-- Eyes (for blinking) -->
            <circle class="eye" cx="170" cy="140" r="8" fill="rgba(0,0,0,0.8)" />
            <circle class="eye" cx="230" cy="140" r="8" fill="rgba(0,0,0,0.8)" />

            <!-- Hair (for swaying) -->
            <path 
              d="M130,100 C150,80 180,85 210,90 C230,95 250,100 260,110"
              stroke="rgba(139,69,19,0.7)"
              stroke-width="6"
              fill="none"
              data-animation-target="hair" 
              id="hair-0"
              opacity="0.8" />

            <!-- Dynamic elements based on animation plan -->
            {#each result.animationPlan as anim, i}
              {#if anim.target.includes('vine') && anim.action === 'grow'}
                <!-- Vine -->
                <path 
                  id="vine-path"
                  d="M250,300 C260,280 280,270 300,280 C320,290 330,310 320,330"
                  stroke="rgba(0,150,0,0.8)"
                  stroke-width="6"
                  fill="none"
                  data-animation-target={anim.target} />
              {:else if !anim.target.includes('arms') && !anim.target.includes('hair') && !anim.target.includes('eye')}
                <!-- Generic animated element for other targets -->
                <g data-animation-target={anim.target} id="generic-{i}">
                  <circle 
                    cx={120 + (i * 80)} 
                    cy={200 + (i * 40)} 
                    r="25" 
                    fill="rgba(255,150,100,0.6)"
                    stroke="rgba(255,150,100,0.9)"
                    stroke-width="3" />
                  <text x={120 + (i * 80)} y={205 + (i * 40)} text-anchor="middle" fill="white" font-size="12" font-weight="bold">
                    {anim.target.slice(0,3)}
                  </text>
                </g>
              {/if}
            {/each}

            <!-- Debug info overlay -->
            {#if pendingAnimations}
              <text x="10" y="380" fill="rgba(255,0,0,0.7)" font-size="12">
                Waiting for image to load...
              </text>
            {/if}
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

        <!-- Debug info -->
        <div class="debug-info" style="margin-top: 1rem; padding: 0.5rem; background: #f0f0f0; font-size: 0.8rem; color: #666;">
          <p><strong>Debug:</strong> Image loaded: {imageLoaded}, Anime ready: {!!anime}, Pending: {!!pendingAnimations}</p>
        </div>
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
    background: #fafafa;
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

  .debug-info {
    border-radius: 4px;
    margin-top: 1rem;
  }
</style>



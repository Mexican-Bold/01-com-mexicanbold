<script>
  // ✅ Import animejs - fallback to CDN if not installed
  let anime;
  let imageLoaded = false;
  let pendingAnimations = null;
  let showSpinner = false;
  let imageBlobUrl = null;
  let savedImages = []; // Store previously uploaded images
  let detectedFeatures = null; // State for detected features
  
  import { onMount } from 'svelte';
  
  onMount(() => {
    // Load saved images from localStorage
    const saved = localStorage.getItem('savedImages');
    if (saved) {
      savedImages = JSON.parse(saved);
    }
    
    // Load anime.js from CDN
    if (!window.anime) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js';
      script.onload = () => {
        anime = window.anime;
        console.log('Anime.js loaded successfully');
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
  /** @type {boolean} */ let imageError = false;
  /** @type {string | null} */ let selectedImageId = null;

  // Handle file input and create local preview
  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) {
      image = file;
      imagePreview = URL.createObjectURL(file);
      selectedImageId = null; // Clear selected image when new file is chosen
    }
  }

  // Handle saved image selection
  function selectSavedImage(imageId) {
    selectedImageId = imageId;
    const savedImage = savedImages.find(img => img.id === imageId);
    if (savedImage) {
      imagePreview = savedImage.url;
      image = null; // Clear file input
    }
  }

  // Handle image load event
  function handleImageLoad() {
    imageLoaded = true;
    imageError = false;
    showSpinner = false;
    console.log('Image loaded, ready for animation');
    if (pendingAnimations && anime) {
      setTimeout(() => {
        animateFromPlan(pendingAnimations);
        pendingAnimations = null;
      }, 100);
    }
  }

  // Handle image error
  function handleImageError() {
    console.error('Image failed to load');
    imageError = true;
    showSpinner = false;
    if (pendingAnimations && anime) {
      imageLoaded = true;
      animateFromPlan(pendingAnimations);
      pendingAnimations = null;
    }
  }

  // Simple feature detection using canvas
  async function detectBasicFeatures(imageUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to match our SVG viewport
        canvas.width = 400;
        canvas.height = 400;
        
        // Draw image centered and scaled
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width - img.width * scale) / 2;
        const y = (canvas.height - img.height * scale) / 2;
        
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        
        // Get image data for analysis
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Estimate feature positions
        const features = estimateFeaturePositions(imageData);
        
        resolve(features);
      };
      img.src = imageUrl;
    });
  }

  // Estimate feature positions from image data
  function estimateFeaturePositions(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // Simple heuristic: find dark areas that might be features
    const features = {
      eyes: [],
      arms: []
    };
    
    // Scan for potential eye positions (dark areas in upper portion)
    for (let y = height * 0.2; y < height * 0.4; y += 5) {
      for (let x = width * 0.3; x < width * 0.7; x += 5) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // If it's a dark spot, it might be an eye
        if (brightness < 100) {
          features.eyes.push({ x: x, y: y });
        }
      }
    }
    
    // Scan for potential arm positions (dark areas extending from center)
    for (let y = height * 0.4; y < height * 0.7; y += 10) {
      for (let x = 0; x < width; x += 10) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // If it's a dark spot, it might be part of an arm
        if (brightness < 100) {
          features.arms.push({ x: x, y: y });
        }
      }
    }
    
    // Cluster and average the positions
    return clusterAndAveragePositions(features);
  }

  // Cluster nearby points and return average positions

// Update the clusterAndAveragePositions function to round coordinates
function clusterAndAveragePositions(features) {
  const result = {
    eyes: { left: { x: 150, y: 140 }, right: { x: 250, y: 140 } },
    arms: { left: { x: 100, y: 180 }, right: { x: 300, y: 180 } }
  };
  
  // If we found eye positions, use them
  if (features.eyes.length > 0) {
    // Simple clustering: divide into left and right halves
    const leftEyes = features.eyes.filter(p => p.x < 200);
    const rightEyes = features.eyes.filter(p => p.x >= 200);
    
    if (leftEyes.length > 0) {
      result.eyes.left = {
        x: Math.round(leftEyes.reduce((sum, p) => sum + p.x, 0) / leftEyes.length),
        y: Math.round(leftEyes.reduce((sum, p) => sum + p.y, 0) / leftEyes.length)
      };
    }
    
    if (rightEyes.length > 0) {
      result.eyes.right = {
        x: Math.round(rightEyes.reduce((sum, p) => sum + p.x, 0) / rightEyes.length),
        y: Math.round(rightEyes.reduce((sum, p) => sum + p.y, 0) / rightEyes.length)
      };
    }
  }
  
  // If we found arm positions, use them
  if (features.arms.length > 0) {
    // Simple clustering: divide into left and right halves
    const leftArms = features.arms.filter(p => p.x < 200);
    const rightArms = features.arms.filter(p => p.x >= 200);
    
    if (leftArms.length > 0) {
      result.arms.left = {
        x: Math.round(leftArms.reduce((sum, p) => sum + p.x, 0) / leftArms.length),
        y: Math.round(leftArms.reduce((sum, p) => sum + p.y, 0) / leftArms.length)
      };
    }
    
    if (rightArms.length > 0) {
      result.arms.right = {
        x: Math.round(rightArms.reduce((sum, p) => sum + p.x, 0) / rightArms.length),
        y: Math.round(rightArms.reduce((sum, p) => sum + p.y, 0) / rightArms.length)
      };
    }
  }
  
  return result;
}

  // Check image status manually
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
    if (!image && !selectedImageId) {
      alert("Please upload an image or select a saved one.");
      return;
    }

    if (!prompt) {
      alert("Please enter an animation request.");
      return;
    }

    isProcessing = true;
    imageLoaded = false;
    imageError = false;
    pendingAnimations = null;
    showSpinner = true;
    imageBlobUrl = null;

    try {
      let formData = new FormData();
      
      if (selectedImageId) {
        // Use saved image
        const savedImage = savedImages.find(img => img.id === selectedImageId);
        if (savedImage) {
          formData.append("imageId", selectedImageId);
          formData.append("prompt", prompt);
        }
      } else {
        // Upload new image
        const resizedImage = await resizeImage(image);
        formData.append("image", resizedImage, image.name);
        formData.append("prompt", prompt);
      }

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

// Save image to saved images if it's a new upload
      if (data.imageId && !selectedImageId) {
        const newImage = {
          id: data.imageId,
          name: image.name,
          url: data.imageUrl,
          date: new Date().toISOString()
        };
        
        // Check if image is already saved
        if (!savedImages.some(img => img.id === data.imageId)) {
          savedImages = [newImage, ...savedImages];
          localStorage.setItem('savedImages', JSON.stringify(savedImages));
        }
      }

      if (result.animationPlan.length > 0) {
        console.log('Animation plan:', result.animationPlan);
        pendingAnimations = result.animationPlan;
        
        // Immediately replace the imageUrl with the proxy URL
        if (result.imageUrl) {
          // Extract the image ID from the URL
          const urlParts = result.imageUrl.split('/');
          const imageId = urlParts[urlParts.length - 2]; // The ID is before the variant
          let variant = urlParts[urlParts.length - 1]; // The last part is the variant
          
          // If the variant is "public" (which doesn't exist), use "full" instead
          if (variant === 'public') {
            variant = 'full';
            console.log('Replacing "public" variant with "full"');
          }
          
          // Replace the imageUrl with the proxy URL
          result.imageUrl = `/image/${imageId}/${variant}`;
          console.log('Replaced imageUrl with proxy URL:', result.imageUrl);
          
          // Detect features in the image
          detectBasicFeatures(result.imageUrl).then(features => {
            detectedFeatures = features;
            console.log('Detected features:', features);
          });
        }
        
        // Force animations to run after 1.5 seconds regardless of image loading
        setTimeout(() => {
          if (pendingAnimations && anime) {
            console.log('Forcing animations to run after timeout');
            imageLoaded = true; // Force set to true
            animateFromPlan(pendingAnimations);
            pendingAnimations = null;
          }
        }, 1500);
        
        // Check if image is already loaded
        setTimeout(checkImageStatus, 100);
      } else {
        showSpinner = false;
      }
    } catch (err) {
      result = { error: "Request failed", message: err.message };
      console.error('Request error:', err);
      showSpinner = false;
    } finally {
      isProcessing = false;
    }
  }

  // Animation function
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
    
    // Get the user prompt for additional context
    const userPrompt = prompt.toLowerCase();
    console.log('User prompt:', userPrompt);
    
    animations.forEach((anim, index) => {
      if (!anim.target || !anim.action) return;

      console.log(`Animating ${index + 1}/${animations.length}:`, anim);

      // Handle "main element" target by checking the user prompt
      if (anim.target === "main element") {
        console.log('Handling "main element" target - checking user prompt for context');
        
        // Check if user requested arm movements
        if (userPrompt.includes('arm')) {
          console.log('User requested arm movement, animating arms');
          const targets = '#arms-group, #arm-left, #arm-right, [data-animation-target="arms"]';
          
          // Make arms visible
          anime({
            targets: '#arms-group',
            opacity: [0, 1],
            duration: 300,
            easing: 'linear'
          });
          
          const foundElements = document.querySelectorAll(targets);
          console.log('Found arm elements:', foundElements);
          
          if (foundElements.length > 0) {
            // Check for specific movement directions
            if (userPrompt.includes('up') && userPrompt.includes('down')) {
              console.log('Animating arms up and down');
              anime({
                targets: targets,
                translateY: [-10, 10],
                duration: anim.duration || 800,
                loop: true,
                direction: 'alternate',
                easing: 'easeInOutSine',
                delay: index * 200
              });
            } else if (userPrompt.includes('side') || userPrompt.includes('left') || userPrompt.includes('right')) {
              console.log('Animating arms side to side');
              anime({
                targets: targets,
                translateX: [-10, 10],
                duration: anim.duration || 800,
                loop: true,
                direction: 'alternate',
                easing: 'easeInOutSine',
                delay: index * 200
              });
            } else {
              console.log('Animating arms with default wiggle');
              anime({
                targets: targets,
                rotate: [-15, 15],
                duration: anim.duration || 1000,
                loop: true,
                direction: 'alternate',
                easing: 'easeInOutSine',
                delay: index * 200
              });
            }
          } else {
            console.warn('No arm elements found for animation');
          }
        }
        
        // Check if user requested eye movements
        if (userPrompt.includes('eye')) {
          console.log('User requested eye movement, animating eyes');
          const targets = '#eyes-group, .eye';
          
          // Make eyes visible
          anime({
            targets: '#eyes-group',
            opacity: [0, 1],
            duration: 300,
            easing: 'linear'
          });
          
          const foundElements = document.querySelectorAll(targets);
          console.log('Found eye elements:', foundElements);
          
          if (foundElements.length > 0) {
            if (userPrompt.includes('blink')) {
              console.log('Animating eyes blinking');
              anime({
                targets: targets,
                opacity: [1, 0, 1],
                duration: anim.duration || 400,
                easing: 'linear',
                loop: true,
                delay: anime.stagger(150, {start: index * 300})
              });
            } else if (userPrompt.includes('up') && userPrompt.includes('down')) {
              console.log('Animating eyes up and down');
              anime({
                targets: targets,
                translateY: [-5, 5],
                duration: anim.duration || 800,
                loop: true,
                direction: 'alternate',
                easing: 'easeInOutSine',
                delay: index * 200
              });
            } else if (userPrompt.includes('side') || userPrompt.includes('left') || userPrompt.includes('right')) {
              console.log('Animating eyes side to side');
              anime({
                targets: targets,
                translateX: [-5, 5],
                duration: anim.duration || 800,
                loop: true,
                direction: 'alternate',
                easing: 'easeInOutSine',
                delay: index * 200
              });
            } else {
              console.log('Animating eyes with default movement');
              anime({
                targets: targets,
                translateX: [-5, 5],
                duration: anim.duration || 800,
                loop: true,
                direction: 'alternate',
                easing: 'easeInOutSine',
                delay: index * 200
              });
            }
          } else {
            console.warn('No eye elements found for animation');
          }
        }
        
        return;
      }

      // Arms wiggling
      if (anim.action === "wiggle" && anim.target.includes("arms")) {
        const targets = '#arms-group, #arm-left, #arm-right, [data-animation-target="arms"]';
        
        // Make arms visible
        anime({
          targets: '#arms-group',
          opacity: [0, 1],
          duration: 300,
          easing: 'linear'
        });
        
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
      
      // Eye animations
      if (anim.target.includes("eyes")) {
        const targets = '#eyes-group, .eye';
        
        // Make eyes visible
        anime({
          targets: '#eyes-group',
          opacity: [0, 1],
          duration: 300,
          easing: 'linear'
        });
        
        const foundElements = document.querySelectorAll(targets);
        console.log('Found eye elements:', foundElements);
        
        if (foundElements.length > 0) {
          switch (anim.action) {
            case "blink":
              anime({
                targets: targets,
                opacity: [1, 0, 1],
                duration: anim.duration || 400,
                easing: 'linear',
                loop: true,
                delay: anime.stagger(150, {start: index * 300})
              });
              break;
              
            case "oscillate":
              anime({
                targets: targets,
                translateX: [-10, 10],
                duration: anim.duration || 1000,
                loop: true,
                direction: 'alternate',
                easing: 'easeInOutSine',
                delay: index * 200
              });
              break;
              
            case "move":
              // Default eye movement - oscillate
              anime({
                targets: targets,
                translateX: [-5, 5],
                duration: anim.duration || 800,
                loop: true,
                direction: 'alternate',
                easing: 'easeInOutSine',
                delay: index * 200
              });
              break;
              
            case "sway":
              anime({
                targets: targets,
                translateX: [-10, 10],
                duration: anim.duration || 1000,
                loop: true,
                direction: 'alternate',
                easing: 'easeInOutSine',
                delay: index * 200
              });
              break;
              
            default:
              // Default eye animation
              anime({
                targets: targets,
                scale: [1, 1.2, 1],
                duration: anim.duration || 800,
                loop: true,
                easing: 'easeInOutQuad',
                delay: index * 200
              });
          }
        } else {
          console.warn('No eye elements found for animation');
        }
      }
    });
  }
</script>

<main>
  <h1>Animate My Drawing</h1>
  <p>Upload a hand-drawn PNG or select a saved image to bring it to life with natural language.</p>

  <!-- Saved Images Section -->
  {#if savedImages.length > 0}
    <div class="saved-images">
      <h3>Saved Images</h3>
      <div class="image-grid">
        {#each savedImages as img}
          <div 
            class="saved-image {selectedImageId === img.id ? 'selected' : ''}" 
            on:click={() => selectSavedImage(img.id)}
          >
            <img src={img.url} alt={img.name} />
            <div class="image-info">
              <span class="image-name">{img.name}</span>
              <span class="image-date">{new Date(img.date).toLocaleDateString()}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Upload New Image Section -->
  <div class="upload-section">
    <h3>Upload New Image</h3>
    <input type="file" accept="image/png,image/jpg,image/jpeg" on:change={handleFileInput} />

    {#if imagePreview}
      <div class="preview-container">
        <img src={imagePreview} alt="Preview" />
        <p>New image selected</p>
      </div>
    {/if}
  </div>

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

  <!-- Rest of the result section remains the same -->
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
  <!-- Spinner overlay -->
  {#if showSpinner}
    <div class="spinner-overlay">
      <div class="spinner"></div>
      <p>Loading your animation...</p>
    </div>
  {/if}
  
  <!-- Image or placeholder -->
  {#if imageError}
    <div class="image-placeholder">
      <p>Image couldn't be loaded, but animations are still running!</p>
    </div>
  {:else}
    <img 
      src={result.imageUrl} 
      alt="Uploaded drawing" 
      class="main-image"
      on:load={handleImageLoad}
      on:error={handleImageError}
      crossorigin="anonymous"
    />
  {/if}

  <!-- ✅ SVG Overlay for Animation - Place this code here -->
<!-- ✅ SVG Overlay for Animation - Use detected feature positions -->
<!-- ✅ SVG Overlay for Animation - Simplified approach -->
<svg class="animation-overlay" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">
  <!-- Debug text to verify SVG is rendering -->
  <text x="10" y="20" fill="rgba(0,0,255,0.7)" font-size="12">
    Debug: SVG Overlay Active
  </text>
  
  <!-- Arms - use simple lines positioned based on detected features -->
  <g id="arms-group" data-animation-target="arms" style="opacity: 0;">
    <line 
      id="arm-left" 
      x1={detectedFeatures?.arms?.left?.x || 100} 
      y1={detectedFeatures?.arms?.left?.y || 180}
      x2={detectedFeatures?.arms?.left?.x + 40 || 140} 
      y2={detectedFeatures?.arms?.left?.y || 180}
      stroke="rgba(0,255,0,0)" 
      stroke-width="8" 
      stroke-linecap="round"
      data-animation-target="arms" />
    <line 
      id="arm-right" 
      x1={detectedFeatures?.arms?.right?.x || 300} 
      y1={detectedFeatures?.arms?.right?.y || 180}
      x2={detectedFeatures?.arms?.right?.x + 40 || 340} 
      y2={detectedFeatures?.arms?.right?.y || 180}
      stroke="rgba(0,255,0,0)" 
      stroke-width="8" 
      stroke-linecap="round"
      data-animation-target="arms" />
  </g>

  <!-- Eyes - positioned based on detected features -->
  <g id="eyes-group" data-animation-target="eyes" style="opacity: 0;">
    <circle class="eye" id="eye-left" cx={detectedFeatures?.eyes?.left?.x || 170} cy={detectedFeatures?.eyes?.left?.y || 140} r="8" fill="rgba(0,0,0,0)" />
    <circle class="eye" id="eye-right" cx={detectedFeatures?.eyes?.right?.x || 230} cy={detectedFeatures?.eyes?.right?.y || 140} r="8" fill="rgba(0,0,0,0)" />
  </g>

  <!-- Iris - positioned based on detected features -->
  <g id="iris-group" data-animation-target="iris" style="opacity: 0;">
    <circle id="iris-left" cx={detectedFeatures?.eyes?.left?.x || 170} cy={detectedFeatures?.eyes?.left?.y || 140} r="4" fill="rgba(0,0,255,0)" />
    <circle id="iris-right" cx={detectedFeatures?.eyes?.right?.x || 230} cy={detectedFeatures?.eyes?.right?.y || 140} r="4" fill="rgba(0,0,255,0)" />
  </g>

  <!-- Hair - simple line -->
  <line 
    id="hair-main" 
    x1="130" y1="100"
    x2="260" y2="110"
    stroke="rgba(139,69,19,0)"
    stroke-width="6"
    stroke-linecap="round"
    data-animation-target="hair" 
    style="opacity: 0;" />

  <!-- Dynamic elements based on animation plan -->
  {#each result.animationPlan as anim, i}
    {#if anim.target.includes('vine') && anim.action === 'grow'}
      <!-- Vine -->
      <path 
        id="vine-path"
        d="M250,300 C260,280 280,270 300,280 C320,290 330,310 320,330"
        stroke="rgba(0,150,0,0)"
        stroke-width="6"
        fill="none"
        data-animation-target={anim.target} />
    {:else if !anim.target.includes('arms') && !anim.target.includes('hair') && !anim.target.includes('eye') && !anim.target.includes('iris')}
      <!-- Generic animated element for other targets -->
      <g data-animation-target={anim.target} id="generic-{i}" style="opacity: 0;">
        <circle 
          cx={120 + (i * 80)} 
          cy={200 + (i * 40)} 
          r="25" 
          fill="rgba(255,150,100,0)"
          stroke="rgba(255,150,100,0)"
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

        <!-- Rest of the result section remains the same -->
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
    width: 400px;
    height: 400px;
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
  
  .spinner-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.8);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 10;
  }
  
  .spinner {
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    border-top: 4px solid #007acc;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .image-placeholder {
    width: 100%;
    height: 400px;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #f5f5f5;
    color: #666;
    text-align: center;
    padding: 1rem;
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
  
  /* New styles for saved images */
  .saved-images {
    margin: 2rem 0;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
  }
  
  .image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }
  
  .saved-image {
    border: 2px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .saved-image:hover {
    transform: translateY(-5px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
  }
  
  .saved-image.selected {
    border-color: #007acc;
    box-shadow: 0 0 0 3px rgba(0, 122, 204, 0.3);
  }
  
  .saved-image img {
    width: 100%;
    height: 100px;
    object-fit: cover;
    display: block;
  }
  
  .image-info {
    padding: 0.5rem;
    background: white;
  }
  
  .image-name {
    display: block;
    font-weight: 500;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .image-date {
    display: block;
    font-size: 0.8rem;
    color: #666;
  }
  
  .upload-section {
    margin: 2rem 0;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
  }
  
  .preview-container {
    margin-top: 1rem;
    text-align: center;
  }
  
  .preview-container img {
    max-width: 300px;
    max-height: 200px;
    border: 1px solid #ddd;
    border-radius: 4px;
  }
  
  .preview-container p {
    margin-top: 0.5rem;
    color: #666;
  }
</style>

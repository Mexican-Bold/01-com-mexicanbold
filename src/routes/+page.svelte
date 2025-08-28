<script>
  // ✅ Import animejs - fallback to CDN if not installed
  let anime;
  let imageLoaded = false;
  let pendingAnimations = null;
  let showSpinner = false;
  let imageBlobUrl = null;
  let savedImages = []; // Store previously uploaded images
  
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

  // Try to load image as blob to bypass CORS
  async function loadImageAsBlob(imageUrl) {
    try {
      showSpinner = true;
      
      // If the imageUrl is from imagedelivery.net, convert it to use our proxy
      let proxyUrl = imageUrl;
      if (imageUrl.includes('imagedelivery.net')) {
        // Extract the image ID from the URL
        const urlParts = imageUrl.split('/');
        const imageId = urlParts[urlParts.length - 2]; // The ID is before 'public'
        proxyUrl = `/image/${imageId}/public`; // Use relative path
      }
      
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      imageBlobUrl = blobUrl;
      showSpinner = false;
      return blobUrl;
    } catch (error) {
      console.error('Error loading image as blob:', error);
      imageError = true;
      showSpinner = false;
      return null;
    }
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
        formData.append("image", resizedImage, image.name); // Use original filename
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
        
        if (result.imageUrl) {
          const blobUrl = await loadImageAsBlob(result.imageUrl);
          if (blobUrl) {
            result.imageUrl = blobUrl;
          }
        }
        
        setTimeout(checkImageStatus, 100);
        
        setTimeout(() => {
          if (pendingAnimations && anime) {
            console.log('Running animations as fallback after timeout');
            imageLoaded = true;
            animateFromPlan(pendingAnimations);
            pendingAnimations = null;
          }
        }, 3000);
        
        if (imageLoaded && anime) {
          setTimeout(() => {
            animateFromPlan(pendingAnimations);
            pendingAnimations = null;
          }, 500);
        }
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

  // Animation function (same as before)
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
    
    // Enhanced debugging
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

i<main>
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

          <!-- SVG Overlay remains the same -->
          <svg class="animation-overlay" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">
            <!-- SVG content remains the same -->
          </svg>
        </div>

        <!-- Rest of the result section remains the same -->
      </div>
    {/if}
  {/if}
</main>

<style>
  /* Existing styles remain the same */
  
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
  
  /* Rest of the existing styles remain the same */
</style>

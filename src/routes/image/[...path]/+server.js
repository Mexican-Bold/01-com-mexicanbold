// src/routes/image/[...path]/+server.js

export async function GET({ params, platform }) {
  try {
    const { path } = params;
    console.log('Image proxy request for path:', path);
    
    const pathParts = path.split('/');
    console.log('Path parts:', pathParts);
    
    if (pathParts.length < 2) {
      console.error('Invalid image path:', path);
      return new Response('Invalid image path', { status: 400 });
    }
    
    const imageId = pathParts[0];
    const variant = pathParts[1] || 'full'; // Default to 'full' variant
    console.log('Extracted image ID:', imageId);
    console.log('Using variant:', variant);
    
    // Get credentials from platform.env
    const accountId = platform?.env?.ACCOUNT_ID;
    const imageDeliveryId = platform?.env?.IMAGE_DELIVERY_ID;
    const apiToken = platform?.env?.IMAGES_API_TOKEN;
    
    if (!accountId) {
      console.error('ACCOUNT_ID not configured');
      return new Response('Account ID not configured', { status: 500 });
    }
    
    if (!imageDeliveryId) {
      console.error('IMAGE_DELIVERY_ID not configured');
      return new Response('Image Delivery ID not configured', { status: 500 });
    }
    
    if (!apiToken) {
      console.error('IMAGES_API_TOKEN not configured');
      return new Response('API token not configured', { status: 500 });
    }
    
    console.log('Using Account ID:', accountId);
    console.log('Using Image Delivery ID:', imageDeliveryId);
    
    // First, verify the image exists using the API
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${imageId}`;
    console.log('Checking image existence at:', apiUrl);
    
    const apiResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    });
    
    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      console.error('Image not found in API:', errorData);
      return new Response(JSON.stringify({
        error: 'Image not found',
        details: errorData.errors
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const imageData = await apiResponse.json();
    console.log('Image verified:', imageData.result.id);
    
    // Check if the requested variant exists
    if (!imageData.result.variants.includes(variant)) {
      console.error('Variant not found:', variant);
      console.log('Available variants:', imageData.result.variants);
      return new Response(JSON.stringify({
        error: 'Variant not found',
        requestedVariant: variant,
        availableVariants: imageData.result.variants
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Construct the Cloudflare Images URL using the Image Delivery ID
    const imageUrl = `https://imagedelivery.net/${imageDeliveryId}/${imageId}/${variant}`;
    console.log('Fetching image from:', imageUrl);
    
    // Fetch the image from Cloudflare Images
    const imageResponse = await fetch(imageUrl);
    console.log('Image response status:', imageResponse.status);
    
    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error('Image not found:', imageUrl, 'Status:', imageResponse.status);
      console.error('Error response:', errorText);
      return new Response(`Image not found: ${errorText}`, { status: 404 });
    }
    
    // Create a new response with CORS headers
    const response = new Response(imageResponse.body, {
      status: imageResponse.status,
      statusText: imageResponse.statusText,
      headers: imageResponse.headers
    });
    
    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    
    console.log('Successfully served image with CORS headers');
    return response;
  } catch (error) {
    console.error('Error in image proxy:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

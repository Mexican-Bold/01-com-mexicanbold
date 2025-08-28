// src/routes/image/[...path]/+server.js

export async function GET({ params, platform }) {
  const { path } = params;
  const pathParts = path.split('/');
  
  if (pathParts.length < 2) {
    return new Response('Invalid image path', { status: 400 });
  }
  
  const imageId = pathParts[0]; // The first part of the path is the image ID
  
  // Get ACCOUNT_ID from platform.env (Cloudflare Workers environment)
  const accountId = platform?.env?.ACCOUNT_ID;
  
  if (!accountId) {
    console.error('Account ID not configured');
    return new Response('Account ID not configured', { status: 500 });
  }
  
  // Construct the Cloudflare Images URL
  const imageUrl = `https://imagedelivery.net/${accountId}/${imageId}/public`;
  
  try {
    // Fetch the image from Cloudflare Images
    const imageResponse = await fetch(imageUrl);
    
    if (!imageResponse.ok) {
      console.error('Image not found:', imageUrl);
      return new Response('Image not found', { status: 404 });
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
    
    return response;
  } catch (error) {
    console.error('Error fetching image:', error);
    return new Response('Error fetching image', { status: 500 });
  }
}

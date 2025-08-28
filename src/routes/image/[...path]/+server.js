// src/routes/image/[...path]/+server.js

export async function GET({ params, platform }) {
  try {
    const { path } = params;
    console.log('Image proxy request for path:', path);
    
    const pathParts = path.split('/');
    
    if (pathParts.length < 2) {
      console.error('Invalid image path:', path);
      return new Response('Invalid image path', { status: 400 });
    }
    
    const imageId = pathParts[0];
    
    // For now, hardcode the account ID to test
    const accountId = "477082f5c9678c608889bd8f03f7b807";
    
    console.log('Using Account ID:', accountId);
    console.log('Image ID:', imageId);
    
    // Construct the Cloudflare Images URL
    const imageUrl = `https://imagedelivery.net/${accountId}/${imageId}/public`;
    console.log('Fetching image from:', imageUrl);
    
    // Fetch the image from Cloudflare Images
    const imageResponse = await fetch(imageUrl);
    
    if (!imageResponse.ok) {
      console.error('Image not found:', imageUrl, 'Status:', imageResponse.status);
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
    
    console.log('Successfully served image with CORS headers');
    return response;
  } catch (error) {
    console.error('Error in image proxy:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

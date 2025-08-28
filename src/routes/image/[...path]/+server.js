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
    console.log('Extracted image ID:', imageId);
    
    // Get ACCOUNT_ID from platform.env
    const accountId = platform?.env?.ACCOUNT_ID;
    
    if (!accountId) {
      console.error('Account ID not configured');
      return new Response('Account ID not configured', { status: 500 });
    }
    
    console.log('Using Account ID:', accountId);
    
    // Try different URL formats
    const urlsToTry = [
      `https://imagedelivery.net/${accountId}/${imageId}/public`,
      `https://imagedelivery.net/${accountId}/${imageId}`,
      `https://imagedelivery.net/${accountId}/${imageId}/w=400,h=400`
    ];
    
    console.log('Will try these URLs:', urlsToTry);
    
    let imageResponse = null;
    let workingUrl = null;
    
    for (const url of urlsToTry) {
      console.log('Trying URL:', url);
      try {
        const response = await fetch(url);
        console.log('Response status for', url, ':', response.status);
        
        if (response.ok) {
          imageResponse = response;
          workingUrl = url;
          console.log('Working URL found:', workingUrl);
          break;
        }
      } catch (error) {
        console.error('Error fetching', url, ':', error);
      }
    }
    
    if (!imageResponse) {
      console.error('None of the URLs worked');
      return new Response(JSON.stringify({
        error: 'Image not found with any URL format',
        triedUrls: urlsToTry,
        imageId: imageId,
        accountId: accountId
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
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
    
    console.log('Successfully served image with CORS headers from:', workingUrl);
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

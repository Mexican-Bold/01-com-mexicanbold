// src/routes/test/+server.js

export async function GET({ platform }) {
  try {
    // Get ACCOUNT_ID from platform.env
    const accountId = platform?.env?.ACCOUNT_ID;
    
    return new Response(JSON.stringify({
      message: "Test endpoint working",
      accountId: accountId,
      accountIdLength: accountId ? accountId.length : 0,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

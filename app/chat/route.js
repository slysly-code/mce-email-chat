// Replace the callMCPServer function in your chat/route.js with this:

async function callMCPServer(action, params) {
  const MCE_SERVER_URL = process.env.MCE_SERVER_URL || 'https://salesforce-mce-api.fly.dev';
  const MCE_API_KEY = process.env.MCE_API_KEY;

  console.log('=== MCE API CALL ===');
  console.log('URL:', `${MCE_SERVER_URL}/api/${action}`);
  console.log('Has API Key:', !!MCE_API_KEY);

  if (!MCE_API_KEY) {
    console.error('❌ MCE_API_KEY is not set!');
    return { 
      error: 'MCE configuration missing',
      details: 'MCE_API_KEY not configured'
    };
  }

  try {
    const url = `${MCE_SERVER_URL}/api/${action}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': MCE_API_KEY,  // Your server doesn't check this but let's keep it
      },
      body: JSON.stringify(params),
    });
    
    console.log('MCE Response Status:', response.status);
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('MCE Error:', responseText);
      return { 
        error: `MCE Server error: ${response.status}`,
        details: responseText
      };
    }

    const data = JSON.parse(responseText);
    console.log('✅ MCE Success:', data);
    
    // Extract the actual result if it's wrapped
    if (data.result) {
      try {
        return JSON.parse(data.result);
      } catch {
        return data;
      }
    }
    
    return data;

  } catch (error) {
    console.error('❌ MCE call failed:', error);
    return { 
      error: 'MCE connection failed',
      details: error.message
    };
  }
}

// AND change the email creation call from:
// mceResult = await callMCPServer('email/create', {...});

// TO:
mceResult = await callMCPServer('tool/build_email', {
  name: emailName,
  subject: emailSubject,
  nlpCommand: emailContent,  // This is the key field for your server!
  template: 'custom'
});
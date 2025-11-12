const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function getRefreshToken() {
  console.log('\n=== Reddit OAuth2 Refresh Token Generator ===\n');
  
  const clientId = await question('Enter your Client ID: ');
  const clientSecret = await question('Enter your Client Secret: ');
  const redirectUriInput = await question('Enter your Redirect URI (default: http://localhost:8080): ');
  const redirectUri = redirectUriInput.trim() || 'http://localhost:8080';
  
  // Step 1: Generate authorization URL
  const state = Math.random().toString(36).substring(7);
  const scope = 'submit';
  const authUrl = `https://www.reddit.com/api/v1/authorize?client_id=${clientId}&response_type=code&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}&duration=permanent&scope=${scope}`;
  
  console.log('\n=== Step 1: Authorize ===');
  console.log('Open this URL in your browser:');
  console.log(authUrl);
  console.log('\nAfter authorizing, you will be redirected to your redirect URI.');
  console.log('Copy the "code" parameter from the URL.\n');
  
  const code = await question('Enter the authorization code from the redirect URL: ');
  
  // Step 2: Exchange code for tokens
  console.log('\n=== Step 2: Getting tokens ===');
  
  try {
    const response = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      }),
      {
        auth: {
          username: clientId,
          password: clientSecret
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'RedditTokenGetter/1.0'
        }
      }
    );
    
    console.log('\n=== Success! ===');
    console.log('Access Token:', response.data.access_token);
    console.log('Refresh Token:', response.data.refresh_token);
    console.log('\nAdd this refresh_token to your accounts.json file:');
    console.log(response.data.refresh_token);
    
  } catch (error) {
    console.error('\n=== Error ===');
    console.error('Failed to get tokens:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  rl.close();
}

getRefreshToken();


require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseTxtFile } = require('./utils/parser');
const { uploadPost, uploadAllPosts } = require('./utils/reddit');
const { initDatabase, getAllAccounts, getAccountById, addAccount, updateAccount, deleteAccount } = require('./db/database');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Initialize database on startup
initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Routes

// Get all accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await getAllAccounts();
    res.json(accounts);
  } catch (error) {
    console.error('Error getting accounts:', error);
    res.status(500).json({ error: error.message || 'Failed to get accounts' });
  }
});

// Get account by ID
app.get('/api/accounts/:id', async (req, res) => {
  try {
    const account = await getAccountById(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(account);
  } catch (error) {
    console.error('Error getting account:', error);
    res.status(500).json({ error: error.message || 'Failed to get account' });
  }
});

// Add new account
app.post('/api/accounts/add', async (req, res) => {
  try {
    const { name, client_id, client_secret, refresh_token, txt_file, proxy_host, proxy_port, proxy_username, proxy_password, proxy_type } = req.body;

    if (!name || !client_id || !client_secret || !refresh_token) {
      return res.status(400).json({ error: 'Missing required fields: name, client_id, client_secret, refresh_token' });
    }

    const newAccount = await addAccount(
      name, 
      client_id, 
      client_secret, 
      refresh_token, 
      txt_file || '',
      proxy_host || null,
      proxy_port || null,
      proxy_username || null,
      proxy_password || null,
      proxy_type || 'http'
    );
    res.json({ success: true, account: newAccount });
  } catch (error) {
    console.error('Error adding account:', error);
    res.status(500).json({ error: error.message || 'Failed to add account' });
  }
});

// Update account
app.put('/api/accounts/:id', async (req, res) => {
  try {
    const { name, client_id, client_secret, refresh_token, txt_file, proxy_host, proxy_port, proxy_username, proxy_password, proxy_type } = req.body;
    const account = await updateAccount(
      req.params.id, 
      name, 
      client_id, 
      client_secret, 
      refresh_token, 
      txt_file || '',
      proxy_host || null,
      proxy_port || null,
      proxy_username || null,
      proxy_password || null,
      proxy_type || 'http'
    );
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({ success: true, account });
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: error.message || 'Failed to update account' });
  }
});

// Delete account
app.delete('/api/accounts/:id', async (req, res) => {
  try {
    const account = await deleteAccount(req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: error.message || 'Failed to delete account' });
  }
});

// OAuth: Generate authorization URL
app.post('/api/auth/generate-url', (req, res) => {
  try {
    const { client_id, client_secret, redirect_uri } = req.body;

    if (!client_id || !redirect_uri) {
      return res.status(400).json({ error: 'Missing required fields: client_id, redirect_uri' });
    }

    // Generate state for security
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: client_id,
      response_type: 'code',
      state: state,
      redirect_uri: redirect_uri,
      duration: 'permanent',
      scope: 'submit identity read'
    });

    const authUrl = `https://www.reddit.com/api/v1/authorize?${params.toString()}`;

    res.json({ auth_url: authUrl, state: state });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: error.message || 'Failed to generate authorization URL' });
  }
});

// OAuth: Exchange authorization code for tokens
app.post('/api/auth/exchange-code', async (req, res) => {
  try {
    const { client_id, client_secret, redirect_uri, code } = req.body;

    if (!client_id || !client_secret || !redirect_uri || !code) {
      return res.status(400).json({ error: 'Missing required fields: client_id, client_secret, redirect_uri, code' });
    }

    const response = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirect_uri
      }),
      {
        auth: {
          username: client_id,
          password: client_secret
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'RedditPostAPI/1.0'
        }
      }
    );

    res.json({
      success: true,
      refresh_token: response.data.refresh_token,
      access_token: response.data.access_token
    });
  } catch (error) {
    console.error('Error exchanging code:', error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data?.error || error.message || 'Failed to exchange code for token'
    });
  }
});

// Upload and parse TXT file
app.post('/api/posts/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const posts = parseTxtFile(filePath);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({ posts });
  } catch (error) {
    console.error('Error parsing file:', error);
    res.status(500).json({ error: error.message || 'Failed to parse file' });
  }
});

// Post single post
app.post('/api/posts/single', async (req, res) => {
  let post = null;
  let accountId = null;
  
  try {
    const { post: postData, accountId: id } = req.body;
    post = postData;
    accountId = id;

    if (!post || !accountId) {
      return res.status(400).json({ error: 'Missing post data or accountId' });
    }

    const result = await uploadPost(post, accountId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error uploading post:', error);
    
    // Include post and accountId in error response for better debugging
    res.status(500).json({
      error: error.message || 'Failed to upload post',
      post: post,
      accountId: accountId,
      redditResponse: error.redditResponse
    });
  }
});

// Post all posts
app.post('/api/posts/all', async (req, res) => {
  let posts = null;
  let accountId = null;
  
  try {
    const { posts: postsData, accountId: id, delayFrom, delayUpTo } = req.body;
    posts = postsData;
    accountId = id;

    if (!posts || !Array.isArray(posts) || !accountId) {
      return res.status(400).json({ error: 'Missing posts array or accountId' });
    }

    const validPosts = posts.filter(p => p.isValid);
    
    if (validPosts.length === 0) {
      return res.status(400).json({ error: 'No valid posts to upload' });
    }

    // Start uploading in background
    uploadAllPosts(
      posts,
      accountId,
      delayFrom || 0,
      delayUpTo || 0,
      (progress) => {
        // Progress callback can be used for WebSocket/SSE in future
        console.log(`Progress: ${progress.current}/${progress.total} - ${progress.post.title}`);
      }
    ).then(result => {
      console.log('Upload completed:', result);
    }).catch(err => {
      console.error('Upload failed:', err);
    });

    res.json({
      success: true,
      message: `Started uploading ${validPosts.length} posts`,
      total: validPosts.length
    });
  } catch (error) {
    console.error('Error starting upload:', error);
    
    // Include posts and accountId in error response
    res.status(500).json({
      error: error.message || 'Failed to start upload',
      posts: posts,
      accountId: accountId
    });
  }
});

// Get upload progress (for future use with WebSocket/SSE)
app.get('/api/posts/progress/:uploadId', (req, res) => {
  const { getUploadProgress } = require('./utils/reddit');
  const progress = getUploadProgress(req.params.uploadId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Upload progress not found' });
  }
  
  res.json(progress);
});

// Check proxy IP
app.post('/api/proxy/check-ip', async (req, res) => {
  try {
    const { accountId } = req.body;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Missing accountId' });
    }
    
    const account = await getAccountById(accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Check if proxy is configured
    if (!account.proxy_host || !account.proxy_port) {
      return res.status(400).json({ error: 'No proxy configured for this account' });
    }
    
    // Build proxy URL
    const proxyType = account.proxy_type || 'http';
    let proxyUrl = `${proxyType}://`;
    if (account.proxy_username && account.proxy_password) {
      proxyUrl += `${account.proxy_username}:${account.proxy_password}@`;
    }
    proxyUrl += `${account.proxy_host}:${account.proxy_port}`;
    
    console.log(`Checking proxy IP for account ${accountId}:`);
    console.log(`Proxy URL: ${proxyType}://${account.proxy_host}:${account.proxy_port} (auth: ${account.proxy_username ? 'yes' : 'no'})`);
    
    // Make request through proxy to check IP
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const { HttpProxyAgent } = require('http-proxy-agent');
    const { SocksProxyAgent } = require('socks-proxy-agent');
    
    // For HTTPS URLs, we need HttpsProxyAgent even if proxy type is "http"
    // Try multiple IP checking services
    const checkUrls = [
      'https://api.ipify.org?format=json',
      'http://api.ipify.org?format=json',
      'https://icanhazip.com',
      'http://icanhazip.com'
    ];
    
    let httpAgent, httpsAgent;
    if (account.proxy_type === 'socks5') {
      const agent = new SocksProxyAgent(proxyUrl);
      httpAgent = agent;
      httpsAgent = agent;
    } else {
      // For HTTPS requests through HTTP proxy, use HttpsProxyAgent
      // For HTTP requests, use HttpProxyAgent
      httpsAgent = new HttpsProxyAgent(proxyUrl);
      httpAgent = new HttpProxyAgent(proxyUrl);
    }
    
    let lastError = null;
    
    // Try each URL until one works
    for (const checkUrl of checkUrls) {
      try {
        const isHttps = checkUrl.startsWith('https://');
        const agent = isHttps ? httpsAgent : httpAgent;
        
        const response = await axios.get(checkUrl, {
          httpAgent: httpAgent,
          httpsAgent: httpsAgent,
          timeout: 15000,
          validateStatus: (status) => status < 500 // Accept 2xx, 3xx, 4xx
        });
        
        // Parse IP from response
        let ip = null;
        if (checkUrl.includes('ipify')) {
          ip = response.data?.ip || response.data;
        } else {
          // For icanhazip.com, response is plain text
          ip = typeof response.data === 'string' ? response.data.trim() : response.data?.ip;
        }
        
        if (ip) {
          return res.json({
            success: true,
            ip: ip,
            proxy: {
              host: account.proxy_host,
              port: account.proxy_port,
              type: account.proxy_type || 'http'
            }
          });
        }
      } catch (error) {
        lastError = error;
        console.log(`Failed to check IP with ${checkUrl}:`, error.message);
        // Continue to next URL
        continue;
      }
    }
    
    // If all URLs failed
    console.error('Error checking proxy IP - all services failed:', lastError);
    res.status(500).json({
      error: 'Failed to check proxy IP',
      message: lastError?.message || 'All IP checking services failed. Please verify your proxy settings.',
      details: lastError?.response?.data || lastError?.message
    });
  } catch (error) {
    console.error('Error in check proxy IP:', error);
    res.status(500).json({ error: error.message || 'Failed to check proxy IP' });
  }
});

// OAuth Callback Handler - catches the redirect from Reddit
app.get('/oauth/callback', (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;
  
  if (error) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reddit OAuth Error</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .error {
            background: #ffebee;
            border: 2px solid #f44336;
            border-radius: 8px;
            padding: 20px;
            color: #c62828;
          }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>❌ Authorization Error</h2>
          <p><strong>Error:</strong> ${error}</p>
          <p>Please try again.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  if (code) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reddit OAuth Success</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .success {
            background: #e8f5e9;
            border: 2px solid #4caf50;
            border-radius: 8px;
            padding: 20px;
            color: #2e7d32;
          }
          .code-box {
            background: white;
            border: 2px solid #4caf50;
            border-radius: 4px;
            padding: 15px;
            margin: 15px 0;
            font-family: monospace;
            font-size: 16px;
            word-break: break-all;
            color: #1b5e20;
          }
          .instructions {
            background: #fff3e0;
            border: 1px solid #ff9800;
            border-radius: 4px;
            padding: 15px;
            margin-top: 20px;
            color: #e65100;
          }
          button {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 10px;
          }
          button:hover {
            background: #5568d3;
          }
        </style>
      </head>
      <body>
        <div class="success">
          <h2>✅ Authorization Successful!</h2>
          <p>Copy this authorization code:</p>
          <div class="code-box" id="codeBox">${code}</div>
          <button onclick="copyCode()">Copy Code</button>
          <div class="instructions">
            <strong>Next steps:</strong>
            <ol>
              <li>Copy the code above (or click the button)</li>
              <li>Go back to the Reddit Post Manager</li>
              <li>Paste the code in the "Authorization Code" field</li>
              <li>Click "Exchange Code for Token"</li>
            </ol>
          </div>
        </div>
        <script>
          function copyCode() {
            const codeBox = document.getElementById('codeBox');
            const text = codeBox.textContent;
            navigator.clipboard.writeText(text).then(() => {
              alert('Code copied to clipboard!');
            }).catch(() => {
              // Fallback for older browsers
              const textarea = document.createElement('textarea');
              textarea.value = text;
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
              alert('Code copied to clipboard!');
            });
          }
        </script>
      </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reddit OAuth Callback</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
        </style>
      </head>
      <body>
        <h2>Reddit OAuth Callback</h2>
        <p>Waiting for authorization...</p>
      </body>
      </html>
    `);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


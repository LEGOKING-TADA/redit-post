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
    const { name, client_id, client_secret, refresh_token, txt_file } = req.body;

    if (!name || !client_id || !client_secret || !refresh_token) {
      return res.status(400).json({ error: 'Missing required fields: name, client_id, client_secret, refresh_token' });
    }

    const newAccount = await addAccount(name, client_id, client_secret, refresh_token, txt_file || '');
    res.json({ success: true, account: newAccount });
  } catch (error) {
    console.error('Error adding account:', error);
    res.status(500).json({ error: error.message || 'Failed to add account' });
  }
});

// Update account
app.put('/api/accounts/:id', async (req, res) => {
  try {
    const { name, client_id, client_secret, refresh_token, txt_file } = req.body;
    const account = await updateAccount(req.params.id, name, client_id, client_secret, refresh_token, txt_file || '');
    
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


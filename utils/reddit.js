const axios = require('axios');
const { getAccountById } = require('../db/database');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

// In-memory storage for upload progress
const uploadProgress = {};

// Cache for proxy agents (reuse agents for better performance)
const agentCache = new Map();

// Get proxy agents for account (with caching)
function getProxyAgents(account) {
  if (!account || !account.proxy_host || !account.proxy_port) {
    return { httpAgent: null, httpsAgent: null };
  }
  
  // Create cache key
  const cacheKey = `${account.id}-${account.proxy_type || 'http'}-${account.proxy_host}-${account.proxy_port}`;
  
  // Check cache first
  if (agentCache.has(cacheKey)) {
    return agentCache.get(cacheKey);
  }
  
  // Build proxy URL
  const proxyType = account.proxy_type || 'http';
  let proxyUrl = `${proxyType}://`;
  if (account.proxy_username && account.proxy_password) {
    proxyUrl += `${account.proxy_username}:${account.proxy_password}@`;
  }
  proxyUrl += `${account.proxy_host}:${account.proxy_port}`;
  
  // Create appropriate agents with timeout settings
  const agentOptions = {
    timeout: 30000, // 30 second timeout
    keepAlive: true, // Reuse connections
    keepAliveMsecs: 1000
  };
  
  let agents;
  if (proxyType === 'socks5') {
    const agent = new SocksProxyAgent(proxyUrl, agentOptions);
    agents = { httpAgent: agent, httpsAgent: agent };
  } else {
    // For HTTPS requests through HTTP proxy, use HttpsProxyAgent
    // For HTTP requests, use HttpProxyAgent
    agents = {
      httpAgent: new HttpProxyAgent(proxyUrl, agentOptions),
      httpsAgent: new HttpsProxyAgent(proxyUrl, agentOptions)
    };
  }
  
  // Cache agents
  agentCache.set(cacheKey, agents);
  
  return agents;
}

async function getAccessToken(accountId) {
  try {
    const account = await getAccountById(accountId);

    if (!account) {
      throw new Error('Account not found');
    }

    const { client_id, client_secret, refresh_token } = account;

    // Validate credentials
    if (!client_id || !client_secret) {
      throw new Error('Missing client_id or client_secret in account configuration');
    }

    if (!refresh_token || refresh_token === 'YOUR_REFRESH_TOKEN') {
      throw new Error('Invalid or missing refresh_token. Please get a valid refresh_token using get-refresh-token.js');
    }

    // Get proxy agents if configured
    const { httpAgent, httpsAgent } = getProxyAgents(account);
    const axiosConfig = {
      auth: {
        username: client_id,
        password: client_secret
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RedditPostAPI/1.0'
      }
    };
    
    // Add proxy agents if available
    if (httpAgent && httpsAgent) {
      axiosConfig.httpAgent = httpAgent;
      axiosConfig.httpsAgent = httpsAgent;
      console.log(`[Proxy] Using proxy for access token: ${account.proxy_type || 'http'}://${account.proxy_host}:${account.proxy_port}`);
    } else {
      console.log('[Proxy] No proxy configured - using direct connection for access token');
    }

    // Get access token using refresh token
    const response = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      }),
      {
        ...axiosConfig,
        timeout: 30000 // 30 second timeout for proxy connections
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    
    // Check if it's a proxy connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message?.includes('proxy')) {
      throw new Error(`Proxy connection failed: ${error.message}. Please check your proxy settings (${account.proxy_host}:${account.proxy_port})`);
    }
    
    // Provide more specific error messages
    if (error.response?.status === 401) {
      throw new Error('Unauthorized: Invalid refresh_token, client_id, or client_secret. Please verify your credentials and get a new refresh_token if needed.');
    }
    
    if (error.response?.data) {
      throw new Error(`Failed to get access token: ${JSON.stringify(error.response.data)}`);
    }
    
    throw new Error(error.message || 'Failed to get access token');
  }
}

async function uploadPost(post, accountId) {
  try {
    const account = await getAccountById(accountId);
    const accessToken = await getAccessToken(accountId);

    // Validate URL if provided
    if (post.url) {
      try {
        const urlObj = new URL(post.url);
        // Check if URL is valid (has protocol and host)
        if (!urlObj.protocol || !urlObj.hostname) {
          throw new Error(`Invalid URL format: ${post.url}`);
        }
      } catch (e) {
        throw new Error(`Invalid URL: ${post.url}. Please provide a valid URL (e.g., https://www.redgifs.com/watch/...)`);
      }
    }

    const postData = {
      sr: post.subreddit,
      title: post.title,
      kind: post.url ? 'link' : 'self',
      ...(post.url && { url: post.url }),
      ...(post.flair_id && { flair_id: post.flair_id }),
      ...(post.flair_text && !post.flair_id && { flair_text: post.flair_text })
    };

    // Get proxy agents if configured
    const { httpAgent, httpsAgent } = getProxyAgents(account);
    const axiosConfig = {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RedditPostAPI/1.0 by /u/yourusername'
      }
    };
    
    // Add proxy agents if available
    if (httpAgent && httpsAgent) {
      axiosConfig.httpAgent = httpAgent;
      axiosConfig.httpsAgent = httpsAgent;
      console.log(`[Proxy] Using proxy for post submission: ${account.proxy_type || 'http'}://${account.proxy_host}:${account.proxy_port}`);
      console.log(`[Proxy] Posting to r/${post.subreddit} via proxy`);
    } else {
      console.log('[Proxy] No proxy configured - using direct connection for post submission');
    }

    const response = await axios.post(
      'https://oauth.reddit.com/api/submit',
      new URLSearchParams(postData),
      {
        ...axiosConfig,
        timeout: 30000 // 30 second timeout for proxy connections
      }
    );

    // Log full response for debugging
    console.log('=== Reddit API Response ===');
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Full Response Data:', JSON.stringify(response.data, null, 2));
    console.log('Response Type:', typeof response.data);
    console.log('Has json property:', !!response.data.json);
    console.log('==========================');

    // Check if response structure is different (jquery array format)
    if (!response.data.json) {
      console.error('Response does not have json property. Full response:', response.data);
      
      // Check if it's a jquery array response (Reddit sometimes returns this for both success and errors)
      if (response.data.jquery && Array.isArray(response.data.jquery)) {
        // Check if success is true - this means the post was successful!
        if (response.data.success === true) {
          // Extract redirect URL from jquery array
          const jqueryData = response.data.jquery;
          let redirectUrl = null;
          
          // Look for redirect URL in the jquery array
          // Pattern: [index, index, "attr", "redirect"], [index, index, "call", [URL]]
          for (let i = 0; i < jqueryData.length; i++) {
            const item = jqueryData[i];
            if (Array.isArray(item) && item.length >= 4) {
              // Check for redirect pattern
              if (item[2] === 'call' && Array.isArray(item[3]) && item[3].length > 0) {
                const callArg = item[3][0];
                if (typeof callArg === 'string' && callArg.includes('reddit.com') && callArg.includes('/comments/')) {
                  redirectUrl = callArg;
                  break;
                }
              }
            }
          }
          
          // Extract post ID from redirect URL
          let postId = null;
          let postName = null;
          if (redirectUrl) {
            const match = redirectUrl.match(/\/comments\/([^\/]+)\//);
            if (match) {
              postId = match[1];
              postName = `t3_${postId}`;
            }
          }
          
          return {
            success: true,
            postId: postId,
            name: postName,
            url: redirectUrl || 'N/A'
          };
        }
        
        // If success is false, it's an error
        if (response.data.success === false) {
          // Try to extract error message from jquery array
          const jqueryData = response.data.jquery;
          let errorMessage = 'Unknown error from Reddit API';
          
          // Look for error messages in the jquery array
          for (let i = 0; i < jqueryData.length; i++) {
            const item = jqueryData[i];
            if (Array.isArray(item) && item.length >= 4) {
              // Check for text content (error messages)
              if (item[2] === 'text' && Array.isArray(item[3]) && item[3].length > 0) {
                const textContent = item[3][0];
                if (typeof textContent === 'string' && textContent.length > 10 && 
                    (textContent.includes('error') || textContent.includes('Error') || 
                     textContent.includes('must') || textContent.includes('required'))) {
                  errorMessage = textContent;
                  break;
                }
              }
            }
          }
          
          if (errorMessage === 'Unknown error from Reddit API') {
            errorMessage = 'Reddit API returned an error. The subreddit may have restrictions or the post may be invalid.';
          }
          
          const error = new Error(errorMessage);
          error.redditResponse = response.data;
          throw error;
        }
      }
      
      const error = new Error('Unexpected response format from Reddit API. Check console for details.');
      error.redditResponse = response.data;
      throw error;
    }

    // Reddit API returns errors in json.errors array
    if (response.data.json?.errors && response.data.json.errors.length > 0) {
      const errorCode = response.data.json.errors[0][0];
      const errorMessage = response.data.json.errors[0][1] || response.data.json.errors[0][0];
      
      // Common error codes and their meanings
      let detailedMessage = errorMessage;
      if (errorCode === 'SUBREDDIT_NOTALLOWED') {
        detailedMessage = `You are not allowed to post in r/${post.subreddit}. You may need to join the subreddit or meet karma requirements.`;
      } else if (errorCode === 'SUBREDDIT_NOEXIST') {
        detailedMessage = `Subreddit r/${post.subreddit} does not exist.`;
      } else if (errorCode === 'RATELIMIT') {
        detailedMessage = `Rate limit exceeded. Please wait before posting again.`;
      } else if (errorCode === 'ALREADY_SUB') {
        detailedMessage = `This link has already been submitted to r/${post.subreddit}.`;
      } else if (errorMessage && errorMessage.toLowerCase().includes('url')) {
        detailedMessage = `Invalid URL: ${post.url}. Please check that the URL is valid and accessible.`;
      } else if (errorMessage && errorMessage.toLowerCase().includes('domain')) {
        detailedMessage = `Domain not allowed: The URL domain may not be allowed in this subreddit.`;
      }
      
      throw new Error(detailedMessage);
    }

    // Check if submission was successful
    if (!response.data.json?.data) {
      // Log the full response to see what we got
      console.error('No data in response. Full response:', JSON.stringify(response.data, null, 2));
      
      // Check if there's a ratelimit message
      if (response.data.ratelimit) {
        const error = new Error(`Rate limit: You can post again in ${Math.ceil(response.data.ratelimit)} seconds.`);
        error.redditResponse = response.data;
        throw error;
      }
      
      const error = new Error('Failed to submit post - no data returned. The subreddit may have restrictions (karma, account age, verification).');
      error.redditResponse = response.data;
      throw error;
    }

    return {
      success: true,
      postId: response.data.json.data.id,
      name: response.data.json.data.name,
      url: `https://reddit.com${response.data.json.data.permalink}`
    };
  } catch (error) {
    console.error('Error uploading post:', error.response?.data || error.message);
    
    // Check if it's a proxy connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message?.includes('proxy')) {
      throw new Error(`Proxy connection failed: ${error.message}. Please check your proxy settings (${account.proxy_host}:${account.proxy_port})`);
    }
    
    // Extract error message from Reddit API response
    if (error.response?.data?.json?.errors) {
      const errorMessage = error.response.data.json.errors[0][1] || error.response.data.json.errors[0][0];
      throw new Error(errorMessage);
    }
    
    throw new Error(error.response?.data?.message || error.message || 'Failed to upload post');
  }
}

function getRandomDelay(delayFrom, delayUpTo) {
  const from = parseInt(delayFrom) || 0;
  const upTo = parseInt(delayUpTo) || 0;
  if (from >= upTo) return from;
  return Math.floor(Math.random() * (upTo - from + 1)) + from;
}

async function uploadAllPosts(posts, accountId, delayFrom, delayUpTo, progressCallback) {
  const validPosts = posts.filter(p => p.isValid);
  const uploadId = Date.now().toString();
  
  uploadProgress[uploadId] = {
    total: validPosts.length,
    current: 0,
    completed: [],
    failed: []
  };

  for (let i = 0; i < validPosts.length; i++) {
    try {
      const result = await uploadPost(validPosts[i], accountId);
      uploadProgress[uploadId].current = i + 1;
      uploadProgress[uploadId].completed.push({
        post: validPosts[i],
        result
      });

      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: validPosts.length,
          post: validPosts[i]
        });
      }

      // Add delay before next post (except for last one)
      if (i < validPosts.length - 1) {
        const delay = getRandomDelay(delayFrom, delayUpTo);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }
    } catch (error) {
      uploadProgress[uploadId].failed.push({
        post: validPosts[i],
        error: error.message
      });
    }
  }

  return uploadProgress[uploadId];
}

function getUploadProgress(uploadId) {
  return uploadProgress[uploadId] || null;
}

module.exports = {
  uploadPost,
  uploadAllPosts,
  getUploadProgress
};


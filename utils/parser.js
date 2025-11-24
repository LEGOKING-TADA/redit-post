const fs = require('fs');

function parseTxtFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(line => line.trim());
  
  const posts = [];
  let currentPost = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines (they separate posts)
    if (line === '') {
      if (currentPost) {
        // Validate and add post
        const hasValidSubreddit = currentPost.subreddit && currentPost.subreddit.trim().length > 0;
        const hasValidTitle = currentPost.title && currentPost.title.trim().length > 0;
        
        if (hasValidSubreddit) {
          posts.push({
            id: posts.length + 1,
            subreddit: currentPost.subreddit.trim(),
            title: currentPost.title ? currentPost.title.trim() : '',
            url: currentPost.url ? currentPost.url.trim() : null,
            flair_id: currentPost.flair_id || null,
            flair_text: currentPost.flair_text || null,
            hasUrl: !!(currentPost.url && currentPost.url.trim().length > 0),
            hasTitle: hasValidTitle,
            hasSubreddit: hasValidSubreddit,
            isValid: hasValidSubreddit && hasValidTitle
          });
        }
        currentPost = null;
      }
      continue;
    }

    // Skip comment lines (start with #)
    if (line.startsWith('#')) {
      continue;
    }

    // Check if line is a standalone comment/note (starts with [)
    if (line.startsWith('[') && (line.includes('USE ONLY PHOTO') || 
        line.includes('[NO NSFW]') || 
        line.includes('USE ONLY PHOTO'))) {
      // Skip these lines
      continue;
    }

    // Check if subreddit has comments in brackets (e.g., "EmoAltFashion[NO NSFW]")
    if (!currentPost) {
      // Extract subreddit name (remove anything in brackets)
      const subreddit = line.replace(/\[.*?\]/g, '').trim();
      currentPost = {
        subreddit: subreddit,
        title: null,
        url: null,
        flair_id: null,
        flair_text: null
      };
    }
    // Second line is title
    else if (!currentPost.title) {
      // Only set title if line is not empty and not just whitespace
      if (line && line.trim().length > 0) {
        currentPost.title = line.trim();
      } else {
        // Empty title - mark it but continue
        currentPost.title = '';
      }
    }
    // Third line is URL (if it starts with http)
    else if (!currentPost.url && line.startsWith('http')) {
      currentPost.url = line;
    }
    // Fourth line can be flair (format: "flair:FlairName" or "flair_id:abc123")
    else if (line.startsWith('flair:')) {
      currentPost.flair_text = line.replace('flair:', '').trim();
    }
    else if (line.startsWith('flair_id:')) {
      currentPost.flair_id = line.replace('flair_id:', '').trim();
    }
    // If we already have subreddit, title, and url, skip additional lines
  }

  // Add last post if exists
  if (currentPost) {
    const hasValidSubreddit = currentPost.subreddit && currentPost.subreddit.trim().length > 0;
    const hasValidTitle = currentPost.title && currentPost.title.trim().length > 0;
    
    if (hasValidSubreddit) {
      posts.push({
        id: posts.length + 1,
        subreddit: currentPost.subreddit.trim(),
        title: currentPost.title ? currentPost.title.trim() : '',
        url: currentPost.url ? currentPost.url.trim() : null,
        flair_id: currentPost.flair_id || null,
        flair_text: currentPost.flair_text || null,
        hasUrl: !!(currentPost.url && currentPost.url.trim().length > 0),
        hasTitle: hasValidTitle,
        hasSubreddit: hasValidSubreddit,
        isValid: hasValidSubreddit && hasValidTitle
      });
    }
  }

  return posts;
}

module.exports = { parseTxtFile };


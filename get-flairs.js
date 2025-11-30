#!/usr/bin/env node

/**
 * Script to get flairs for a subreddit using snoowrap
 * Usage: node get-flairs.js <subreddit>
 * 
 * Environment variables (or .env file):
 * - REDDIT_CLIENT_ID
 * - REDDIT_CLIENT_SECRET
 * - REDDIT_USERNAME
 * - REDDIT_PASSWORD
 * 
 * Or it will try to read from accounts.json or database
 */

require('dotenv').config();
const fs = require('fs');

// Check if snoowrap is installed
let snoowrap;
try {
  snoowrap = require('snoowrap');
} catch (error) {
  console.error('❌ Error: snoowrap is not installed.');
  console.error('   Please install it by running: npm install snoowrap');
  process.exit(1);
}

async function getCredentials() {
  // Try environment variables first
  let credentials = {
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD
  };
  
  // If not found, try accounts.json
  if (!credentials.clientId || !credentials.clientSecret || !credentials.username || !credentials.password) {
    try {
      if (fs.existsSync('./accounts.json')) {
        const accountsData = JSON.parse(fs.readFileSync('./accounts.json', 'utf8'));
        const accounts = Array.isArray(accountsData) ? accountsData : (accountsData.accounts || []);
        if (accounts.length > 0) {
          const firstAccount = accounts[0];
          credentials.clientId = credentials.clientId || firstAccount.client_id;
          credentials.clientSecret = credentials.clientSecret || firstAccount.client_secret;
          credentials.username = credentials.username || firstAccount.username;
          credentials.password = credentials.password || firstAccount.password;
          console.log(`[Info] Using credentials from accounts.json (account: ${firstAccount.name || 'first account'})\n`);
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }
  
  // If still not found, try database
  if (!credentials.clientId || !credentials.clientSecret || !credentials.username || !credentials.password) {
    try {
      const { getAllAccounts } = require('./db/database');
      const accounts = await getAllAccounts();
      if (accounts.length > 0) {
        const firstAccount = accounts[0];
        credentials.clientId = credentials.clientId || firstAccount.client_id;
        credentials.clientSecret = credentials.clientSecret || firstAccount.client_secret;
        credentials.username = credentials.username || firstAccount.username;
        credentials.password = credentials.password || firstAccount.password;
        console.log(`[Info] Using credentials from database (account: ${firstAccount.name || 'first account'})\n`);
      }
    } catch (error) {
      // Ignore database errors
    }
  }
  
  // Validate required fields
  if (!credentials.clientId || !credentials.clientSecret) {
    console.error('❌ Missing required credentials:');
    console.error('   - REDDIT_CLIENT_ID (or in accounts.json/database)');
    console.error('   - REDDIT_CLIENT_SECRET (or in accounts.json/database)');
    console.error('\n   Options:');
    console.error('   1. Create a .env file with REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET');
    console.error('   2. Create accounts.json file (see accounts.json.example)');
    console.error('   3. Set environment variables before running');
    process.exit(1);
  }
  
  if (!credentials.username || !credentials.password) {
    console.error('❌ Missing Reddit username or password:');
    console.error('   - REDDIT_USERNAME');
    console.error('   - REDDIT_PASSWORD');
    console.error('\n   Options:');
    console.error('   1. Add username and password to accounts.json');
    console.error('   2. Set REDDIT_USERNAME and REDDIT_PASSWORD in .env file');
    console.error('   3. Set environment variables before running');
    console.error('\n   Note: For security, use .env file instead of accounts.json for passwords.');
    process.exit(1);
  }
  
  return credentials;
}

// Λειτουργία για να πάρεις flairs ενός subreddit
async function getSubredditFlairs(subredditName) {
  try {
    const credentials = await getCredentials();
    
    // Δημιούργησε instance του Reddit client
    const r = new snoowrap({
      userAgent: 'RedditPostAPI-FlairChecker/1.0 (by /u/redditpostapi)',
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      username: credentials.username,
      password: credentials.password
    });
    
    console.log('='.repeat(80));
    console.log('🔍 REDDIT FLAIR CHECKER');
    console.log('='.repeat(80));
    console.log(`\n[Checking] r/${subredditName}...\n`);
    
    // Try direct API call to get flairs
    let flairTemplates = [];
    
    try {
      // Method 1: Direct API call to link_flair endpoint
      const response = await r.oauthRequest({
        uri: `r/${subredditName}/api/link_flair.json`,
        method: 'get'
      });
      
      if (Array.isArray(response)) {
        flairTemplates = response;
      } else if (response.choices) {
        flairTemplates = response.choices;
      } else if (response.length) {
        flairTemplates = response;
      }
    } catch (error) {
      // Method 2: Try about.json endpoint
      try {
        const about = await r.oauthRequest({
          uri: `r/${subredditName}/about.json`,
          method: 'get'
        });
        
        if (about.data && about.data.link_flair_templates) {
          flairTemplates = about.data.link_flair_templates;
        }
      } catch (error2) {
        // Method 3: Try POST to link_flair
        try {
          const response = await r.oauthRequest({
            uri: 'api/link_flair',
            method: 'post',
            form: { sr: subredditName }
          });
          
          if (Array.isArray(response)) {
            flairTemplates = response;
          } else if (response.choices) {
            flairTemplates = response.choices;
          }
        } catch (error3) {
          throw new Error(`Could not fetch flairs: ${error.message}`);
        }
      }
    }
    
    if (flairTemplates.length === 0) {
      console.log('❌ No flairs found for this subreddit.');
      console.log('   This subreddit may not have flairs, or they may not be exposed via API.\n');
      return;
    }
    
    console.log(`✅ Διαθέσιμα flairs για r/${subredditName}:`);
    console.log(`   Total: ${flairTemplates.length}\n`);
    console.log('='.repeat(80));
    
    flairTemplates.forEach((flair, index) => {
      // Handle different response formats
      const flairText = flair.text || flair.flair_text || flair[0] || '(empty)';
      const flairId = flair.id || flair.flair_template_id || flair[1] || '(no ID)';
      const bgColor = flair.background_color || flair.background_color_hex || 'None';
      const textColor = flair.text_color || flair.text_color_hex || 'Default';
      const cssClass = flair.css_class || '(none)';
      const textEditable = flair.text_editable !== undefined ? flair.text_editable : false;
      const modOnly = flair.mod_only !== undefined ? flair.mod_only : false;
      
      console.log(`\n${index + 1}. Text: "${flairText}"`);
      console.log(`   ID: ${flairId}`);
      console.log(`   Background Color: ${bgColor}`);
      console.log(`   Text Color: ${textColor}`);
      console.log(`   CSS Class: ${cssClass}`);
      console.log(`   Text Editable: ${textEditable ? 'Yes' : 'No'}`);
      console.log(`   Mod Only: ${modOnly ? 'Yes' : 'No'}`);
      
      if (flairId && flairId !== '(no ID)') {
        console.log(`   \n   💡 Use in TXT file: flair_id:${flairId}`);
      }
      if (flairText && flairText !== '(empty)') {
        console.log(`   Or use: flair:${flairText}`);
      }
    });
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📋 SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Subreddit: r/${subredditName}`);
    console.log(`Total Flairs: ${flairTemplates.length}`);
    console.log(`\n💡 To use in your TXT file, add one of these lines:`);
    if (flairTemplates.length > 0) {
      const firstFlair = flairTemplates[0];
      const flairId = firstFlair.id || firstFlair.flair_template_id;
      if (flairId) {
        console.log(`   flair_id:${flairId}`);
      }
      if (firstFlair.text) {
        console.log(`   flair:${firstFlair.text}`);
      }
    }
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ Σφάλμα:', error.message);
    
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('   Authentication failed. Please check your credentials.');
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      console.error('   Access forbidden. This subreddit may be private or restricted.');
    } else if (error.message.includes('404') || error.message.includes('Not Found')) {
      console.error('   Subreddit not found. Check the spelling.');
    } else if (error.message.includes('rate limit')) {
      console.error('   Rate limit exceeded. Please wait before trying again.');
    }
    
    process.exit(1);
  }
}

async function main() {
  try {
    // Get subreddit from command line argument
    const subreddit = process.argv[2];
    
    if (!subreddit) {
      console.error('❌ Usage: node get-flairs.js <subreddit>');
      console.error('   Example: node get-flairs.js youngslutsforoldpervs');
      process.exit(1);
    }
    
    const subredditName = subreddit.trim().replace(/^r\//, ''); // Remove r/ if present
    
    // Get flairs
    await getSubredditFlairs(subredditName);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { getSubredditFlairs };


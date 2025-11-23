// Test script to verify proxy is being used for Reddit API calls
const { getAccountById } = require('./db/database');
const { getProxyAgents } = require('./utils/reddit');

async function testProxy() {
  try {
    // Get first account
    const accounts = await require('./db/database').getAllAccounts();
    
    if (accounts.length === 0) {
      console.log('❌ No accounts found');
      return;
    }
    
    const account = accounts[0];
    console.log(`\n📋 Testing proxy for account: ${account.name}`);
    console.log(`   ID: ${account.id}`);
    
    // Check proxy configuration
    if (!account.proxy_host || !account.proxy_port) {
      console.log('⚠️  No proxy configured for this account');
      return;
    }
    
    console.log(`\n🔧 Proxy Configuration:`);
    console.log(`   Type: ${account.proxy_type || 'http'}`);
    console.log(`   Host: ${account.proxy_host}`);
    console.log(`   Port: ${account.proxy_port}`);
    console.log(`   Username: ${account.proxy_username || 'none'}`);
    console.log(`   Password: ${account.proxy_password ? '***' : 'none'}`);
    
    // Get proxy agents
    const { httpAgent, httpsAgent } = getProxyAgents(account);
    
    if (!httpAgent || !httpsAgent) {
      console.log('❌ Failed to create proxy agents');
      return;
    }
    
    console.log(`\n✅ Proxy agents created successfully`);
    console.log(`   HTTP Agent: ${httpAgent.constructor.name}`);
    console.log(`   HTTPS Agent: ${httpsAgent.constructor.name}`);
    
    // Test connection through proxy
    const axios = require('axios');
    console.log(`\n🌐 Testing connection through proxy...`);
    
    try {
      const response = await axios.get('https://api.ipify.org?format=json', {
        httpAgent: httpAgent,
        httpsAgent: httpsAgent,
        timeout: 10000
      });
      
      console.log(`✅ Success! Proxy IP: ${response.data.ip}`);
      console.log(`\n✅ Proxy is working correctly!`);
      console.log(`   All Reddit API requests will use this proxy.`);
    } catch (error) {
      console.log(`❌ Failed to connect through proxy: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data)}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run test
testProxy().then(() => {
  console.log('\n');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


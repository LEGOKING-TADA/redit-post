// Migration script to migrate from accounts.json to PostgreSQL
// Run this once if you have existing accounts.json file

const fs = require('fs');
const { initDatabase, addAccount } = require('./database');

async function migrate() {
  try {
    console.log('Initializing database...');
    await initDatabase();
    
    // Check if accounts.json exists
    if (!fs.existsSync('accounts.json')) {
      console.log('No accounts.json file found. Nothing to migrate.');
      return;
    }
    
    // Read accounts.json
    const accountsData = fs.readFileSync('accounts.json', 'utf8');
    const accounts = JSON.parse(accountsData);
    
    if (!accounts.accounts || accounts.accounts.length === 0) {
      console.log('No accounts found in accounts.json. Nothing to migrate.');
      return;
    }
    
    console.log(`Found ${accounts.accounts.length} accounts to migrate...`);
    
    // Migrate each account
    for (const account of accounts.accounts) {
      try {
        await addAccount(
          account.name,
          account.client_id,
          account.client_secret,
          account.refresh_token,
          account.txt_file || ''
        );
        console.log(`✓ Migrated account: ${account.name}`);
      } catch (error) {
        console.error(`✗ Failed to migrate account ${account.name}:`, error.message);
      }
    }
    
    console.log('Migration completed!');
    console.log('You can now delete accounts.json if you want (it has been backed up)');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();



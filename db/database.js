const { Pool } = require('pg');

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com') || process.env.DATABASE_URL?.includes('amazonaws.com') ? {
    rejectUnauthorized: false
  } : false
});

// Test database connection
pool.on('connect', () => {
  console.log('Database connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Initialize database - create table if it doesn't exist
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        client_id VARCHAR(255) NOT NULL,
        client_secret VARCHAR(255) NOT NULL,
        refresh_token TEXT NOT NULL,
        txt_file VARCHAR(255) DEFAULT '',
        proxy_host VARCHAR(255) DEFAULT NULL,
        proxy_port INTEGER DEFAULT NULL,
        proxy_username VARCHAR(255) DEFAULT NULL,
        proxy_password VARCHAR(255) DEFAULT NULL,
        proxy_type VARCHAR(10) DEFAULT 'http',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add proxy columns if they don't exist (for existing databases)
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='proxy_host') THEN
          ALTER TABLE accounts ADD COLUMN proxy_host VARCHAR(255) DEFAULT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='proxy_port') THEN
          ALTER TABLE accounts ADD COLUMN proxy_port INTEGER DEFAULT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='proxy_username') THEN
          ALTER TABLE accounts ADD COLUMN proxy_username VARCHAR(255) DEFAULT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='proxy_password') THEN
          ALTER TABLE accounts ADD COLUMN proxy_password VARCHAR(255) DEFAULT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='proxy_type') THEN
          ALTER TABLE accounts ADD COLUMN proxy_type VARCHAR(10) DEFAULT 'http';
        END IF;
      END $$;
    `);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Get all accounts
async function getAllAccounts() {
  try {
    const result = await pool.query('SELECT * FROM accounts ORDER BY id ASC');
    return result.rows;
  } catch (error) {
    console.error('Error getting accounts:', error);
    throw error;
  }
}

// Get account by ID
async function getAccountById(id) {
  try {
    const result = await pool.query('SELECT * FROM accounts WHERE id = $1', [id]);
    return result.rows[0];
  } catch (error) {
    console.error('Error getting account:', error);
    throw error;
  }
}

// Add new account
async function addAccount(name, client_id, client_secret, refresh_token, txt_file = '', proxy_host = null, proxy_port = null, proxy_username = null, proxy_password = null, proxy_type = 'http') {
  try {
    const result = await pool.query(
      'INSERT INTO accounts (name, client_id, client_secret, refresh_token, txt_file, proxy_host, proxy_port, proxy_username, proxy_password, proxy_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [name, client_id, client_secret, refresh_token, txt_file, proxy_host, proxy_port, proxy_username, proxy_password, proxy_type]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error adding account:', error);
    throw error;
  }
}

// Update account
async function updateAccount(id, name, client_id, client_secret, refresh_token, txt_file, proxy_host = null, proxy_port = null, proxy_username = null, proxy_password = null, proxy_type = 'http') {
  try {
    const result = await pool.query(
      'UPDATE accounts SET name = $1, client_id = $2, client_secret = $3, refresh_token = $4, txt_file = $5, proxy_host = $6, proxy_port = $7, proxy_username = $8, proxy_password = $9, proxy_type = $10, updated_at = CURRENT_TIMESTAMP WHERE id = $11 RETURNING *',
      [name, client_id, client_secret, refresh_token, txt_file, proxy_host, proxy_port, proxy_username, proxy_password, proxy_type, id]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error updating account:', error);
    throw error;
  }
}

// Delete account
async function deleteAccount(id) {
  try {
    const result = await pool.query('DELETE FROM accounts WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  } catch (error) {
    console.error('Error deleting account:', error);
    throw error;
  }
}

module.exports = {
  pool,
  initDatabase,
  getAllAccounts,
  getAccountById,
  addAccount,
  updateAccount,
  deleteAccount
};


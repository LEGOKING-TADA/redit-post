# Reddit Post Manager

A web application for posting to Reddit via API with support for multiple accounts.

## Features

- Upload and parse TXT files with post data
- Support for multiple Reddit accounts
- Validation for missing URLs/text
- Single post upload or bulk upload with random delays
- Progress tracking for bulk uploads
- Simple HTML/JS/CSS frontend
- Node.js/Express backend

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up PostgreSQL database:
   - **For Render.com**: Create a PostgreSQL database in Render dashboard
   - **For local development**: Install PostgreSQL and create a database
   - Get your database connection string (DATABASE_URL)

3. Configure environment variables:
   - Create `.env` file (or set in Render dashboard):
   ```
   DATABASE_URL=postgresql://user:password@host:port/database
   PORT=3000
   ```

4. The database will be automatically initialized on first run
   - Table `accounts` will be created automatically
   - No manual migration needed

5. Get Reddit API credentials:
   - Go to https://www.reddit.com/prefs/apps
   - Create a new app (script type)
   - Get client_id and client_secret
   - Get refresh_token using OAuth2 flow (via frontend or get-refresh-token.js)

6. Start the server:
```bash
npm start
```

7. Open http://localhost:3000 in your browser

8. Add accounts via the frontend:
   - Click "+ Add Account" button
   - Follow the instructions in the modal
   - Accounts are saved to PostgreSQL database

## TXT File Format

The TXT file should follow this format:
```
Subreddit
Title
URL (optional)
[empty line]
Subreddit
Title
URL (optional)
...
```

Example:
```
GothWhoress
NNN isn't an option when I'm in your feed
https://www.redgifs.com/watch/halfdimpledacornwoodpecker

dommes
wanna smash or pass this
https://www.redgifs.com/watch/imaginarymindlessclam
```

## Usage

1. Select an account from the dropdown
2. Upload a TXT file
3. Click "Parse File" to see parsed posts
4. Review posts and their validation status
5. Click "Post" for individual posts or "Post All" for bulk upload
6. Set delay range (from/to) for bulk uploads
7. Monitor progress during bulk uploads

## Database

The application uses PostgreSQL to store accounts. The database is automatically initialized on first run.

### Migration from accounts.json

If you have existing accounts in `accounts.json`, you can migrate them:

```bash
node db/migrate.js
```

This will:
- Create the database table if it doesn't exist
- Migrate all accounts from `accounts.json` to PostgreSQL
- Keep your `accounts.json` file intact (backup)

### Render.com Setup

1. Create a PostgreSQL database in Render dashboard
2. Copy the Internal Database URL
3. Set `DATABASE_URL` environment variable in Render dashboard
4. Deploy your application
5. The database will be initialized automatically

**Note**: Make sure to set `DATABASE_URL` in Render dashboard under Environment Variables.

## Notes

- Missing URLs or titles will show warnings
- You can still post even with warnings (user choice)
- Bulk uploads use random delays between the specified range
- Progress is shown as "Posting X/Y..."
- Accounts are stored in PostgreSQL database (not in JSON file)

## License

ISC


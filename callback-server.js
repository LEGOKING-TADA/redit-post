const http = require('http');
const url = require('url');

const PORT = 8080;

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const code = parsedUrl.query.code;
  const state = parsedUrl.query.state;
  const error = parsedUrl.query.error;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

  if (error) {
    res.end(`
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
    return;
  }

  if (code) {
    res.end(`
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
        </style>
      </head>
      <body>
        <div class="success">
          <h2>✅ Authorization Successful!</h2>
          <p>Copy this authorization code:</p>
          <div class="code-box">${code}</div>
          <div class="instructions">
            <strong>Next steps:</strong>
            <ol>
              <li>Copy the code above</li>
              <li>Go back to the terminal where you ran the script</li>
              <li>Paste the code when prompted</li>
            </ol>
          </div>
        </div>
      </body>
      </html>
    `);
  } else {
    res.end(`
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

server.listen(PORT, () => {
  console.log(`\n✅ Callback server running on http://localhost:${PORT}`);
  console.log('This server will display your authorization code.\n');
});



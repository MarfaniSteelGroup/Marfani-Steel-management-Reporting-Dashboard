// Minimal static file server for the Marfani Steels Reporting Deck.
// Works locally (npm start) and on Render as a Web Service.
const express = require('express');
const path = require('path');
const fs = require('fs');

const ADMIN_USERNAME = 'Admin';
const ADMIN_PASSWORD = 'Marfani@12345';
const AUTH_COOKIE = 'marfani_admin_session';
const USERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf8'));

const app = express();
const PORT = process.env.PORT || 3000;

function buildLoginPage(errorMessage = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Marfani Steels Admin Login</title>
  <style>
    :root {
      --bg: #12161b;
      --panel: #181d24;
      --panel-border: #323d48;
      --ink: #eef0f2;
      --muted: #8b95a1;
      --amber: #e08a3e;
      --amber-soft: rgba(224,138,62,0.12);
      --red: #cc5f56;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--bg);
      color: var(--ink);
      font-family: Arial, sans-serif;
    }
    .login-shell {
      width: min(420px, calc(100vw - 24px));
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 28px 24px;
      box-shadow: 0 18px 40px rgba(0,0,0,0.25);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      letter-spacing: 0.04em;
    }
    p {
      margin: 0 0 20px;
      color: var(--muted);
      font-size: 14px;
    }
    form {
      display: grid;
      gap: 16px;
    }
    label {
      display: grid;
      gap: 8px;
      font-size: 13px;
      color: #dfe5eb;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid var(--panel-border);
      background: #10161b;
      color: var(--ink);
      font-size: 15px;
    }
    input:focus {
      outline: 2px solid var(--amber);
      outline-offset: 1px;
      border-color: var(--amber);
    }
    button {
      border: 0;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 15px;
      font-weight: 600;
      color: #111a1d;
      background: var(--amber);
      cursor: pointer;
    }
    .error {
      min-height: 20px;
      color: var(--red);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="login-shell">
    <h1>Admin Login</h1>
    <p>Marfani Steels Management Reporting Deck</p>
    <form method="POST" action="/login">
      <label>
        Admin ID
        <input name="username" type="text" value="Admin" required />
      </label>
      <label>
        Password
        <input name="password" type="password" value="Marfani@12345" required />
      </label>
      <div class="error">${errorMessage}</div>
      <button type="submit">Login</button>
    </form>
  </div>
</body>
</html>`;
}

app.use(express.urlencoded({ extended: false }));

function getSessionUser(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader.split(';').map(item => item.trim()).find(item => item.startsWith(`${AUTH_COOKIE}=`));
  if (!cookie) return null;

  const encoded = decodeURIComponent(cookie.split('=')[1]);
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');
    const account = USERS[username];
    if (!account || account.password !== password) return null;
    return { username, role: account.role };
  } catch (error) {
    return null;
  }
}

app.get('/login', (req, res) => {
  if (getSessionUser(req)) return res.redirect('/');
  res.type('html').send(buildLoginPage());
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const account = USERS[username];
  if (account && account.password === password) {
    const value = Buffer.from(`${username}:${password}`).toString('base64');
    res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax`);
    return res.redirect('/');
  }

  res.status(401).type('html').send(buildLoginPage('Invalid admin ID or password.'));
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`);
  res.redirect('/login');
});

app.use((req, res, next) => {
  if (req.path === '/login' || req.path === '/logout') return next();
  if (getSessionUser(req)) return next();
  return res.redirect('/login');
});

app.get('/api/session', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, username: user.username, role: user.role });
});

app.use(express.static(path.join(__dirname)));

// SPA fallback: any unknown route serves the shell so client-side hash routing works.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Marfani Steels Reporting Deck running on port ${PORT}`);
});

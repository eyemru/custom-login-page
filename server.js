require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session config
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.isAuthenticated) return next();
  res.redirect('/login');
}

// Routes
app.get('/', requireAuth, (req, res) => {
  res.render('home', { user: req.session.user });
});

app.get('/login', (req, res) => {
  if (req.session.isAuthenticated) return res.redirect('/');
  res.render('login', { error: null });
});

// All other routes will be implemented in routes/auth.js
app.use('/', require('./routes/auth'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

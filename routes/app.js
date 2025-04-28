const express = require('express');
const router = express.Router();

// Middleware to require authentication
const requireAuth = (req, res, next) => {
  if (req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/login');
};

// Protected dashboard route
router.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard', { 
    user: req.session.user,
    tokens: req.session.tokens
  });
});

// Protected profile route
router.get('/profile', requireAuth, (req, res) => {
  res.render('profile', { 
    user: req.session.user,
    tokens: req.session.tokens
  });
});

module.exports = router;

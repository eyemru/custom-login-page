const { OktaAuth } = require('@okta/okta-auth-js');

// Initialize Okta Auth client
const oktaAuth = new OktaAuth({
  issuer: process.env.OKTA_ISSUER,
  clientId: process.env.OKTA_CLIENT_ID,
  clientSecret: process.env.OKTA_CLIENT_SECRET,
  redirectUri: `${process.env.APP_BASE_URL}/login/callback`,
  scopes: ['openid', 'email', 'profile'],
  pkce: true,
  testing: {
    disableHttpsCheck: process.env.OKTA_TESTING_DISABLEHTTPSCHECK === 'true'
  }
});

module.exports = { oktaAuth };

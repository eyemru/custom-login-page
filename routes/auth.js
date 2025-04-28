const express = require('express');
const router = express.Router();
const { OktaAuth, IdxStatus } = require('@okta/okta-auth-js');

// Minimal Okta Auth JS SDK config
const oktaAuth = new OktaAuth({
  issuer: process.env.OKTA_ISSUER,
  clientId: process.env.OKTA_CLIENT_ID,
  redirectUri: process.env.APP_BASE_URL + '/callback', // Not used for manual flow, but required
  scopes: ['openid', 'email', 'profile'],
  pkce: true,
  testing: { disableHttpsCheck: process.env.OKTA_TESTING_DISABLEHTTPSCHECK === 'true' }
});

// LOGIN POST: Username/password authentication
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const transaction = await oktaAuth.idx.authenticate({ username, password });
    if (transaction.status === IdxStatus.SUCCESS) {
      // Authenticated, no MFA required
      req.session.isAuthenticated = true;
      req.session.user = { email: username, authenticatedAt: new Date().toISOString() };
      req.session.transaction = null;
      return res.redirect('/');
    } else if (transaction.status === IdxStatus.PENDING) {
      req.session.transaction = transaction;
      // Check if user must enroll in MFA
      if (transaction.nextStep?.name === 'select-authenticator-enroll') {
        return res.redirect('/enroll-mfa');
      } else {
        // Otherwise, prompt for MFA verification
        return res.redirect('/verify-mfa');
      }
    } else {
      // Show error from Okta if present
      let error = 'Authentication failed.';
      if (transaction.messages && transaction.messages.length > 0) {
        error = transaction.messages[0].message;
      }
      return res.render('login', { error });
    }
  } catch (err) {
    return res.render('login', { error: err.message });
  }
});

// ENROLL MFA GET: Show enrollment page
router.get('/enroll-mfa', (req, res) => {
  const transaction = req.session.transaction;
  if (!transaction) return res.redirect('/login');
  res.render('enroll-mfa', { error: null });
});

// ENROLL MFA POST: Enroll user in Okta Verify (final: accept enroll-poll)
router.post('/enroll-mfa', async (req, res) => {
  const transaction = req.session.transaction;
  if (!transaction) return res.redirect('/login');
  try {
    console.log('[DEBUG] enroll-mfa transaction:', JSON.stringify(transaction, null, 2));
    if (!transaction.nextStep) {
      return res.render('enroll-mfa', { error: 'No next step in Okta transaction. Please try logging in again.' });
    }
    if (transaction.nextStep.name === 'challenge-authenticator') {
      return res.redirect('/verify-mfa');
    }
    const inputs = transaction.nextStep.inputs || [];
    const authenticatorInput = inputs.find(i => i.name === 'authenticator' && Array.isArray(i.options));
    if (!authenticatorInput || !authenticatorInput.options) {
      return res.render('enroll-mfa', { error: 'No enrollment options returned by Okta. Step: ' + (transaction.nextStep.name || 'unknown') + '. Please try logging in again or contact your administrator.' });
    }
    const neededToProceed = transaction.neededToProceed || [];
    const enrollStep = neededToProceed.find(step => step.name === 'select-authenticator-enroll');
    let oktaVerifyObj = null;
    if (enrollStep && enrollStep.value) {
      const authenticatorObj = enrollStep.value.find(v => v.name === 'authenticator');
      if (authenticatorObj && authenticatorObj.options) {
        oktaVerifyObj = authenticatorObj.options.find(opt => opt.label && opt.label.toLowerCase().includes('okta verify'));
      }
    }
    if (!oktaVerifyObj) {
      return res.render('enroll-mfa', { error: 'Could not find Okta Verify option in enrollment.' });
    }
    let oktaVerifyId = null;
    if (oktaVerifyObj.value && oktaVerifyObj.value.form && oktaVerifyObj.value.form.value) {
      const idField = oktaVerifyObj.value.form.value.find(f => f.name === 'id');
      oktaVerifyId = idField && idField.value;
    } else if (oktaVerifyObj.value && oktaVerifyObj.value.id) {
      oktaVerifyId = oktaVerifyObj.value.id;
    } else if (typeof oktaVerifyObj.value === 'string') {
      oktaVerifyId = oktaVerifyObj.value;
    }
    if (!oktaVerifyId) {
      return res.render('enroll-mfa', { error: 'Could not determine Okta Verify authenticator ID.' });
    }
    // Step 1: Select authenticator
    const selectPayload = {
      step: 'select-authenticator-enroll',
      authenticator: { id: oktaVerifyId },
      stateHandle: transaction.context.stateHandle
    };
    console.log('[DEBUG] enroll-mfa selectPayload:', JSON.stringify(selectPayload, null, 2));
    const selectResp = await oktaAuth.idx.proceed(selectPayload);
    console.log('[DEBUG] enroll-mfa selectResp:', JSON.stringify(selectResp, null, 2));
    // Accept enroll-poll as valid QR code step
    if (
      selectResp.nextStep &&
      (selectResp.nextStep.name === 'enroll-authenticator' || selectResp.nextStep.name === 'enroll-poll')
    ) {
      req.session.transaction = selectResp;
      return res.render('enroll-qr', { transaction: selectResp, error: null });
    } else {
      req.session.transaction = selectResp;
      return res.render('enroll-qr', {
        transaction: selectResp,
        error: 'Invalid enrollment state. Please restart the enrollment process. Debug info: ' + JSON.stringify({ nextStep: selectResp.nextStep, availableSteps: selectResp.availableSteps, neededToProceed: selectResp.neededToProceed }, null, 2)
      });
    }
  } catch (err) {
    console.log('[DEBUG] enroll-mfa error:', err);
    return res.render('enroll-mfa', { error: err.message });
  }
});

// VERIFY MFA GET: Show code entry form
router.get('/verify-mfa', (req, res) => {
  const transaction = req.session.transaction;
  if (!transaction) return res.redirect('/login');
  // Debug: log nextStep
  console.log('[DEBUG] /verify-mfa GET nextStep:', transaction.nextStep);
  if (!transaction.nextStep) {
    return res.redirect('/login');
  }
  if (transaction.nextStep.name === 'select-authenticator-enroll') {
    // User needs to enroll in MFA
    return res.redirect('/enroll-mfa');
  }
  if (
    transaction.nextStep.name === 'enroll-authenticator' ||
    (transaction.nextStep.authenticator && transaction.nextStep.authenticator.enrollmentData && transaction.nextStep.authenticator.enrollmentData.qrCode) ||
    transaction.nextStep.name === 'enroll-poll' // Accept enroll-poll as a valid QR state
  ) {
    // User needs to scan QR code or is waiting for device activation
    return res.redirect('/enroll-qr');
  }
  if (transaction.nextStep.name !== 'challenge-authenticator') {
    return res.render('verify-mfa', { error: 'Unexpected state. Please try logging in again.' });
  }
  res.render('verify-mfa', { error: null });
});

// VERIFY MFA POST: Submit MFA code
router.post('/verify-mfa', async (req, res) => {
  const { code } = req.body;
  const transaction = req.session.transaction;
  if (!transaction) return res.redirect('/login');
  // Debug: log nextStep
  console.log('[DEBUG] /verify-mfa POST nextStep:', transaction.nextStep);
  if (!transaction.nextStep) {
    return res.redirect('/login');
  }
  if (transaction.nextStep.name === 'select-authenticator-enroll') {
    return res.redirect('/enroll-mfa');
  }
  if (
    transaction.nextStep.name === 'enroll-authenticator' ||
    (transaction.nextStep.authenticator && transaction.nextStep.authenticator.enrollmentData && transaction.nextStep.authenticator.enrollmentData.qrCode) ||
    transaction.nextStep.name === 'enroll-poll' // Accept enroll-poll as a valid QR state
  ) {
    return res.redirect('/enroll-qr');
  }
  if (transaction.nextStep.name !== 'challenge-authenticator') {
    return res.render('verify-mfa', { error: 'Unexpected state. Please try logging in again.' });
  }
  try {
    // Find code input name
    const codeInput = (transaction.nextStep.inputs || []).find(i => i.name && i.name.toLowerCase().includes('code'));
    if (!codeInput) {
      console.log('[DEBUG] No code input found in nextStep.inputs:', transaction.nextStep.inputs);
      return res.render('verify-mfa', { error: 'No code field found. If you just enrolled, please confirm enrollment in Okta Verify and try again.' });
    }
    const payload = {
      step: transaction.nextStep.name,
      stateHandle: transaction.context.stateHandle
    };
    payload[codeInput.name] = code;
    const verifyResp = await oktaAuth.idx.proceed(payload);
    if (verifyResp.status === IdxStatus.SUCCESS) {
      req.session.isAuthenticated = true;
      req.session.user = { email: transaction.context?.user?.value?.identifier || 'user', authenticatedAt: new Date().toISOString(), mfaVerified: true };
      req.session.transaction = null;
      return res.redirect('/');
    } else if (verifyResp.messages && verifyResp.messages.length > 0) {
      req.session.transaction = verifyResp;
      return res.render('verify-mfa', { error: verifyResp.messages[0].message });
    } else {
      req.session.transaction = verifyResp;
      return res.render('verify-mfa', { error: 'Verification failed. Try again.' });
    }
  } catch (err) {
    return res.render('verify-mfa', { error: err.message });
  }
});

// LOGOUT
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;

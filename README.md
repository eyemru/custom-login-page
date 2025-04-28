# Okta Custom Login Application

A Node.js application demonstrating a custom login experience with Okta, including multi-factor authentication (MFA) using Okta Verify.

## Features

- Custom login page with username and password authentication
- MFA enrollment flow for Okta Verify
- MFA verification with TOTP codes
- Secure session management
- Protected routes requiring authentication
- User dashboard and profile pages

## Prerequisites

- Node.js (v14 or higher)
- Okta developer account
- Okta application with OIDC configuration

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd okta-custom-login2
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your Okta configuration:
```
OKTA_ISSUER=https://your-domain.okta.com/oauth2/default
OKTA_CLIENT_ID=your-client-id
OKTA_CLIENT_SECRET=your-client-secret
OKTA_DOMAIN=https://your-domain.okta.com
APP_BASE_URL=http://localhost:3000
OKTA_TESTING_DISABLEHTTPSCHECK=true
SESSION_SECRET=your-session-secret
PORT=3000
```

4. Start the application:
```bash
npm start
```

5. Access the application at http://localhost:3000

## Authentication Flow

1. User accesses the application
2. If not authenticated, user is redirected to the login page
3. User provides username and password
4. If credentials are valid, Okta checks if MFA is required
5. If MFA is required but not enrolled, user is prompted to enroll in Okta Verify
6. User scans QR code with Okta Verify app and completes enrollment
7. User provides MFA code from Okta Verify app
8. If MFA code is valid, user is authenticated and redirected to the home page
9. If MFA code is invalid, user is prompted to try again

## Project Structure

- `/config` - Configuration files
- `/middleware` - Express middleware
- `/public` - Static assets
- `/routes` - Express routes
- `/views` - EJS templates
- `server.js` - Main application file

## Security Considerations

- Uses secure session management
- Implements proper MFA verification
- Follows Okta best practices for authentication
- Protects routes with authentication middleware

## License

ISC

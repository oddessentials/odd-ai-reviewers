/**
 * Test Fixtures: Mitigated Auth Patterns
 *
 * Code samples demonstrating authentication/authorization patterns
 * that should be recognized as mitigations for auth bypass vulnerabilities.
 */

// =============================================================================
// JWT Verification Patterns
// =============================================================================

export const jwtVerifyExample = `
import jwt from 'jsonwebtoken';

async function protectedEndpoint(req: Request) {
  const token = req.headers.authorization?.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // After jwt.verify(), token is valid - auth bypass mitigated
    return getUserData(decoded.userId);
  } catch (error) {
    throw new UnauthorizedError('Invalid token');
  }
}
`;

export const jwtVerifyAsyncExample = `
import { verify } from 'jsonwebtoken';

async function validateToken(token: string): Promise<TokenPayload> {
  return new Promise((resolve, reject) => {
    verify(token, secret, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded as TokenPayload);
    });
  });
}

async function handler(req: Request) {
  const payload = await validateToken(req.token);
  // After validation, user is authenticated
  return sensitiveOperation(payload.userId);
}
`;

// =============================================================================
// Passport.js Patterns
// =============================================================================

export const passportAuthenticateExample = `
import passport from 'passport';

app.get('/protected',
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    // After passport.authenticate(), user is authenticated
    res.json({ data: req.user.sensitiveData });
  }
);
`;

export const passportIsAuthenticatedExample = `
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    // After isAuthenticated() check, user is logged in
    return next();
  }
  res.redirect('/login');
}

app.get('/dashboard', requireAuth, (req, res) => {
  // Protected by middleware
  res.render('dashboard', { user: req.user });
});
`;

// =============================================================================
// Session-based Auth Patterns
// =============================================================================

export const sessionCheckExample = `
function protectedRoute(req: Request, res: Response) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  // After session check, user has valid session
  return fetchUserData(req.session.userId);
}
`;

export const sessionUserCheckExample = `
async function getProfile(req: Request) {
  const user = req.session?.user;
  if (!user) {
    throw new AuthError('Login required');
  }
  // After user check, session contains user
  return { profile: user.profile };
}
`;

// =============================================================================
// Role-based Authorization Patterns
// =============================================================================

export const roleCheckExample = `
function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  // After role check, user is admin
  next();
}

app.delete('/users/:id', adminOnly, async (req, res) => {
  // Protected by role middleware
  await deleteUser(req.params.id);
  res.json({ success: true });
});
`;

export const permissionCheckExample = `
function hasPermission(user: User, permission: string): boolean {
  return user.permissions.includes(permission);
}

async function updateSettings(req: Request) {
  if (!hasPermission(req.user, 'settings:write')) {
    throw new ForbiddenError('Missing permission');
  }
  // After permission check, user can modify settings
  return saveSettings(req.body);
}
`;

// =============================================================================
// OAuth Patterns
// =============================================================================

export const oauthCallbackExample = `
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;

  const tokens = await oauth.getTokens(code);
  if (!tokens.access_token) {
    return res.redirect('/login?error=auth_failed');
  }

  // After OAuth token exchange, user is authenticated
  const user = await oauth.getUserInfo(tokens.access_token);
  req.session.user = user;
  res.redirect('/dashboard');
});
`;

// =============================================================================
// API Key Patterns
// =============================================================================

export const apiKeyCheckExample = `
async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || !(await isValidApiKey(apiKey))) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // After API key validation, request is authenticated
  next();
}
`;

// =============================================================================
// Negative Examples (Should Still Flag)
// =============================================================================

export const noAuthCheckExample = `
app.get('/admin/users', async (req, res) => {
  // No auth check - should flag auth bypass risk
  const users = await db.query('SELECT * FROM users');
  res.json(users);
});
`;

export const partialAuthCheckExample = `
async function maybeProtected(req: Request) {
  if (req.query.admin === 'true') {
    if (!req.session?.isAdmin) {
      throw new Error('Admin required');
    }
    return adminData(); // Protected
  }

  // No auth check on this path - should flag
  return sensitiveData();
}
`;

export const authCheckAfterAccessExample = `
async function badOrder(req: Request) {
  // Accessing sensitive data BEFORE auth check - should flag
  const data = await getSensitiveData(req.params.id);

  if (!req.user) {
    throw new Error('Not authenticated');
  }

  return data;
}
`;

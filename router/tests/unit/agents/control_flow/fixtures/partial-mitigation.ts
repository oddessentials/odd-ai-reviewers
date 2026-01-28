/**
 * Test Fixtures: Partial Mitigation Scenarios
 *
 * Code samples demonstrating partial mitigation patterns where
 * some execution paths are protected but others are not.
 * These test the severity downgrade and path listing features.
 */

// =============================================================================
// Input Validation: Partial Coverage
// =============================================================================

export const partialInputValidationExample = `
function processUserInput(input: string, trusted: boolean) {
  if (trusted) {
    // Trusted path: no validation
    return executeQuery(\`SELECT * FROM users WHERE name = '\${input}'\`);
  }

  // Untrusted path: validated
  const sanitized = sanitizeInput(input);
  return executeQuery(\`SELECT * FROM users WHERE name = '\${sanitized}'\`);
}
`;

export const multiPathPartialValidationExample = `
function handleRequest(data: unknown, source: 'api' | 'form' | 'internal') {
  let input: string;

  switch (source) {
    case 'api':
      // API path: validated
      input = zodSchema.parse(data);
      break;
    case 'form':
      // Form path: no validation (missing)
      input = data as string;
      break;
    case 'internal':
      // Internal path: validated
      input = validator.escape(data as string);
      break;
  }

  return executeQuery(\`SELECT * FROM table WHERE value = '\${input}'\`);
}
`;

export const conditionalValidationExample = `
function processData(input: string, options: { validate?: boolean }) {
  if (options.validate) {
    // Validated path
    const clean = sanitize(input);
    return process(clean);
  }
  // Unvalidated path
  return process(input);
}
`;

// =============================================================================
// Null Checks: Partial Coverage
// =============================================================================

export const partialNullCheckExample = `
function getUserName(user: User | null, fallback: boolean): string {
  if (fallback) {
    // Fallback path: safe
    return 'Anonymous';
  }

  // Non-fallback path: missing null check
  return user.name;
}
`;

export const multiPathNullCheckExample = `
function getProperty(obj: Record<string, unknown> | null, key: string, mode: string) {
  if (mode === 'safe') {
    // Safe mode: null check present
    if (!obj) return null;
    return obj[key];
  } else if (mode === 'default') {
    // Default mode: null check present
    return obj?.[key] ?? 'default';
  } else {
    // Other mode: missing null check
    return obj[key];
  }
}
`;

export const earlyReturnPartialExample = `
function processItem(item: Item | null, skipNull: boolean) {
  if (skipNull && !item) {
    // Early return only when skipNull is true
    return null;
  }

  // When skipNull is false, item could be null
  return item.process();
}
`;

// =============================================================================
// Auth Checks: Partial Coverage
// =============================================================================

export const partialAuthCheckExample = `
async function getResource(id: string, req: Request) {
  // Public resources: no auth check
  if (isPublicResource(id)) {
    return fetchResource(id);
  }

  // Private resources: auth check
  await verifyAuth(req.headers.authorization);
  return fetchResource(id);
}
`;

export const roleBasedPartialAuthExample = `
function performAction(user: User, action: string) {
  if (action === 'read') {
    // Read: any authenticated user
    if (!user) throw new Error('Login required');
    return readData();
  } else if (action === 'write') {
    // Write: admin only
    if (!user || user.role !== 'admin') throw new Error('Admin required');
    return writeData();
  } else {
    // Unknown action: missing auth check
    return executeAction(action);
  }
}
`;

export const conditionalAuthBypassExample = `
async function handleWebhook(req: Request, isInternal: boolean) {
  if (isInternal) {
    // Internal webhook: no auth (trusted)
    return processWebhook(req.body);
  }

  // External webhook: auth required but missing signature verification
  return processWebhook(req.body);
}
`;

// =============================================================================
// XSS Prevention: Partial Coverage
// =============================================================================

export const partialXssPreventionExample = `
function renderContent(content: string, format: 'html' | 'text' | 'raw') {
  if (format === 'text') {
    // Text format: safe (textContent)
    element.textContent = content;
  } else if (format === 'html') {
    // HTML format: sanitized
    element.innerHTML = DOMPurify.sanitize(content);
  } else {
    // Raw format: unsanitized (dangerous)
    element.innerHTML = content;
  }
}
`;

export const multiOutputPartialXssExample = `
function displayMessage(message: string, trusted: boolean) {
  if (trusted) {
    // Trusted messages: no sanitization
    outputDiv.innerHTML = message;
  } else {
    // Untrusted messages: sanitized
    outputDiv.innerHTML = escapeHtml(message);
  }

  // Log is always sanitized
  console.log(escapeHtml(message));
}
`;

// =============================================================================
// Path Traversal: Partial Coverage
// =============================================================================

export const partialPathTraversalExample = `
function readFile(filename: string, userProvided: boolean) {
  if (userProvided) {
    // User input: needs validation
    const safe = path.basename(filename);
    return fs.readFileSync(path.join(baseDir, safe));
  }

  // System input: assumed safe (but might not be)
  return fs.readFileSync(path.join(baseDir, filename));
}
`;

export const whitelistPartialExample = `
function loadTemplate(name: string, source: 'builtin' | 'custom' | 'external') {
  let filepath: string;

  if (source === 'builtin') {
    // Builtin: whitelist enforced
    if (!BUILTIN_TEMPLATES.includes(name)) throw new Error('Invalid template');
    filepath = \`./templates/\${name}.html\`;
  } else if (source === 'custom') {
    // Custom: path sanitization
    filepath = \`./custom/\${path.basename(name)}.html\`;
  } else {
    // External: no protection
    filepath = \`./external/\${name}.html\`;
  }

  return fs.readFileSync(filepath);
}
`;

// =============================================================================
// Mixed Mitigation Types: Partial Coverage
// =============================================================================

export const mixedMitigationPartialExample = `
async function handleUserData(data: UserInput, ctx: Context) {
  // Path 1: Full mitigation (auth + validation)
  if (ctx.isAuthenticated && ctx.strict) {
    await verifyPermissions(ctx.user);
    const validated = schema.parse(data);
    return processSecure(validated);
  }

  // Path 2: Partial mitigation (validation only)
  if (ctx.strict) {
    const validated = schema.parse(data);
    return processSecure(validated);
  }

  // Path 3: Partial mitigation (auth only)
  if (ctx.isAuthenticated) {
    await verifyPermissions(ctx.user);
    return processSecure(data);
  }

  // Path 4: No mitigation
  return processSecure(data);
}
`;

export const cascadingMitigationExample = `
function processInput(input: string, level: 1 | 2 | 3) {
  let processed = input;

  // Level 3 gets all mitigations
  if (level >= 3) {
    processed = sanitizeXss(processed);
    processed = escapeSql(processed);
    processed = validateFormat(processed);
    return executeQuery(processed);
  }

  // Level 2 gets some mitigations
  if (level >= 2) {
    processed = escapeSql(processed);
    processed = validateFormat(processed);
    return executeQuery(processed);
  }

  // Level 1 gets minimal mitigation
  processed = validateFormat(processed);
  return executeQuery(processed);
}
`;

// =============================================================================
// Coverage Percentage Examples
// =============================================================================

export const coverageExample75Percent = `
function process(data: Data, path: 'a' | 'b' | 'c' | 'd') {
  switch (path) {
    case 'a':
      return safe(sanitize(data));
    case 'b':
      return safe(sanitize(data));
    case 'c':
      return safe(sanitize(data));
    case 'd':
      // Only this path is unprotected (25% unprotected = 75% coverage)
      return unsafe(data);
  }
}
`;

export const coverageExample50Percent = `
function process(data: Data, path: 'a' | 'b') {
  if (path === 'a') {
    // Protected path
    return safe(sanitize(data));
  } else {
    // Unprotected path (50% coverage)
    return unsafe(data);
  }
}
`;

export const coverageExample25Percent = `
function process(data: Data, path: 'a' | 'b' | 'c' | 'd') {
  switch (path) {
    case 'a':
      // Only this path is protected (25% coverage)
      return safe(sanitize(data));
    case 'b':
      return unsafe(data);
    case 'c':
      return unsafe(data);
    case 'd':
      return unsafe(data);
  }
}
`;

// =============================================================================
// Negative Examples (Should Detect Issues)
// =============================================================================

export const allPathsUnprotectedExample = `
function processUnsafe(data: Data, mode: string) {
  if (mode === 'fast') {
    // Fast mode: no protection
    return process(data);
  } else if (mode === 'slow') {
    // Slow mode: no protection
    return processSlowly(data);
  } else {
    // Default: no protection
    return processDefault(data);
  }
}
`;

export const mitigationAfterSinkExample = `
function processWrong(input: string) {
  // Sink reached before mitigation
  const result = executeQuery(\`SELECT * FROM t WHERE x = '\${input}'\`);

  // Mitigation after sink (useless)
  const sanitized = sanitize(input);

  return result;
}
`;

export const wrongMitigationTypeExample = `
function processMismatch(input: string) {
  // XSS mitigation applied to SQL injection vulnerability
  const escaped = escapeHtml(input);
  return executeQuery(\`SELECT * FROM t WHERE x = '\${escaped}'\`);
}
`;

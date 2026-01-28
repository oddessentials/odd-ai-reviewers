/**
 * Test Fixtures: Mitigated Input Patterns
 *
 * Code samples demonstrating input validation/sanitization patterns
 * that should be recognized as mitigations for injection vulnerabilities.
 */

// =============================================================================
// Zod Validation Patterns
// =============================================================================

export const zodParseExample = `
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

function createUser(input: unknown) {
  const validated = UserSchema.parse(input);
  // After parse(), input is safe - should NOT flag injection
  db.query(\`INSERT INTO users (name, email) VALUES ('\${validated.name}', '\${validated.email}')\`);
}
`;

export const zodSafeParseExample = `
import { z } from 'zod';

const QuerySchema = z.object({
  search: z.string().max(100),
});

function search(input: unknown) {
  const result = QuerySchema.safeParse(input);
  if (!result.success) {
    return { error: result.error };
  }
  // After safeParse success, data is validated
  return db.search(result.data.search);
}
`;

// =============================================================================
// Validator.js Patterns
// =============================================================================

export const validatorEscapeExample = `
import validator from 'validator';

function displayComment(userInput: string) {
  const escaped = validator.escape(userInput);
  // After escape(), XSS risk is mitigated
  document.innerHTML = escaped;
}
`;

export const validatorIsEmailExample = `
import validator from 'validator';

function sendEmail(email: string) {
  if (!validator.isEmail(email)) {
    throw new Error('Invalid email');
  }
  // After isEmail() check, email format is validated
  mailer.send(email, 'Welcome!');
}
`;

// =============================================================================
// Joi Validation Patterns
// =============================================================================

export const joiValidateExample = `
import Joi from 'joi';

const schema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
});

async function register(input: unknown) {
  const { value, error } = schema.validate(input);
  if (error) {
    throw error;
  }
  // After validate(), input conforms to schema
  await createAccount(value.username);
}
`;

// =============================================================================
// DOMPurify Patterns
// =============================================================================

export const domPurifySanitizeExample = `
import DOMPurify from 'dompurify';

function renderMarkdown(userContent: string) {
  const clean = DOMPurify.sanitize(userContent);
  // After sanitize(), XSS vectors are removed
  element.innerHTML = clean;
}
`;

// =============================================================================
// Custom Sanitization Functions
// =============================================================================

export const customSanitizeExample = `
function sanitizeInput(input: string): string {
  return input.replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&#39;',
    '"': '&quot;',
  }[c] || c));
}

function display(userInput: string) {
  const safe = sanitizeInput(userInput);
  // After custom sanitization
  element.textContent = safe;
}
`;

// =============================================================================
// SQL Parameterized Queries (Implicit Mitigation)
// =============================================================================

export const parameterizedQueryExample = `
function getUser(userId: string) {
  // Parameterized query - safe from SQL injection
  return db.query('SELECT * FROM users WHERE id = $1', [userId]);
}
`;

// =============================================================================
// Negative Examples (Should Still Flag)
// =============================================================================

export const unmmitigatedInputExample = `
function unsafeQuery(userInput: string) {
  // No validation - should flag SQL injection risk
  db.query(\`SELECT * FROM users WHERE name = '\${userInput}'\`);
}
`;

export const partialMitigationExample = `
import { z } from 'zod';

function partiallyProtected(input: unknown) {
  const schema = z.object({ name: z.string() });

  if (Math.random() > 0.5) {
    const validated = schema.parse(input);
    db.query(validated.name); // Protected path
  } else {
    db.query((input as any).name); // Unprotected path - should flag
  }
}
`;

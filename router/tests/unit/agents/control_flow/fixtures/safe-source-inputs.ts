/**
 * Test Fixtures: Safe-Source Detection Patterns
 *
 * Code samples for testing safe-source recognition.
 * Positive cases should be detected as safe; negative cases must remain tainted.
 */

// =============================================================================
// Pattern 1: Constant Literal Declarations — Positive Cases
// =============================================================================

export const constStringLiteral = `
const GREETING = "hello";
`;

export const constNumberLiteral = `
const PORT = 42;
`;

export const constBooleanLiteral = `
const ENABLED = true;
`;

export const constStringArray = `
const ALLOWED = ["a", "b", "c"];
`;

export const constMixedArray = `
const MIXED = [1, "two", true];
`;

// =============================================================================
// Pattern 2: Built-in Directory References — Positive Cases
// =============================================================================

export const dirnameUsage = `
const dir = path.join(__dirname, "templates");
`;

export const filenameUsage = `
const file = __filename;
`;

export const importMetaDirname = `
const dir = import.meta.dirname;
`;

export const importMetaUrl = `
const url = import.meta.url;
`;

// =============================================================================
// Pattern 3: Safe Directory Listing — Positive Cases
// =============================================================================

export const readdirSyncBuiltinArg = `
const files = fs.readdirSync(__dirname);
`;

export const readdirSyncStringArg = `
const files = fs.readdirSync("/static");
`;

export const readdirSyncPathJoinSafeArgs = `
const files = fs.readdirSync(path.join(__dirname, "fixtures"));
`;

// =============================================================================
// Pattern 4: Constant Array Element Access — Positive Cases
// =============================================================================

export const constArrayElementAccess = `
const ITEMS = ["apple", "banana", "cherry"];
const picked = ITEMS[i];
`;

export const constArrayElementAccessSink = `
const HEDGE_PHRASES = ["maybe", "possibly", "likely"];
const pattern = HEDGE_PHRASES[i];
db.query(pattern);
`;

export const builtinPathJoinSink = `
const templateDir = path.join(__dirname, "templates");
fs.readFileSync(templateDir);
`;

// =============================================================================
// Intentional Exclusions — Negative Cases (MUST remain tainted)
// =============================================================================

export const envVariable = `
const SECRET = process.env.SECRET;
`;

export const typeAssertion = `
const safe = x as SafeType;
`;

export const importedConstant = `
import { X } from './config';
`;

export const codeComment = `
// @safe
const value = getUserInput();
`;

export const objectLiteral = `
const OBJ = { a: 1 };
`;

export const templateWithInterpolation = `
const name = "world";
const TPL = \`prefix\${name}\`;
`;

export const functionReturnValue = `
const RET = someFunction();
`;

export const aliasedConstant = `
const ORIGINAL = "safe";
const ALIAS = ORIGINAL;
`;

// =============================================================================
// Edge Cases
// =============================================================================

export const letMutable = `
let MUTABLE = "hello";
`;

export const constInsideFunction = `
function setup() {
  const INNER = "hello";
}
`;

export const mutatedConst = `
const ITEMS = ["a"];
ITEMS[0] = "b";
`;

export const readdirUnsafeArg = `
const files = fs.readdirSync(userInput);
`;

export const readdirBinaryExpression = `
const files = fs.readdirSync(dir || __dirname);
`;

// =============================================================================
// Pattern 2 — Unsafe path.join Cases (MUST NOT be marked safe)
// =============================================================================

/** path.join with __dirname and user input — result is tainted */
export const dirnamePathJoinUnsafe = `
const p = path.join(__dirname, req.body.file);
`;

/** path.resolve with __filename and user input — result is tainted */
export const filenamePathResolveUnsafe = `
const p = path.resolve(__filename, userInput);
`;

/** import.meta.dirname mixed with user input in path.join — result is tainted */
export const importMetaDirnamePathJoinUnsafe = `
const p = path.join(import.meta.dirname, req.params.path);
`;

/** path.join with ONLY safe args — result should still be safe */
export const dirnamePathJoinAllSafe = `
const p = path.join(__dirname, "templates", "index.html");
`;

/** Nested path.join: inner has unsafe arg — outer result is tainted */
export const nestedPathJoinUnsafe = `
const p = path.join(__dirname, path.join("sub", userInput));
`;

// =============================================================================
// Pattern 2 — Expression-mixing bypasses (MUST NOT be marked safe)
// =============================================================================

/** Template literal mixing __dirname with user input — result is tainted */
export const dirnameTemplateLiteralUnsafe = `
const p = \`\${__dirname}/\${req.body.file}\`;
`;

/** String concatenation mixing __dirname with user input — result is tainted */
export const dirnameStringConcatUnsafe = `
const p = __dirname + '/' + req.body.file;
`;

/** new URL() mixing import.meta.url with user input — result is tainted */
export const importMetaUrlNewUrlUnsafe = `
const target = new URL(req.body.path, import.meta.url);
`;

// =============================================================================
// Scope Isolation — Regression Cases
// =============================================================================

/** Nested scope: inner safe builtin should NOT suppress outer tainted variable */
export const nestedScopeBuiltin = `
const dir = req.query.dir;
function inner() {
  const dir = __dirname;
  console.log(dir);
}
console.log(dir);
`;

/** Sibling scopes: safe variable in one function should NOT suppress tainted in another */
export const siblingScopeBuiltin = `
function handler(req) {
  const dir = req.query.dir;
  return dir;
}
function helper() {
  const dir = __dirname;
  return dir;
}
`;

// =============================================================================
// Scope-Aware Mutation Tracking — Regression Cases
// =============================================================================

/**
 * Shadowed const array: inner mutable variable with same name as outer const
 * array should NOT mark the outer as mutated.
 */
export const shadowedConstArray = `
const ITEMS = ["apple", "banana"];
function process() {
  let ITEMS = [];
  ITEMS[0] = "mutated";
}
const picked = ITEMS[0];
`;

/**
 * Direct mutation of outer const array: element assignment on the outer
 * declaration itself should correctly invalidate safety.
 */
export const directOuterMutation = `
const ITEMS = ["a"];
ITEMS[0] = "b";
`;

/**
 * Property mutation on the same binding still invalidates safety.
 */
export const propertyMutationInvalidates = `
const DATA = ["x", "y"];
DATA.length = 0;
`;

/**
 * Block-scoped mutation: mutation inside a block scope should only affect
 * the binding visible at that scope level.
 */
export const blockScopedMutation = `
const ITEMS = ["safe", "values"];
{
  let ITEMS = ["other"];
  ITEMS[0] = "mutated";
}
const picked = ITEMS[0];
`;

/**
 * Nested function reference to outer binding should still match correctly.
 */
export const nestedFunctionOuterRef = `
const SAFE = ["a", "b", "c"];
function doWork() {
  const x = SAFE[0];
  return x;
}
`;

/**
 * Callback/arrow function shadowing should not poison outer declaration.
 */
export const callbackShadowNoPoison = `
const ITEMS = ["x", "y", "z"];
const results = [1, 2].map((ITEMS) => {
  return ITEMS * 2;
});
const picked = ITEMS[1];
`;

/**
 * var hoisting: inner var with same name as outer const should still mutate
 * the var (which is hoisted to function scope), not the outer const.
 */
export const varHoistingShadow = `
const ITEMS = ["safe", "values"];
function process() {
  if (true) {
    var ITEMS = [];
    ITEMS[0] = "mutated";
  }
}
const picked = ITEMS[0];
`;

/**
 * for-of loop variable should not poison outer const array.
 */
export const forOfLoopShadow = `
const ITEMS = ["safe", "values"];
for (const ITEMS of someArray) {
  console.log(ITEMS);
}
const picked = ITEMS[0];
`;

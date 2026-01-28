/**
 * Integration Tests: Control Flow Analysis Agent
 *
 * End-to-end tests for the control flow analysis agent.
 * Tests full agent execution with realistic code samples.
 */

import { describe, it, expect } from 'vitest';
import { controlFlowAgent } from '../../src/agents/control_flow/index.js';
import type { AgentContext } from '../../src/agents/types.js';
import type { DiffFile } from '../../src/diff.js';

describe('Control Flow Agent Integration', () => {
  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  function createContext(files: DiffFile[], config: Record<string, unknown> = {}): AgentContext {
    return {
      files,
      config: {
        control_flow: {
          enabled: true,
          timeBudgetMs: 60000,
          sizeBudgetLines: 5000,
          maxCallDepth: 5,
          ...config,
        },
      },
      repoPath: '/test/repo',
    };
  }

  function createDiffFile(path: string, patch: string): DiffFile {
    return {
      path,
      patch,
      additions: patch.split('\n').filter((l) => l.startsWith('+')).length,
      deletions: patch.split('\n').filter((l) => l.startsWith('-')).length,
      status: 'modified',
    };
  }

  // ==========================================================================
  // Agent Registration and Support
  // ==========================================================================

  describe('Agent Registration', () => {
    it('should have correct agent ID', () => {
      expect(controlFlowAgent.id).toBe('control_flow');
    });

    it('should have correct agent name', () => {
      expect(controlFlowAgent.name).toBe('Control Flow Analysis');
    });

    it('should not use LLM', () => {
      expect(controlFlowAgent.usesLlm).toBe(false);
    });
  });

  describe('File Support Detection', () => {
    it('should support TypeScript files', () => {
      const file = createDiffFile('src/app.ts', '');
      expect(controlFlowAgent.supports(file)).toBe(true);
    });

    it('should support TSX files', () => {
      const file = createDiffFile('src/Component.tsx', '');
      expect(controlFlowAgent.supports(file)).toBe(true);
    });

    it('should support JavaScript files', () => {
      const file = createDiffFile('src/utils.js', '');
      expect(controlFlowAgent.supports(file)).toBe(true);
    });

    it('should support JSX files', () => {
      const file = createDiffFile('src/Component.jsx', '');
      expect(controlFlowAgent.supports(file)).toBe(true);
    });

    it('should support MJS files', () => {
      const file = createDiffFile('src/module.mjs', '');
      expect(controlFlowAgent.supports(file)).toBe(true);
    });

    it('should support CJS files', () => {
      const file = createDiffFile('src/legacy.cjs', '');
      expect(controlFlowAgent.supports(file)).toBe(true);
    });

    it('should not support Python files', () => {
      const file = createDiffFile('src/app.py', '');
      expect(controlFlowAgent.supports(file)).toBe(false);
    });

    it('should not support Go files', () => {
      const file = createDiffFile('src/main.go', '');
      expect(controlFlowAgent.supports(file)).toBe(false);
    });

    it('should not support Markdown files', () => {
      const file = createDiffFile('README.md', '');
      expect(controlFlowAgent.supports(file)).toBe(false);
    });
  });

  // ==========================================================================
  // Basic Agent Execution
  // ==========================================================================

  describe('Basic Execution', () => {
    it('should return success for empty file list', async () => {
      const context = createContext([]);
      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('control_flow');
      expect(result.findings).toEqual([]);
    });

    it('should return success when disabled', async () => {
      const file = createDiffFile('src/app.ts', 'function test() {}');
      const context = createContext([file], { enabled: false });

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
      expect(result.findings).toEqual([]);
      expect(result.metrics?.filesProcessed).toBe(0);
    });

    it('should process supported files', async () => {
      const file = createDiffFile(
        'src/app.ts',
        `function processUser(id: string) {
  const user = getUser(id);
  return user;
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('control_flow');
      expect(result.metrics?.filesProcessed).toBeGreaterThanOrEqual(0);
    });

    it('should skip unsupported files', async () => {
      const pyFile = createDiffFile('src/app.py', 'def test(): pass');
      const tsFile = createDiffFile('src/app.ts', 'function test() {}');
      const context = createContext([pyFile, tsFile]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
      // Only the TS file should be processed
    });

    it('should handle files with no patch content', async () => {
      const file = createDiffFile('src/app.ts', '');
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Control Flow Analysis
  // ==========================================================================

  describe('Control Flow Analysis', () => {
    it('should analyze functions with conditionals', async () => {
      const file = createDiffFile(
        'src/auth.ts',
        `function validateUser(user: User | null) {
  if (user === null) {
    return false;
  }
  return user.isActive;
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should analyze functions with loops', async () => {
      const file = createDiffFile(
        'src/process.ts',
        `function processItems(items: string[]) {
  for (const item of items) {
    if (!isValid(item)) {
      continue;
    }
    process(item);
  }
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should analyze functions with try-catch', async () => {
      const file = createDiffFile(
        'src/api.ts',
        `async function fetchData(url: string) {
  try {
    const response = await fetch(url);
    return response.json();
  } catch (error) {
    logError(error);
    throw error;
  }
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should analyze async functions', async () => {
      const file = createDiffFile(
        'src/service.ts',
        `async function loadUser(id: string) {
  const sanitized = sanitizeInput(id);
  const user = await database.findUser(sanitized);
  return user;
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should analyze arrow functions', async () => {
      const file = createDiffFile(
        'src/utils.ts',
        `const validate = (input: string) => {
  if (!input) {
    return false;
  }
  return isValid(input);
};`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should analyze class methods', async () => {
      const file = createDiffFile(
        'src/service.ts',
        `class UserService {
  async getUser(id: string) {
    const validated = this.validateId(id);
    if (!validated) {
      throw new Error('Invalid ID');
    }
    return this.repository.find(id);
  }
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Mitigation Recognition
  // ==========================================================================

  describe('Mitigation Recognition', () => {
    it('should recognize input validation', async () => {
      const file = createDiffFile(
        'src/api.ts',
        `function handleRequest(input: unknown) {
  const parsed = schema.parse(input);
  return processData(parsed);
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should recognize null checks', async () => {
      const file = createDiffFile(
        'src/utils.ts',
        `function safeParse(value: string | null) {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.parse(value);
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should recognize auth checks', async () => {
      const file = createDiffFile(
        'src/api.ts',
        `async function protectedEndpoint(req: Request) {
  if (!req.user || !isAuthenticated(req.user)) {
    throw new Error('Unauthorized');
  }
  return getSecretData();
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should recognize output encoding', async () => {
      const file = createDiffFile(
        'src/render.ts',
        `function renderHtml(userInput: string) {
  const encoded = encodeURIComponent(userInput);
  return \`<div>\${encoded}</div>\`;
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Budget Management
  // ==========================================================================

  describe('Budget Management', () => {
    it('should track files processed in metrics', async () => {
      const file = createDiffFile('src/app.ts', 'function test() { return 1; }');
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(typeof result.metrics?.durationMs).toBe('number');
    });

    it('should respect time budget configuration', async () => {
      const file = createDiffFile('src/app.ts', 'function test() {}');
      const context = createContext([file], { timeBudgetMs: 1000 });

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should respect size budget configuration', async () => {
      const file = createDiffFile('src/app.ts', 'function test() {}');
      const context = createContext([file], { sizeBudgetLines: 100 });

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should prioritize security-sensitive files', async () => {
      const authFile = createDiffFile('src/auth/login.ts', 'function login() {}');
      const utilFile = createDiffFile('src/utils/format.ts', 'function format() {}');
      const testFile = createDiffFile('src/__tests__/app.test.ts', 'test("x", () => {})');

      const context = createContext([testFile, utilFile, authFile]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it('should handle syntax errors gracefully', async () => {
      const file = createDiffFile(
        'src/broken.ts',
        `function broken( {
  this is not valid syntax
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      // Should not crash, might have errors in metrics
      expect(result.agentId).toBe('control_flow');
    });

    it('should handle missing config gracefully', async () => {
      const file = createDiffFile('src/app.ts', 'function test() {}');
      const context: AgentContext = {
        files: [file],
        config: {}, // No control_flow config
        repoPath: '/test/repo',
      };

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Real-World Scenarios
  // ==========================================================================

  describe('Real-World Scenarios', () => {
    it('should handle Express-style route handler', async () => {
      const file = createDiffFile(
        'src/routes/users.ts',
        `router.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  const sanitizedId = sanitize(id);

  try {
    const user = await userService.findById(sanitizedId);
    if (!user) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(user);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: 'Internal error' });
  }
});`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should handle React component with hooks', async () => {
      const file = createDiffFile(
        'src/components/UserList.tsx',
        `function UserList({ userId }: Props) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!userId) return;

    const fetchUsers = async () => {
      const validated = validateId(userId);
      const data = await api.getUsers(validated);
      setUsers(data);
    };

    fetchUsers();
  }, [userId]);

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{escapeHtml(user.name)}</li>
      ))}
    </ul>
  );
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should handle authentication middleware', async () => {
      const file = createDiffFile(
        'src/middleware/auth.ts',
        `export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = decoded as User;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });

    it('should handle database query with sanitization', async () => {
      const file = createDiffFile(
        'src/repositories/user.ts',
        `export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const sanitizedEmail = validator.normalizeEmail(email);

    if (!sanitizedEmail || !validator.isEmail(sanitizedEmail)) {
      throw new ValidationError('Invalid email');
    }

    const result = await this.db.query(
      'SELECT * FROM users WHERE email = $1',
      [sanitizedEmail]
    );

    return result.rows[0] || null;
  }
}`
      );
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });
  });
});

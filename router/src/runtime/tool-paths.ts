import { existsSync, readdirSync } from 'fs';
import { delimiter, join } from 'path';

export function getWindowsPythonScriptsDirs(
  env: Record<string, string | undefined> = process.env
): string[] {
  if (process.platform !== 'win32') {
    return [];
  }

  const appData = env['APPDATA'];
  if (!appData) {
    return [];
  }

  const pythonRoot = join(appData, 'Python');
  if (!existsSync(pythonRoot)) {
    return [];
  }

  return readdirSync(pythonRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^Python\d+$/.test(entry.name))
    .map((entry) => join(pythonRoot, entry.name, 'Scripts'))
    .filter((dir) => existsSync(dir));
}

export function withAugmentedToolPath(
  env: Record<string, string | undefined> = process.env
): Record<string, string> {
  const currentPath = env['PATH'] ?? '';
  const pathEntries = currentPath.split(delimiter).filter(Boolean);
  const extraDirs = getWindowsPythonScriptsDirs(env).filter((dir) => !pathEntries.includes(dir));

  return {
    ...Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
    PATH:
      extraDirs.length > 0 ? `${extraDirs.join(delimiter)}${delimiter}${currentPath}` : currentPath,
  };
}

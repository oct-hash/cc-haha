// Security scan lane: detect hardcoded secrets, sensitive files, vulnerability patterns

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { DetailItem, LaneExecutionContext, LaneResult } from './types';

// Patterns that indicate potential hardcoded secrets
const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string; severity: 'error' | 'warn' }> = [
  {
    pattern: /(?:api[_-]?key|apikey|api_secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi,
    label: 'API key hardcoded',
    severity: 'error',
  },
  {
    pattern: /(?:password|passwd)\s*[:=]\s*["'][^"']{4,}["']/gi,
    label: 'Password hardcoded',
    severity: 'error',
  },
  {
    pattern: /(?:token|secret)\s*[:=]\s*["'](sk-|ghp_|gho_|xox[bpras]-)/gi,
    label: 'Secret token hardcoded',
    severity: 'error',
  },
  {
    pattern: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----/gi,
    label: 'Private key embedded',
    severity: 'error',
  },
];

const SENSITIVE_FILES = ['.env', '.pem', '.key', 'id_rsa', 'id_ed25519', 'credentials'];
const WEAK_CRYPTO = ['md5', 'sha1', 'des', 'rc4'];

export async function runSecurityScan(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now();
  const details: DetailItem[] = [];
  let hasErrors = false;
  const rootDir = ctx.rootDir;

  // 1. Git-tracked sensitive files
  const gitignorePath = join(rootDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, 'utf8');
    const protectedFiles = SENSITIVE_FILES.filter((f) => gitignore.includes(f));
    const unprotectedFiles = SENSITIVE_FILES.filter((f) => !gitignore.includes(f));
    if (unprotectedFiles.length > 0) {
      details.push({
        label: '.gitignore coverage',
        status: 'warn',
        message: `Not ignoring: ${unprotectedFiles.join(', ')}`,
      });
    } else {
      details.push({
        label: '.gitignore coverage',
        status: 'ok',
        message: `Protects ${protectedFiles.length} sensitive file patterns`,
      });
    }
  }

  // 2. Scan source files for hardcoded secrets
  let totalSecrets = 0;
  const secretDetails: DetailItem[] = [];
  const srcDir = join(rootDir, 'src');
  if (existsSync(srcDir)) {
    try {
      const scanFiles = collectFiles(srcDir, ['.ts', '.tsx', '.js', '.jsx'], 500);
      for (const file of scanFiles) {
        const content = readFileSync(file, 'utf8');
        for (const { pattern, label, severity } of SECRET_PATTERNS) {
          const matches = content.match(pattern);
          if (matches && matches.length > 0) {
            totalSecrets += matches.length;
            secretDetails.push({
              label: `${relative(rootDir, file)}`,
              status: severity,
              message: `${label}: ${matches.length} occurrence(s)`,
            });
          }
        }
      }
      if (secretDetails.length > 0) {
        hasErrors = secretDetails.some((d) => d.status === 'error');
        details.push(...secretDetails.slice(0, 10));
        if (secretDetails.length > 10) {
          details.push({
            label: `... and ${secretDetails.length - 10} more files with potential secrets`,
            status: 'warn',
          });
        }
      } else {
        details.push({
          label: 'Secret scan',
          status: 'ok',
          message: `No secrets found in ${scanFiles.length} files`,
        });
      }
    } catch (err) {
      details.push({
        label: 'Secret scan',
        status: 'warn',
        message: `Scan incomplete: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 3. Weak crypto usage check
  const weakCryptoCount = countWeakCrypto(srcDir);
  if (weakCryptoCount > 0) {
    details.push({
      label: 'Weak cryptography',
      status: 'warn',
      message: `${weakCryptoCount} references to ${WEAK_CRYPTO.join(', ')}`,
    });
  } else {
    details.push({
      label: 'Cryptography usage',
      status: 'ok',
      message: 'No weak algorithms detected',
    });
  }

  return {
    id: 'security-scan',
    title: 'Security Scan',
    status: hasErrors ? 'failed' : 'passed',
    durationMs: Date.now() - started,
    category: 'governance',
    description: `${totalSecrets} potential secrets, ${weakCryptoCount} weak crypto refs`,
    details,
  };
}

function collectFiles(dir: string, extns: string[], maxFiles: number): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= maxFiles) break;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '__tests__' ||
          entry.name.startsWith('.')
        )
          continue;
        files.push(...collectFiles(fullPath, extns, maxFiles - files.length));
      } else if (extns.some((ext) => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  } catch {
    /* skip */
  }
  return files;
}

function countWeakCrypto(srcDir: string): number {
  let count = 0;
  if (!existsSync(srcDir)) return count;
  const files = collectFiles(srcDir, ['.ts', '.tsx', '.js'], 200);
  const weakPattern = new RegExp(`\\b(${WEAK_CRYPTO.join('|')})\\b`, 'gi');
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      // Only count in security-related files
      if (content.includes('crypto') || content.includes('hash') || content.includes('encrypt')) {
        count += (content.match(weakPattern) || []).length;
      }
    } catch {
      /* skip */
    }
  }
  return count;
}

import * as fs from 'fs';
import * as path from 'path';

export interface SecurityRule {
  pattern: RegExp;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

export interface ScanResult {
  file: string;
  line: number;
  severity: SecurityRule['severity'];
  message: string;
  matched: string;
}

const SECURITY_RULES: SecurityRule[] = [
  { pattern: /eval\s*\(/, severity: 'critical', message: 'eval() 사용 금지' },
  { pattern: /new\s+Function\s*\(/, severity: 'critical', message: 'new Function() 사용 금지' },
  { pattern: /document\.cookie/, severity: 'critical', message: 'cookie 직접 접근 금지' },
  { pattern: /document\.write\s*\(/, severity: 'critical', message: 'document.write() 사용 금지' },
  { pattern: /\.innerHTML\s*=/, severity: 'warning', message: 'innerHTML 사용 주의 (XSS 위험). dangerouslySetInnerHTML 사용 권장' },
  { pattern: /window\.open\s*\(/, severity: 'warning', message: 'window.open() 사용 주의' },
  { pattern: /window\.location\s*=/, severity: 'warning', message: 'window.location 직접 변경 금지. Union.ui.close() 사용' },
  { pattern: /(?<!Union\.)fetch\s*\(/, severity: 'info', message: 'Union.request() 사용을 권장합니다 (mTLS 자동 적용)' },
  { pattern: /XMLHttpRequest/, severity: 'info', message: 'Union.request() 사용을 권장합니다' },
  { pattern: /localStorage(?!\.union)/, severity: 'info', message: 'Union.storage 사용을 권장합니다 (앱별 격리)' },
  { pattern: /sessionStorage/, severity: 'info', message: 'Union.storage 사용을 권장합니다' },
];

/**
 * 빌드 파일 보안 스캔
 */
export function scanDirectory(dir: string): ScanResult[] {
  const results: ScanResult[] = [];
  const files = getJSFiles(dir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      for (const rule of SECURITY_RULES) {
        const match = lines[i].match(rule.pattern);
        if (match) {
          results.push({
            file: path.relative(dir, file),
            line: i + 1,
            severity: rule.severity,
            message: rule.message,
            matched: match[0],
          });
        }
      }
    }
  }

  return results;
}

function getJSFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(d: string) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

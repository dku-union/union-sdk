import * as fs from 'fs';
import * as path from 'path';

export interface UnionConfig {
  appId: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  category: string;
  permissions: string[];
  contactEmail: string;
  keywords: string[];
  previews: string[];
  minSdkVersion: string;
  build: {
    entry: string;
    outDir: string;
    maxBundleSize: string;
  };
}

const CONFIG_FILE = 'union.config.json';

/**
 * union.config.json 읽기
 */
export function loadConfig(cwd: string = process.cwd()): UnionConfig {
  const configPath = path.resolve(cwd, CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    throw new Error(`${CONFIG_FILE} not found in ${cwd}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const config: UnionConfig = JSON.parse(raw);

  validateConfig(config);
  return config;
}

/** Spring/iOS 가 인식하는 권한 스코프 — SDK PermissionScope 와 동기화 필요 */
const VALID_PERMISSIONS = new Set<string>([
  'user.profile',
  'user.email',
  'user.university',
  'device.location',
  'device.camera',
  'device.storage',
  'notification',
]);

function validateConfig(config: UnionConfig): void {
  const required: (keyof UnionConfig)[] = ['appId', 'name', 'version'];

  for (const field of required) {
    if (!config[field]) {
      throw new Error(`union.config.json: "${field}" is required`);
    }
  }

  // appId 형식 검증 (reverse domain)
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/.test(config.appId)) {
    throw new Error(
      `union.config.json: "appId" must be reverse domain format (e.g., com.publisher.myapp)`,
    );
  }

  // semver 형식 검증
  if (!/^\d+\.\d+\.\d+/.test(config.version)) {
    throw new Error(
      `union.config.json: "version" must be semver format (e.g., 1.0.0)`,
    );
  }

  // permissions 스코프 검증 — 알려진 키만 허용
  if (config.permissions) {
    for (const perm of config.permissions) {
      if (!VALID_PERMISSIONS.has(perm)) {
        throw new Error(
          `union.config.json: "${perm}" is not a valid permission scope. ` +
            `Allowed: ${[...VALID_PERMISSIONS].join(', ')}`,
        );
      }
    }
  }
}

/**
 * 번들 사이즈 제한을 바이트로 변환
 */
export function parseSizeLimit(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)$/i);
  if (!match) return 2 * 1024 * 1024; // default 2MB

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  switch (unit) {
    case 'KB': return value * 1024;
    case 'MB': return value * 1024 * 1024;
    case 'GB': return value * 1024 * 1024 * 1024;
    default: return value;
  }
}

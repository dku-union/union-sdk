import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { UnionConfig } from './config';

export interface Manifest {
  appId: string;
  name: string;
  version: string;
  sdkVersion: string;
  minSdkVersion: string;
  permissions: string[];
  entry: string;
  bundleSize: number;
  packageSize: number;
  buildTime: string;
  checksum: string;
}

/**
 * 빌드 결과물에서 manifest.json 생성
 */
export function generateManifest(config: UnionConfig, outDir: string): Manifest {
  const bundleSize = calculateDirSize(outDir);
  const checksum = calculateChecksum(outDir);

  const manifest: Manifest = {
    appId: config.appId,
    name: config.name,
    version: config.version,
    sdkVersion: '1.0.0',
    minSdkVersion: config.minSdkVersion ?? '1.0.0',
    permissions: config.permissions ?? [],
    entry: 'index.html',
    bundleSize,
    packageSize: 0, // 패키징 후 packager에서 업데이트
    buildTime: new Date().toISOString(),
    checksum: `sha256:${checksum}`,
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return manifest;
}

function calculateDirSize(dir: string): number {
  let size = 0;

  function walk(d: string) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  }

  walk(dir);
  return size;
}

function calculateChecksum(dir: string): string {
  const hash = crypto.createHash('sha256');
  const files: string[] = [];

  function walk(d: string) {
    const entries = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.name === 'manifest.json' || entry.name === 'signature') continue;
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  walk(dir);

  for (const file of files) {
    const content = fs.readFileSync(file);
    hash.update(content);
  }

  return hash.digest('hex');
}

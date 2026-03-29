import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import archiver from 'archiver';
import type { UnionConfig } from './config';
import type { Manifest } from './manifest';

/**
 * dist/ 디렉토리를 .unionapp (zip) 패키지로 생성
 *
 * 1. manifest.json → zip에 먼저 추가
 * 2. 나머지 파일 추가
 * 3. signature 생성 후 zip에 추가
 * 4. manifest.json에 packageSize 기록
 */
export async function createPackage(
  config: UnionConfig,
  outDir: string,
): Promise<PackageResult> {
  const fileName = `${config.appId}-${config.version}.unionapp`;
  const outputPath = path.resolve(path.dirname(outDir), fileName);

  // manifest 읽기
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifestContent = fs.readFileSync(manifestPath, 'utf-8');

  // signature 생성
  const sig = createSignature(config.appId, manifestContent);

  // zip 생성
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    // manifest.json 먼저 (백엔드에서 스트리밍 파싱 가능하도록)
    archive.file(manifestPath, { name: 'manifest.json' });

    // signature
    archive.append(sig, { name: 'signature' });

    // 나머지 파일
    archive.glob('**/*', {
      cwd: outDir,
      ignore: ['manifest.json'],
    });

    archive.finalize();
  });

  // packageSize를 manifest에 기록 후 zip 재생성
  const packageSize = fs.statSync(outputPath).size;
  const manifest: Manifest = JSON.parse(manifestContent);
  manifest.packageSize = packageSize;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // signature 재생성 (manifest 내용이 변경되었으므로)
  const updatedManifestContent = fs.readFileSync(manifestPath, 'utf-8');
  const updatedSig = createSignature(config.appId, updatedManifestContent);

  // 최종 zip 재생성
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    archive.file(manifestPath, { name: 'manifest.json' });
    archive.append(updatedSig, { name: 'signature' });
    archive.glob('**/*', {
      cwd: outDir,
      ignore: ['manifest.json'],
    });

    archive.finalize();
  });

  // 최종 packageSize 업데이트 (재생성 후 크기가 미세하게 다를 수 있음)
  const finalSize = fs.statSync(outputPath).size;
  if (finalSize !== packageSize) {
    manifest.packageSize = finalSize;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  return {
    path: outputPath,
    fileName,
    packageSize: finalSize,
    signature: updatedSig,
  };
}

/**
 * manifest.json에 대한 HMAC-SHA256 서명 생성
 * signingKey: "union-sdk-v1:<appId>"
 */
function createSignature(appId: string, manifestContent: string): string {
  const key = `union-sdk-v1:${appId}`;
  return crypto
    .createHmac('sha256', key)
    .update(manifestContent)
    .digest('hex');
}

export interface PackageResult {
  path: string;
  fileName: string;
  packageSize: number;
  signature: string;
}

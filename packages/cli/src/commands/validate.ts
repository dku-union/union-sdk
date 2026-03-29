import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, parseSizeLimit } from '../utils/config';
import { scanDirectory } from '../utils/security';

export const validateCommand = new Command('validate')
  .option('-d, --dir <dir>', '검증할 빌드 디렉토리', 'dist')
  .description('빌드 결과물 검증 (보안 스캔, 사이즈 체크, 매니페스트 검증)')
  .action((options) => {
    const cwd = process.cwd();
    const buildDir = path.resolve(cwd, options.dir);

    console.log(`\n\ud83d\udd0d Union Validate: ${buildDir}\n`);

    let hasError = false;
    let warningCount = 0;

    // 1. 빌드 디렉토리 존재 확인
    if (!fs.existsSync(buildDir)) {
      console.error('\u274c 빌드 디렉토리를 찾을 수 없습니다. union build를 먼저 실행해주세요.');
      process.exit(1);
    }

    // 2. 필수 파일 확인
    console.log('1/4 \ud83d\udcc1 필수 파일 확인...');
    const requiredFiles = ['index.html', 'manifest.json'];
    for (const file of requiredFiles) {
      if (fs.existsSync(path.join(buildDir, file))) {
        console.log(`     \u2705 ${file}`);
      } else {
        console.log(`     \u274c ${file} — 필수 파일 누락`);
        hasError = true;
      }
    }

    // 3. 매니페스트 검증
    console.log('\n2/4 \ud83d\udcdd 매니페스트 검증...');
    const manifestPath = path.join(buildDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const requiredFields = ['appId', 'name', 'version', 'entry', 'bundleSize', 'checksum'];

        for (const field of requiredFields) {
          if (manifest[field] !== undefined) {
            console.log(`     \u2705 ${field}: ${typeof manifest[field] === 'string' ? manifest[field] : JSON.stringify(manifest[field])}`);
          } else {
            console.log(`     \u274c ${field} — 필드 누락`);
            hasError = true;
          }
        }
      } catch {
        console.log('     \u274c manifest.json 파싱 실패');
        hasError = true;
      }
    }

    // 4. 번들 사이즈 체크
    console.log('\n3/4 \ud83d\udce6 번들 사이즈 체크...');
    try {
      const config = loadConfig(cwd);
      const maxSize = parseSizeLimit(config.build?.maxBundleSize ?? '2MB');
      const totalSize = getDirSize(buildDir);
      const sizeKB = (totalSize / 1024).toFixed(1);
      const maxKB = (maxSize / 1024).toFixed(1);

      if (totalSize <= maxSize) {
        console.log(`     \u2705 ${sizeKB}KB / ${maxKB}KB`);
      } else {
        console.log(`     \u274c ${sizeKB}KB / ${maxKB}KB — 사이즈 초과`);
        hasError = true;
      }
    } catch {
      console.log('     \u26a0\ufe0f  union.config.json 없음. 기본 2MB 제한 적용');
    }

    // 5. 보안 스캔
    console.log('\n4/4 \ud83d\udee1\ufe0f  보안 스캔...');
    const scanResults = scanDirectory(buildDir);

    const criticals = scanResults.filter((r) => r.severity === 'critical');
    const warnings = scanResults.filter((r) => r.severity === 'warning');
    const infos = scanResults.filter((r) => r.severity === 'info');

    if (criticals.length > 0) {
      hasError = true;
      for (const r of criticals) {
        console.log(`     \u274c [CRITICAL] ${r.file}:${r.line} — ${r.message}`);
      }
    }

    if (warnings.length > 0) {
      warningCount += warnings.length;
      for (const r of warnings) {
        console.log(`     \u26a0\ufe0f  [WARNING] ${r.file}:${r.line} — ${r.message}`);
      }
    }

    if (infos.length > 0) {
      for (const r of infos) {
        console.log(`     \u2139\ufe0f  [INFO] ${r.file}:${r.line} — ${r.message}`);
      }
    }

    if (criticals.length === 0 && warnings.length === 0 && infos.length === 0) {
      console.log('     \u2705 보안 이슈 없음');
    }

    // 결과 출력
    console.log('\n' + '─'.repeat(50));
    if (hasError) {
      console.log('\n\u274c 검증 실패. 위의 오류를 수정해주세요.\n');
      process.exit(1);
    } else if (warningCount > 0) {
      console.log(`\n\u26a0\ufe0f  검증 통과 (경고 ${warningCount}건). 업로드 가능합니다.\n`);
    } else {
      console.log('\n\u2705 검증 통과! union upload로 업로드할 수 있습니다.\n');
    }
  });

function getDirSize(dir: string): number {
  let size = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(fullPath);
    } else {
      size += fs.statSync(fullPath).size;
    }
  }
  return size;
}

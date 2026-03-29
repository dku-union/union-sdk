import { Command } from 'commander';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, parseSizeLimit } from '../utils/config';
import { generateManifest } from '../utils/manifest';
import { createPackage } from '../utils/packager';

export const buildCommand = new Command('build')
  .description('미니앱 프로덕션 빌드')
  .option('--no-package', '패키징(.unionapp) 생략, dist/ 폴더만 출력')
  .action(async (options) => {
    const cwd = process.cwd();

    // 설정 로드
    let config;
    try {
      config = loadConfig(cwd);
    } catch (err) {
      console.error(`\u274c ${(err as Error).message}`);
      process.exit(1);
    }

    const outDir = config.build?.outDir ?? 'dist';
    const outPath = path.resolve(cwd, outDir);
    const shouldPackage = options.package !== false;
    const totalSteps = shouldPackage ? 4 : 3;

    console.log(`\n\ud83d\udce6 Union Build: ${config.name} v${config.version}\n`);

    // 기존 빌드 삭제
    if (fs.existsSync(outPath)) {
      fs.rmSync(outPath, { recursive: true });
    }

    // 기존 .unionapp 삭제
    const prevPackage = path.resolve(cwd, `${config.appId}-${config.version}.unionapp`);
    if (fs.existsSync(prevPackage)) {
      fs.rmSync(prevPackage);
    }

    // 1. Vite 빌드
    console.log(`1/${totalSteps} \ud83d\udd28 Vite 빌드 중...`);
    try {
      execSync('npx vite build', { cwd, stdio: 'inherit' });
    } catch {
      console.error('\n\u274c 빌드 실패');
      process.exit(1);
    }

    // index.html 존재 확인
    if (!fs.existsSync(path.join(outPath, 'index.html'))) {
      console.error('\n\u274c 빌드 출력에 index.html이 없습니다.');
      process.exit(1);
    }

    // 2. 에셋 처리
    console.log(`2/${totalSteps} \ud83c\udfa8 에셋 처리 중...`);
    const iconSrc = path.resolve(cwd, config.icon ?? './assets/icon.png');
    if (fs.existsSync(iconSrc)) {
      fs.copyFileSync(iconSrc, path.join(outPath, 'icon.png'));
    }

    // 3. 매니페스트 생성
    console.log(`3/${totalSteps} \ud83d\udcdd 매니페스트 생성 중...`);
    const manifest = generateManifest(config, outPath);

    // 번들 사이즈 체크
    const maxSize = parseSizeLimit(config.build?.maxBundleSize ?? '2MB');
    const sizeKB = (manifest.bundleSize / 1024).toFixed(1);
    const maxKB = (maxSize / 1024).toFixed(1);

    if (manifest.bundleSize > maxSize) {
      console.error(`\n\u274c 번들 사이즈 초과: ${sizeKB}KB / ${maxKB}KB`);
      process.exit(1);
    }

    // 4. 패키징
    if (shouldPackage) {
      console.log(`4/${totalSteps} \ud83d\udce6 패키징 중...`);
      try {
        const result = await createPackage(config, outPath);
        const pkgKB = (result.packageSize / 1024).toFixed(1);

        console.log(`
\u2705 빌드 완료!

   출력: ${outDir}/
   패키지: ${result.fileName}
   번들 사이즈: ${sizeKB}KB / ${maxKB}KB (압축 전)
   패키지 사이즈: ${pkgKB}KB (압축 후)
   체크섬: ${manifest.checksum}

   다음 단계:
   union validate   # 빌드 검증
   union upload     # 플랫폼 업로드
`);
      } catch (err) {
        console.error(`\n\u274c 패키징 실패: ${(err as Error).message}`);
        process.exit(1);
      }
    } else {
      console.log(`
\u2705 빌드 완료!

   출력: ${outDir}/
   번들 사이즈: ${sizeKB}KB / ${maxKB}KB
   체크섬: ${manifest.checksum}

   다음 단계:
   union validate   # 빌드 검증
   union upload     # 플랫폼 업로드
`);
    }
  });

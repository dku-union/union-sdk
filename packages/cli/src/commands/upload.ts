import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../utils/config';

export const uploadCommand = new Command('upload')
  .option('-d, --dir <dir>', '업로드할 빌드 디렉토리', 'dist')
  .option('--staging', 'Staging 환경에 업로드')
  .option('--production', 'Production 환경에 업로드')
  .description('빌드 결과물을 Union 플랫폼에 업로드')
  .action((options) => {
    const cwd = process.cwd();
    const buildDir = path.resolve(cwd, options.dir);

    // 빌드 디렉토리 확인
    if (!fs.existsSync(buildDir)) {
      console.error('\u274c 빌드 디렉토리를 찾을 수 없습니다. union build를 먼저 실행해주세요.');
      process.exit(1);
    }

    // 매니페스트 확인
    const manifestPath = path.join(buildDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.error('\u274c manifest.json을 찾을 수 없습니다. union build를 먼저 실행해주세요.');
      process.exit(1);
    }

    let config;
    try {
      config = loadConfig(cwd);
    } catch (err) {
      console.error(`\u274c ${(err as Error).message}`);
      process.exit(1);
    }

    const env = options.production ? 'production' : 'staging';

    console.log(`
\ud83d\ude80 Union Upload

   앱: ${config.name} (${config.appId})
   버전: ${config.version}
   환경: ${env}
   디렉토리: ${options.dir}/
`);

    // TODO: 실제 API 연동
    // 1. 퍼블리셔 토큰 확인 (~/.union/credentials)
    // 2. union validate 자동 실행
    // 3. dist/ 디렉토리 tar.gz 압축
    // 4. POST /api/v1/publisher/apps/{appId}/versions 호출
    // 5. 빌드 파일 업로드
    // 6. Staging/Production URL 반환

    console.log(`\u26a0\ufe0f  업로드 기능은 백엔드 API 연동 후 활성화됩니다.`);
    console.log(`   현재는 union build + union validate까지 사용 가능합니다.\n`);
  });

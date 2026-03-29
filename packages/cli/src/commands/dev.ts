import { Command } from 'commander';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../utils/config';

export const devCommand = new Command('dev')
  .option('-p, --port <port>', '개발 서버 포트', '3000')
  .description('개발 서버 시작 (Mock Bridge 자동 적용)')
  .action((options) => {
    const cwd = process.cwd();

    // union.config.json 존재 확인
    try {
      loadConfig(cwd);
    } catch {
      console.error('\u274c union.config.json을 찾을 수 없습니다. union create로 프로젝트를 생성해주세요.');
      process.exit(1);
    }

    // vite 존재 확인
    const viteBin = path.join(cwd, 'node_modules', '.bin', 'vite');
    if (!fs.existsSync(viteBin)) {
      console.error('\u274c Vite를 찾을 수 없습니다. npm install을 실행해주세요.');
      process.exit(1);
    }

    console.log(`
\ud83d\ude80 Union Dev Server 시작
   포트: ${options.port}
   플랫폼: mock (브라우저)
   Bridge: Mock 어댑터 자동 적용

   SDK API 호출 로그가 브라우저 콘솔에 출력됩니다.
`);

    try {
      execSync(`npx vite --port ${options.port}`, {
        cwd,
        stdio: 'inherit',
      });
    } catch {
      // Ctrl+C 종료 시 정상
    }
  });

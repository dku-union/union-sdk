import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export const createCommand = new Command('create')
  .argument('<app-name>', '미니앱 이름')
  .description('새 Union 미니앱 프로젝트 생성')
  .action((appName: string) => {
    const targetDir = path.resolve(process.cwd(), appName);

    if (fs.existsSync(targetDir)) {
      console.error(`\u274c "${appName}" 디렉토리가 이미 존재합니다.`);
      process.exit(1);
    }

    console.log(`\n\u2728 Union 미니앱 "${appName}" 생성 중...\n`);

    // SDK 로컬 경로 탐색 (CLI 기준 상대 경로)
    const sdkPath = resolveSDKPath();

    // 템플릿 복사
    const templateDir = path.resolve(__dirname, '../../templates/default');
    if (fs.existsSync(templateDir)) {
      copyDir(templateDir, targetDir);
    } else {
      // 템플릿이 없으면 인라인으로 생성
      createInlineTemplate(targetDir, appName);
    }

    // appId 생성
    const sanitized = appName.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const appId = `com.union.${sanitized}`;

    // union.config.json 업데이트
    const configPath = path.join(targetDir, 'union.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.appId = appId;
    config.name = appName;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // package.json — SDK를 로컬 경로로 설정
    const pkgPath = path.join(targetDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    pkg.name = sanitized;
    if (sdkPath) {
      pkg.dependencies['@union-miniapp/sdk'] = `file:${sdkPath}`;
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    // npm install
    console.log('📦 의존성 설치 중...\n');
    try {
      execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
    } catch {
      console.log('\n⚠️  npm install 실패. 수동으로 실행해주세요.');
    }

    console.log(`
\u2705 미니앱 "${appName}" 생성 완료!

  cd ${appName}
  union dev        # 개발 서버 시작
  union build      # 프로덕션 빌드
  union validate   # 빌드 검증
`);
  });

/**
 * CLI 위치 기준으로 SDK 패키지 경로를 찾는다.
 * __dirname부터 상위로 올라가며 packages/sdk 를 탐색한다.
 */
function resolveSDKPath(): string | null {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'packages', 'sdk');
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function createInlineTemplate(targetDir: string, appName: string): void {
  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'assets'), { recursive: true });

  // package.json
  fs.writeFileSync(
    path.join(targetDir, 'package.json'),
    JSON.stringify(
      {
        name: appName,
        version: '1.0.0',
        private: true,
        scripts: {
          dev: 'vite',
          build: 'tsc && vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^18.3.0',
          'react-dom': '^18.3.0',
          '@union-miniapp/sdk': resolveSDKPath() ? `file:${resolveSDKPath()}` : '^1.0.0',
        },
        devDependencies: {
          '@types/react': '^18.3.0',
          '@types/react-dom': '^18.3.0',
          '@vitejs/plugin-react': '^4.3.0',
          typescript: '^5.7.0',
          vite: '^6.0.0',
        },
      },
      null,
      2,
    ),
  );

  // union.config.json
  fs.writeFileSync(
    path.join(targetDir, 'union.config.json'),
    JSON.stringify(
      {
        appId: `com.union.${appName}`,
        name: appName,
        version: '1.0.0',
        description: '',
        icon: './assets/icon.png',
        category: 'utility',
        permissions: ['user.profile'],
        contactEmail: '',
        keywords: [],
        previews: [],
        minSdkVersion: '1.0.0',
        build: {
          entry: 'src/main.tsx',
          outDir: 'dist',
          maxBundleSize: '2MB',
        },
      },
      null,
      2,
    ),
  );

  // tsconfig.json
  fs.writeFileSync(
    path.join(targetDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: ['src'],
      },
      null,
      2,
    ),
  );

  // vite.config.ts
  fs.writeFileSync(
    path.join(targetDir, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
  },
});
`,
  );

  // index.html
  fs.writeFileSync(
    path.join(targetDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
    <title>${appName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );

  // src/main.tsx
  fs.writeFileSync(
    path.join(targetDir, 'src/main.tsx'),
    `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  );

  // src/App.tsx
  fs.writeFileSync(
    path.join(targetDir, 'src/App.tsx'),
    `import { useState, useEffect } from 'react';
import Union from '@union-miniapp/sdk';

function App() {
  const [user, setUser] = useState<{ nickname: string } | null>(null);

  useEffect(() => {
    Union.analytics.trackPageView('home');
  }, []);

  const handleLogin = async () => {
    try {
      await Union.auth.login();
      const profile = await Union.auth.getUserProfile();
      setUser(profile);
      Union.ui.showToast({ message: \`\${profile.nickname}님 환영합니다!\` });
    } catch {
      Union.ui.showToast({ message: '로그인에 실패했습니다.' });
    }
  };

  return (
    <div className="app">
      <h1>${appName}</h1>
      {user ? (
        <p>{user.nickname}님, 안녕하세요!</p>
      ) : (
        <button onClick={handleLogin}>로그인</button>
      )}
    </div>
  );
}

export default App;
`,
  );

  // src/App.css
  fs.writeFileSync(
    path.join(targetDir, 'src/App.css'),
    `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #fff;
  color: #1a1a1a;
}

.app {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  gap: 16px;
}

h1 {
  font-size: 24px;
  font-weight: 700;
}

button {
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 12px;
  background: #4F46E5;
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}

button:active {
  background: #4338CA;
}
`,
  );
}

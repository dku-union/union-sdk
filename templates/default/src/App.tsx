import { useState, useEffect } from 'react';
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
      Union.ui.showToast({ message: `${profile.nickname}님 환영합니다!` });
    } catch {
      Union.ui.showToast({ message: '로그인에 실패했습니다.' });
    }
  };

  return (
    <div className="app">
      <h1>My Union App</h1>
      {user ? (
        <p>{user.nickname}님, 안녕하세요!</p>
      ) : (
        <button onClick={handleLogin}>로그인</button>
      )}
    </div>
  );
}

export default App;


import React, { useState } from 'react';
import { AIChatbot } from './components/AIChatbot';

// Apps Script URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwZAqXNezZvuEFXef4jpua4uw55kTO0-dcJ75MQcYiXNUdgyqCj5A91zEjAumrHGhvK/exec';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [loginInfo, setLoginInfo] = useState({ name: '', pass: '' });
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const [showChatbot, setShowChatbot] = useState(false);

  const handleSecureLogin = async () => {
    if (!loginInfo.name || !loginInfo.pass) {
      alert('성함과 비밀번호를 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const urlWithParams = new URL(APPS_SCRIPT_URL);
      urlWithParams.searchParams.set('mode', 'consultation');
      urlWithParams.searchParams.set('name', loginInfo.name.trim());
      urlWithParams.searchParams.set('pass', loginInfo.pass.trim());
      
      const response = await fetch(urlWithParams.toString(), {
        method: 'GET',
        mode: 'cors',
      });
      
      if (!response.ok) throw new Error('서버 네트워크 상태를 확인해주세요.');
      
      const result = await response.json();

      if (result.success && result.data) {
        // 결과가 배열이면 첫 번째 데이터 사용
        const userData = Array.isArray(result.data) ? result.data[0] : result.data;
        setCurrentUserData(userData);
        setShowChatbot(true);
      } else {
        alert(result.error || '성함 또는 비밀번호가 일치하지 않습니다.');
      }
    } catch (error) {
      console.error('Login Error:', error);
      alert('로그인에 실패했습니다. 성함과 비밀번호를 다시 확인해주시거나, 관리자에게 문의바랍니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] font-[Pretendard] selection:bg-emerald-100 selection:text-emerald-900">
      {showChatbot && currentUserData && (
        <AIChatbot 
          userData={currentUserData} 
          onClose={() => setShowChatbot(false)} 
          scriptUrl={APPS_SCRIPT_URL}
        />
      )}

      <div className="max-w-4xl mx-auto p-6">
        <header className="text-center py-16 animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="inline-block bg-emerald-100 text-emerald-700 px-4 py-1.5 rounded-full text-[11px] font-black mb-4 tracking-widest uppercase shadow-sm border border-emerald-200/50">Eum-Log Manager AI</div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight mb-4">이음로그 맞춤 상담</h1>
          <p className="text-slate-500 font-medium text-sm md:text-base">전담 매니저가 회원님의 프로필을 분석하여 1:1 상담을 시작합니다.</p>
        </header>

        <div className="max-w-md mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-emerald-200/20 border border-emerald-50/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
            
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-emerald-500 text-white rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 shadow-xl shadow-emerald-200 rotate-3 transition-transform hover:rotate-0 duration-300">👩‍💼</div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">상담 매니저 연결</h2>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Identity Verification</p>
            </div>
            
            <div className="space-y-6">
              <div className="group space-y-2">
                <label className="text-[11px] font-black text-slate-400 ml-1 uppercase tracking-wider group-focus-within:text-emerald-500 transition-colors">Name / 성함</label>
                <input 
                  type="text" 
                  placeholder="성함을 입력하세요"
                  value={loginInfo.name}
                  onChange={e => setLoginInfo({...loginInfo, name: e.target.value})}
                  onKeyPress={e => e.key === 'Enter' && handleSecureLogin()}
                  className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl px-6 py-4 text-sm outline-none transition-all placeholder:text-slate-300"
                />
              </div>
              <div className="group space-y-2">
                <label className="text-[11px] font-black text-slate-400 ml-1 uppercase tracking-wider group-focus-within:text-emerald-500 transition-colors">Password / 비밀번호</label>
                <input 
                  type="password" 
                  placeholder="비밀번호를 입력하세요"
                  value={loginInfo.pass}
                  onChange={e => setLoginInfo({...loginInfo, pass: e.target.value})}
                  onKeyPress={e => e.key === 'Enter' && handleSecureLogin()}
                  className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl px-6 py-4 text-sm outline-none transition-all placeholder:text-slate-300"
                />
              </div>
              
              <button 
                onClick={handleSecureLogin}
                disabled={isLoading}
                className="w-full bg-slate-900 text-white rounded-2xl py-5 font-bold text-lg hover:bg-emerald-600 shadow-xl shadow-slate-200 transition-all mt-4 active:scale-[0.98] disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    매니저 연결 중...
                  </span>
                ) : '상담 시작하기'}
              </button>
            </div>

            <div className="mt-10 pt-8 border-t border-slate-50 flex justify-center items-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                Secure connection established
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-12 text-center">
          <p className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.2em]">Eum-Log Premium Matching Service v2.0</p>
        </footer>
      </div>
    </div>
  );
}

export default App;

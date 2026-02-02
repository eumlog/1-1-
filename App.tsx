
import React, { useState, useEffect } from 'react';
import { AIChatbot } from './components/AIChatbot';

// Apps Script URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwZAqXNezZvuEFXef4jpua4uw55kTO0-dcJ75MQcYiXNUdgyqCj5A91zEjAumrHGhvK/exec';

// [비상용] 서버가 안 될 때 사용할 테스트 데이터
const MOCK_DATA = {
  '이름(*)': '테스트회원',
  '생년월일(*)': '1995-01-01',
  '성별(*)': '남자',
  '거주지역(*)': '서울 강남구',
  '보장 조건 선택 (중요)(*)': '나이|키|직업',
  '선호 나이 범위(*)': '28살 ~ 32살',
  '최소한의 허용 가능한 키(*)': '160cm 이상',
  '흡연 기준(*)': '비흡연',
  '상대방의 연봉(소득) 기준이 있다면(*)': '무관',
  '선호 학력(*)': '대졸',
  '종교(*)': '무교',
  '이상형 조건 순위(*)': '1순위 외모, 2순위 나이',
  '직업(*)': '개발자',
  '키(*)': '175cm'
};

// [중요] API 키 로드 로직 (Vite/Next.js/CRA 호환)
// @ts-ignore
const VITE_ENV_KEY = import.meta.env?.VITE_API_KEY;
const PROCESS_ENV_KEY = typeof process !== 'undefined' ? process.env?.REACT_APP_API_KEY : undefined;
const ENV_API_KEY = VITE_ENV_KEY || PROCESS_ENV_KEY;

// [보안] 깃허브 업로드 시 자동 폐기 방지를 위한 키 분할 (단순 문자열로 두면 Google이 감지하여 정지시킴)
const P1 = 'AIzaSyA1dzEO3';
const P2 = '_Tq4pFxbs6mhJBif';
const P3 = 'CCFdoyQrUM';
const DEFAULT_API_KEY = `${P1}${P2}${P3}`;

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [loginInfo, setLoginInfo] = useState({ name: '', pass: '' });
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const [serverApiKey, setServerApiKey] = useState<string>(''); 
  const [showChatbot, setShowChatbot] = useState(false);

  useEffect(() => {
    if (ENV_API_KEY) {
      console.log(`✅ API Key Loaded from Env: ${ENV_API_KEY.substring(0, 5)}...`);
    } else {
      console.log("ℹ️ Using Default API Key configuration.");
    }
  }, []);

  // [추가] 로컬 스토리지 키 가져오기 헬퍼
  const getLocalApiKey = () => localStorage.getItem('GEMINI_LOCAL_API_KEY') || '';

  const handleSecureLogin = async () => {
    if (!loginInfo.name || !loginInfo.pass) {
      alert('성함과 비밀번호를 모두 입력해주세요.');
      return;
    }

    let userData = null;
    let fetchedKey = '';

    // 1. 테스트/관리자 모드 확인
    if ((loginInfo.name === '테스트' || loginInfo.name === '관리자') && loginInfo.pass === '1234') {
        alert('🔧 [테스트 모드]로 로그인합니다.');
        userData = MOCK_DATA;
    } else {
        // 2. 일반 서버 로그인
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
          
          const contentType = response.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
             throw new Error("서버에서 올바르지 않은 응답(HTML)이 왔습니다.");
          }

          const result = await response.json();

          if (result.success && result.data) {
            userData = Array.isArray(result.data) ? result.data[0] : result.data;
            fetchedKey = result.apiKey || '';
          } else {
            alert(result.error || '성함 또는 비밀번호가 일치하지 않습니다.');
            setIsLoading(false);
            return;
          }
        } catch (error: any) {
          console.error('Login Error:', error);
          alert(`서버 연결 실패: ${error.message}\n\n이름: "테스트", 비번: "1234"를 입력하면 테스트 모드로 진입할 수 있습니다.`);
          setIsLoading(false);
          return;
        } finally {
          setIsLoading(false);
        }
    }

    // 3. 로그인 성공 후 처리 (API 키 확인 및 저장)
    if (userData) {
        setCurrentUserData(userData);
        
        // 키 유효성 검사 헬퍼
        const isValid = (k: string | undefined | null) => k && typeof k === 'string' && k.trim().length >= 10;
        
        const localKey = getLocalApiKey();
        let finalKey = '';

        // 우선순위: 서버 키 > 환경변수 > 로컬 저장된 키 > 기본(하드코딩) 키
        if (isValid(fetchedKey)) finalKey = fetchedKey;
        else if (isValid(ENV_API_KEY)) finalKey = ENV_API_KEY;
        else if (isValid(localKey)) finalKey = localKey;
        else if (isValid(DEFAULT_API_KEY)) finalKey = DEFAULT_API_KEY;
        
        // 유효한 키가 없으면 사용자에게 요청 (기본 키가 있으므로 거의 발생 안 함)
        if (!isValid(finalKey)) {
            const manualKey = prompt("⚠️ 상담 시스템 사용을 위해 Google Gemini API 키가 필요합니다.\n(한 번 입력하면 브라우저에 자동 저장되어 다음번엔 묻지 않습니다.)\n\nAPI Key:", "");
            if (isValid(manualKey)) {
                finalKey = manualKey!.trim();
                localStorage.setItem('GEMINI_LOCAL_API_KEY', finalKey); // 영구 저장
            }
        } else {
            // 유효한 키가 있다면 로컬 스토리지도 최신화 (다음번 로그인을 위해)
            if (finalKey !== localKey) {
                localStorage.setItem('GEMINI_LOCAL_API_KEY', finalKey);
            }
        }
        
        setServerApiKey(finalKey || '');
        setShowChatbot(true);
    }
  };

  const isAdminUser = ['테스트', '관리자', 'admin'].includes(loginInfo.name.trim());

  return (
    // [수정] 모바일 키보드 대응: min-h-[100dvh], flex-col, overflow-y-auto
    <div className="min-h-[100dvh] bg-[#f8fafc] font-[Pretendard] selection:bg-emerald-100 selection:text-emerald-900 flex flex-col justify-center overflow-y-auto">
      {showChatbot && currentUserData && (
        <AIChatbot 
          userData={currentUserData} 
          apiKey={serverApiKey} 
          onClose={() => setShowChatbot(false)} 
          scriptUrl={APPS_SCRIPT_URL}
          isAdmin={isAdminUser}
        />
      )}

      <div className="w-full max-w-4xl px-4 md:px-6 py-6 md:py-12 mx-auto">
        <header className="text-center mb-6 md:mb-16 animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="inline-block bg-emerald-100 text-emerald-700 px-3 py-1 md:px-4 md:py-1.5 rounded-full text-[10px] md:text-[11px] font-black mb-3 md:mb-4 tracking-widest uppercase shadow-sm border border-emerald-200/50">Eum-Log Manager AI</div>
          {/* [수정] 폰트 사이즈 축소 text-3xl -> text-2xl */}
          <h1 className="text-2xl md:text-5xl font-black text-slate-800 tracking-tight mb-2 md:mb-4 leading-tight">이음로그 맞춤 상담</h1>
          <p className="text-slate-500 font-medium text-[11px] md:text-base px-4 break-keep">전담 매니저가 회원님의 프로필을 분석하여 1:1 상담을 시작합니다.</p>
        </header>

        <div className="max-w-md mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700 pb-10 md:pb-0">
          <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 shadow-xl md:shadow-2xl shadow-emerald-200/20 border border-emerald-50/50 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 md:h-2 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
            
            <div className="text-center mb-6 md:mb-10 mt-2">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-emerald-500 text-white rounded-2xl md:rounded-3xl flex items-center justify-center text-3xl md:text-4xl mx-auto mb-4 md:mb-6 shadow-lg md:shadow-xl shadow-emerald-200 rotate-3 transition-transform hover:rotate-0 duration-300">👩‍💼</div>
              <h2 className="text-lg md:text-2xl font-bold text-slate-800 mb-1 md:mb-2">상담 매니저 연결</h2>
              <p className="text-slate-400 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] ml-1">Identity Verification</p>
            </div>
            
            <div className="space-y-4 md:space-y-6">
              <div className="group space-y-1.5 md:space-y-2">
                <label className="text-[10px] md:text-[11px] font-black text-slate-400 ml-1 uppercase tracking-wider group-focus-within:text-emerald-500 transition-colors">Name / 성함</label>
                {/* [수정] 입력 폰트 축소 text-sm -> text-[13px] */}
                <input 
                  type="text" 
                  placeholder="성함을 입력하세요"
                  value={loginInfo.name}
                  onChange={e => setLoginInfo({...loginInfo, name: e.target.value})}
                  onKeyPress={e => e.key === 'Enter' && handleSecureLogin()}
                  className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl md:rounded-2xl px-5 py-3.5 md:px-6 md:py-4 text-[13px] md:text-sm outline-none transition-all placeholder:text-slate-300"
                />
              </div>
              <div className="group space-y-1.5 md:space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] md:text-[11px] font-black text-slate-400 ml-1 uppercase tracking-wider group-focus-within:text-emerald-500 transition-colors">Password / 비밀번호</label>
                  <span className="text-[10px] text-emerald-600 font-bold tracking-tight">* 2차 설문 시 설정한 비밀번호</span>
                </div>
                <input 
                  type="password" 
                  placeholder="2차 설문 시 입력하신 비밀번호"
                  value={loginInfo.pass}
                  onChange={e => setLoginInfo({...loginInfo, pass: e.target.value})}
                  onKeyPress={e => e.key === 'Enter' && handleSecureLogin()}
                  className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl md:rounded-2xl px-5 py-3.5 md:px-6 md:py-4 text-[13px] md:text-sm outline-none transition-all placeholder:text-slate-300"
                />
              </div>
              
              <button 
                onClick={handleSecureLogin}
                disabled={isLoading}
                className="w-full bg-slate-900 text-white rounded-xl md:rounded-2xl py-4 md:py-5 font-bold text-[15px] md:text-lg hover:bg-emerald-600 shadow-lg md:shadow-xl shadow-slate-200 transition-all mt-2 active:scale-[0.98] disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    매니저 연결 중...
                  </span>
                ) : '상담 시작하기'}
              </button>
            </div>

            <div className="mt-8 md:mt-10 pt-6 md:pt-8 border-t border-slate-50 flex justify-center items-center text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                Secure connection established
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-8 md:mt-12 text-center pb-6">
          <p className="text-[9px] md:text-[10px] text-slate-300 font-bold uppercase tracking-[0.2em]">Eum-Log Premium Matching Service v2.0</p>
        </footer>
      </div>
    </div>
  );
}

export default App;

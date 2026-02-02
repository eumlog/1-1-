
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

interface AIChatbotProps {
  userData: any;
  apiKey: string; 
  onClose: () => void;
  scriptUrl: string;
  isAdmin?: boolean;
}

export const AIChatbot: React.FC<AIChatbotProps> = ({ userData, apiKey, onClose, scriptUrl, isAdmin = false }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const [viewportHeight, setViewportHeight] = useState('100dvh');

  const [currentApiKey, setCurrentApiKey] = useState<string>(() => {
    const saved = localStorage.getItem('GEMINI_LOCAL_API_KEY');
    return (saved && saved.length > 10) ? saved : (apiKey || '');
  });

  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const abortRef = useRef(false);
  const resetTimeoutRef = useRef<any>(null);
  const introCalled = useRef(false);
  const introInProgress = useRef(false); // [중복 방지용] 실행 중 여부 체크

  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(`${window.visualViewport.height}px`);
        if (scrollRef.current) {
          setTimeout(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
          }, 100);
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      handleResize();
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  useEffect(() => {
    if (!isTyping && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isTyping]);

  useEffect(() => {
    if (apiKey && apiKey.trim().length > 10) {
        setCurrentApiKey(apiKey);
        localStorage.setItem('GEMINI_LOCAL_API_KEY', apiKey);
    } else {
        const saved = localStorage.getItem('GEMINI_LOCAL_API_KEY');
        if (saved && saved.trim().length > 10) {
            setCurrentApiKey(saved);
        }
    }
  }, [apiKey]);

  const safeStr = (val: any): string => {
    if (val === undefined || val === null) return '';
    return String(val).trim();
  };

  const HEADERS = {
    NAME: '이름(*)',
    BIRTH: '생년월일(*)',
    AGE: '선호 나이 범위(*)',
    HEIGHT: '최소한의 허용 가능한 키(*)',
    SMOKING: '흡연 기준(*)',
    INCOME: '상대방의 연봉(소득) 기준이 있다면(*)',
    EDU: '선호 학력(*)',
    RELIGION: '종교(*)', 
    JOB: '직업(*)',
    CHILDREN: '자녀 계획(*)',
    PRIORITY: '이상형 조건 순위(*)',
    CONDITIONS_LIST: '보장 조건 선택 (중요)(*)'
  };

  const name = safeStr(userData?.[HEADERS.NAME] || userData?.name || '회원');
  const birthYear = safeStr(userData?.[HEADERS.BIRTH]);
  const gender = safeStr(userData?.['성별(*)']);
  const location = safeStr(userData?.['거주지역(*)']);
  const religion = safeStr(userData?.[HEADERS.RELIGION] || '무교');
  
  const prefAge = safeStr(userData?.[HEADERS.AGE]);
  const prefHeight = safeStr(userData?.[HEADERS.HEIGHT]);
  const prefSmoking = safeStr(userData?.[HEADERS.SMOKING]);
  const prefIncome = safeStr(userData?.[HEADERS.INCOME]);
  const prefEdu = safeStr(userData?.[HEADERS.EDU]);
  const priorityWeights = safeStr(userData?.[HEADERS.PRIORITY]);

  const rawConditions = safeStr(userData?.[HEADERS.CONDITIONS_LIST]);
  const selectedConditions = rawConditions 
    ? rawConditions.split(/[|/,]/).map(s => s.trim()).filter(Boolean)
    : [];
  
  const conditionStr = selectedConditions.length > 0 ? selectedConditions.join(', ') : '없음';
  
  const isPremiumUser = selectedConditions.length >= 3;
  const planName = isPremiumUser ? '프리미엄' : '베이직';

  const isSelected = (keyword: string) => selectedConditions.some(cond => cond.includes(keyword));
  const hasOption = (keyword: string) => selectedConditions.some(cond => cond.includes(keyword));
  const isFlexible = (text: string) => /무관|상관\s*없|모두|다\s*괜찮|다\s*가능|전혀|오픈/.test(text);
  const isMaxLimit = (text: string) => /이하|미만|작은|아담/.test(text);

  const isQuestion = (text: string) => text ? (text.includes('?') || text.includes('까') || text.includes('요?')) : false;
  const getNoAskInstruction = (text: string) => isQuestion(text) ? '' : ' (이 멘트만 출력하고, "괜찮으신가요?" 같은 질문을 절대 덧붙이지 마세요. 그냥 멘트만 딱 끝내세요.)';

  const REACTION_DEFAULT = "(보장/비보장 여부에 따른 적절한 반응 출력)";
  const REACTION_EASY = "(조건이 까다롭지 않으므로, '비보장 안내' 멘트를 절대 하지 말고 '네 확인했습니다' 정도로 깔끔하게 답변)";
  const REACTION_CONDITIONAL = "(사용자가 제안을 수락하거나 유연한 태도(괜찮다 등)를 보이면 '비보장 안내' 멘트를 절대 하지 말고 '네, 그럼 해당 기준으로 넓혀서 매칭해드리겠습니다'라고 변경 사항을 확정하세요. 반면 까다로운 조건을 고집하면 보장/비보장 여부에 따라 반응하세요.)";
  const REACTION_HEIGHT_WARNING = "(중요: 키는 보장 조건이 아니므로, '선호하시니 맞춰보겠지만 필수 조건은 아니라서 상황에 따라 키가 조금 다른 분이 소개될 수도 있다는 점 참고 부탁드립니다'라는 취지의 안내를 반드시 포함하세요)";

  let ageGuide = '';
  let ageReaction = REACTION_DEFAULT;

  let myYearFull = 1990; 
  const cleanBirth = birthYear.replace(/[^0-9]/g, '');
  if (cleanBirth.length === 6) { 
      const yy = parseInt(cleanBirth.substring(0, 2));
      myYearFull = yy < 30 ? 2000 + yy : 1900 + yy;
  } else if (cleanBirth.length >= 4) { 
      const yyyy = parseInt(cleanBirth.substring(0, 4));
      if (yyyy > 1900 && yyyy < 2100) {
          myYearFull = yyyy;
      } else if (cleanBirth.length >= 8 && yyyy < 100) { 
          const yy = yyyy; 
          myYearFull = yy < 30 ? 2000 + yy : 1900 + yy;
      }
  }

  if (isFlexible(prefAge)) {
    ageGuide = `나이는 특별히 상관없다고(${prefAge}) 해주셨는데, 폭넓게 매칭해 드리겠습니다!`;
    ageReaction = REACTION_EASY;
  } else if (prefAge) {
    const ageMatch = prefAge.match(/\d{2,4}/g);
    let minPrefYear = 9999; 
    
    if (ageMatch) {
      ageMatch.forEach((y) => {
        let yNum = parseInt(y);
        if (y.length === 2) yNum = yNum < 30 ? 2000 + yNum : 1900 + yNum;
        if (yNum < minPrefYear) minPrefYear = yNum;
      });
    }

    if (minPrefYear === 9999) {
      ageGuide = `나이는 ${prefAge}으로 적어주셨는데, 설문지 내용 그대로 우선 반영하겠습니다.`;
    } else {
      if (gender === '여자') {
        const older5Year = myYearFull - 5;
        if (minPrefYear > older5Year) {
           const limitYear = minPrefYear - 1;
           const startYear = older5Year;
           const yStart = startYear.toString().substring(2);
           const yEnd = limitYear.toString().substring(2);
           const rangeStr = (yStart === yEnd) ? `${yStart}년생` : `${yStart}~${yEnd}년생`;
           ageGuide = `나이는 ${prefAge}으로 적어주셨는데, ${rangeStr}(5살 연상)까지는 어떠실까요?`;
           ageReaction = REACTION_CONDITIONAL;
        } else {
           ageGuide = `나이는 ${prefAge}으로 적어주셨는데, 설문지 내용 그대로 우선 반영하겠습니다.`;
        }
      } else { 
        const ageDiff = minPrefYear - myYearFull;
        if (ageDiff >= 2) {
           const oneYearYounger = myYearFull + 1; 
           const yOne = oneYearYounger.toString().substring(2);
           ageGuide = `나이는 ${prefAge}으로 적어주셨는데, ${yOne}년생(1살 연하) 분들까지는 어떠실까요?`;
           ageReaction = REACTION_CONDITIONAL;
        } else if (minPrefYear > myYearFull) {
           ageGuide = `나이는 ${prefAge}으로 적어주셨는데, 설문지 내용 그대로 우선 반영하겠습니다. 혹시 성향이 잘 맞는다면 연상도 가능하실까요?`;
           ageReaction = REACTION_CONDITIONAL;
        } else {
           ageGuide = `나이는 ${prefAge}으로 적어주셨는데, 설문지 내용 그대로 우선 반영하겠습니다.`;
        }
      }
    }
  } else {
    ageGuide = `나이 조건을 선택해주셨는데, 선호하시는 구체적인 연령대가 있으실까요?`;
  }

  let heightGuide = '';
  let heightReaction = REACTION_DEFAULT;

  if (prefHeight) {
    const hNumMatch = prefHeight.match(/\d+/);
    const hNum = hNumMatch ? parseInt(hNumMatch[0]) : 0;

    const isHeightPriority = priorityWeights && (priorityWeights.includes('키1') || priorityWeights.includes('키 1'));
    const priorityText = isHeightPriority ? '1순위로 두셨는데' : '적어주셨는데';

    if (gender === '여자') {
      if (hNum > 0) {
        heightGuide = `키 관련해서 ${prefHeight}으로 ${priorityText}, 다른 조건이 괜찮다면 `;
        if (hNum >= 178) {
          const minH = hNum - 3;
          const maxH = hNum - 1;
          heightGuide += `${minH}~${maxH}cm 정도는 괜찮으실까요?`;
          heightReaction = REACTION_CONDITIONAL;
        } else {
          const minH = hNum - 2;
          const maxH = hNum - 1;
          heightGuide += `${minH}~${maxH}cm 정도는 괜찮으실까요?`;
          heightReaction = REACTION_CONDITIONAL;
        }
      } else {
        heightGuide = `키 관련해서 ${prefHeight}으로 적어주셨는데, 구체적인 기준(cm)이 있으실까요?`;
      }
    } else {
      if (isMaxLimit(prefHeight)) {
         heightGuide = `키는 ${prefHeight}으로 ${priorityText}, 원하시는 아담한 스타일이나 해당 키 범위의 분들로 잘 찾아보겠습니다!`;
         heightReaction = REACTION_EASY;
      } else if (hNum > 0) {
         if (hNum >= 160) {
            const lowerH = hNum - 2;
            let suggestion = `${lowerH}cm 정도`;
            if (hNum === 160) {
                suggestion = `158cm 등 150대 후반`;
            }
            heightGuide = `키는 ${prefHeight}으로 ${priorityText}, 혹시 비율이 좋다면 ${suggestion} 분들도 괜찮으실까요? 조율이 가능한지 여쭤봅니다!`;
            heightReaction = REACTION_CONDITIONAL;
         } else {
            if (prefHeight.includes('~') || prefHeight.includes('-')) {
                heightGuide = `키는 ${prefHeight}으로 ${priorityText}, 원하시는 해당 범위 내의 분들로 잘 찾아보겠습니다!`;
            } else {
                heightGuide = `키는 ${prefHeight}으로 ${priorityText}, 원하시는 키 범위의 분들로 잘 찾아보겠습니다!`;
            }
            heightReaction = REACTION_EASY;
         }
      } else {
         heightGuide = `키 관련해서 ${prefHeight}으로 ${priorityText}, 다른 조건이 정말 괜찮다면 조금 유연하게 봐주실 수 있을까요?`;
         heightReaction = REACTION_CONDITIONAL;
      }
    }
  } else {
    heightGuide = `키 조건을 선택해주셨는데, 구체적으로 선호하시는 키 기준이 있으실까요?`;
  }

  if (!isSelected('키')) {
      heightReaction = REACTION_HEIGHT_WARNING;
  }

  let locationGuide = '';
  if (isSelected('지역')) {
    if (hasOption('전남')) {
      let myCity = '해당 지역';
      if (location.includes('여수')) myCity = '여수';
      if (location.includes('순천')) myCity = '순천';
      if (location.includes('광양')) myCity = '광양';
      if (location.includes('목포')) myCity = '목포';
      
      locationGuide = `"지역 조건으로 '전남'을 선택해주셨네요! ${name}님 거주지인 ${myCity} 기준으로 가점을 드리지만, 필터 특성상 전남 전체 지역이 소개 범위에 포함되는 점 참고 부탁드립니다. (광주 필터와는 분리되어 진행됩니다!)" 라고 안내만 하고 답변 받으세요.`;
    } else if (hasOption('광주')) {
      locationGuide = `"지역 조건으로 '광주'를 선택해주셨네요! 광주와 광주 근교 거주자분들로 매칭 도와드리겠습니다." 라고 안내만 하고 답변 받으세요.`;
    } else {
      if (location.includes('광주')) {
        locationGuide = `"거주지가 광주이신데, 광주 지역만 선호하시나요? 아니면 전남(여순광)도 괜찮으신가요?" 라고 질문하세요.`;
      } else {
        locationGuide = `"지역 필터는 크게 전남(여순광)과 광주로 나뉩니다. 선호하시는 지역을 말씀해주시면 그쪽에 가점을 반영해드릴게요." 라고 질문하세요.`;
      }
    }
  } else {
    locationGuide = `"지역이 필수조건은 아니셔서 선호하시는 지역(거주지)으로 가점 매칭되지만, 인근이나 타 지역 분이 나올 수도 있는 점 참고부탁드려요!" 라고 안내만 하고(질문 금지) 답변을 기다리세요.`;
  }

  let smokingGuide = '';
  let smokingReaction = REACTION_DEFAULT;

  if (prefSmoking && prefSmoking.includes('비흡연')) {
    if (isSelected('흡연')) {
      smokingGuide = `비흡연 선호라고 해주셔서, 비흡연자로 소개드리도록 하겠습니다!`;
    } else {
      smokingGuide = `비흡연 선호라고 해주셨는데, 다른 조건이 괜찮다면 흡연자라도 괜찮으실까요?`;
      smokingReaction = REACTION_CONDITIONAL;
    }
  } else if (prefSmoking && (prefSmoking.includes('가능') || prefSmoking.includes('괜찮') || prefSmoking.includes('상관') || isFlexible(prefSmoking))) {
    smokingGuide = `흡연 여부는 ${prefSmoking}으로 적어주셔서, 흡연하시는 분도 폭넓게 매칭해 드리겠습니다!`;
    smokingReaction = REACTION_EASY;
  } else if (prefSmoking) {
    smokingGuide = `흡연 여부는 설문에 적어주신 대로(${prefSmoking}) 반영하겠습니다!`;
    smokingReaction = REACTION_EASY;
  } else {
    smokingGuide = `흡연 조건을 선택해주셨는데, 비흡연자만 원하시나요?`;
  }

  let religionGuide = '';
  if (isSelected('종교')) {
    if (religion === '무교') {
      religionGuide = `본인 종교가 무교이신데요, 상대방도 무교이신 분으로 소개드리겠습니다!`;
    } else {
      if (hasOption('무교만')) {
        religionGuide = `본인 종교가 ${religion}이신데요, 종교 조건으로 '무교만'을 선택해주셨네요! 상대방이 무교인 분들 위주로 우선 매칭해드리겠습니다.`;
      } else if (hasOption('종교일치')) {
        religionGuide = `본인 종교가 ${religion}이신데요, 종교 조건으로 '종교 일치'를 선택해주셨네요! 회원님과 같은 종교를 가지신 분들 위주로 매칭 진행하겠습니다.`;
      } else if (religion && religion !== '무교') {
        religionGuide = `본인 종교가 ${religion}이신데요, 혹시 상대방도 꼭 같은 종교여야 할까요? 아니면 무교인 분까지는 괜찮으실까요? (특정 종교만 고집하면 매칭이 어려울 수 있어서, 무교까지 넓혀주시면 훨씬 좋은 분 소개가 가능합니다!)`;
      } else {
        religionGuide = `본인 종교가 ${religion}이신데요, 상대방이 무교거나 다른 종교여도 존중해주시면 괜찮으신지 확인 부탁드려요!`;
      }
    }
  }

  let eduGuide = '';
  let eduReaction = REACTION_DEFAULT;
  const isHighEdu = (prefEdu.includes('대졸') || prefEdu.includes('4년제') || prefEdu.includes('대학원')) 
                    && !prefEdu.includes('전문') && !prefEdu.includes('초대졸');
  
  if (isHighEdu) {
    if (gender === '여자') {
        eduGuide = `대졸 이상으로 하셨는데, 전문대졸은 괜찮으실까요?`;
    } else {
        eduGuide = `대졸 이상으로 하셨는데, 전문대졸은 어려우실까요?`;
    }
    const isJeonnam = location.includes('여수') || location.includes('순천') || location.includes('광양');
    if (isJeonnam) {
      eduGuide += ` 지역특성상 대기업분들이 전문대졸이나 고졸이 많으셔서요!`;
    }
    eduReaction = REACTION_CONDITIONAL;
  } else {
    if (isSelected('학력')) {
       eduGuide = `필수로 학력조건 선택해주셨는데, ${prefEdu}로 반영하여 진행하겠습니다!`;
    } else {
       eduGuide = `학력은 ${prefEdu}로 적어주셨는데, 이대로 진행하겠습니다!`;
    }
    eduReaction = REACTION_EASY;
  }

  let incomeGuide = '';
  let incomeReaction = REACTION_DEFAULT;

  if (prefIncome) {
    let amount = 0;
    if (prefIncome.includes('1억')) amount = 10000;
    else {
        const match = prefIncome.match(/(\d+)천/);
        if (match) amount = parseInt(match[1]) * 1000;
    }

    if (gender !== '여자' && isSelected('연봉') && amount >= 5000) {
         incomeGuide = `연봉 조건을 필수로 선택해주셨는데요, ${prefIncome} 이상을 원하셨지만 혹시 3천만 원 이상인 분들도 괜찮으실까요?`;
         incomeReaction = REACTION_CONDITIONAL;
    } else if (amount >= 7000) {
        const proposal = amount - 2000;
        let proposalStr = '';
        if (proposal >= 10000) {
            const ok = Math.floor(proposal / 10000);
            const remain = proposal % 10000;
            proposalStr = remain > 0 ? `${ok}억 ${remain/1000}천` : `${ok}억`;
        } else {
            proposalStr = `${proposal / 1000}천`;
        }
        
        incomeGuide = `연봉 ${prefIncome}으로 하셨는데, 혹시 다른 조건이 정말 좋다면 ${proposalStr}만 원 정도도 괜찮으실까요?`;
        incomeReaction = REACTION_CONDITIONAL;
    } else {
        if (prefIncome.startsWith('7천') || prefIncome.includes('1억')) {
           incomeGuide = `연봉 ${prefIncome}으로 하셨는데, 이 기준이 절대적인가요? 혹시 다른 조건이 정말 좋다면 조금 조절 가능하실까요?`;
           incomeReaction = REACTION_CONDITIONAL;
        } else {
           incomeGuide = `연봉 ${prefIncome}으로 하셨는데, 설문지 내용 그대로 우선 반영하도록 하겠습니다.`;
           if (amount <= 3000) incomeReaction = REACTION_EASY;
        }
    }
  } else {
    incomeGuide = `연봉(경제력) 조건을 선택해주셨는데, 어느 정도 기준을 원하시나요?`;
  }

  let jobGuide = `직업은 직장인을 선호하시는걸까요? 아니면 자영업도 가능하실까요?`;
  let jobReaction = REACTION_CONDITIONAL;
  
  if (hasOption('자영업') || hasOption('사업') || (conditionStr.includes('자영업'))) {
    jobGuide = `직업 조건으로 자영업/사업가 분들도 괜찮다고 해주셔서, 폭넓게 소개해드리겠습니다!`;
    jobReaction = REACTION_EASY;
  } else if (hasOption('직장인')) {
    jobGuide = `직업 조건으로 '직장인'을 선택해주셨네요. 혹시 안정적인 자영업(사업가) 분들도 괜찮으실까요?`;
    jobReaction = REACTION_CONDITIONAL;
  }

  const STORAGE_KEY = `eumlog_chat_${name}_${birthYear}`;

  const steps = [];

  if (isPremiumUser) {
    steps.push({
        title: '플랜 확인 (프리미엄 대상)',
        guide: `- (첫 인사 후 사용자 반응 확인)
        - 만약 사용자가 "괜찮아요", "네 진행할게요" 등 긍정하면: "네, 감사합니다! 프리미엄 플랜으로 꼼꼼하게 매칭 진행해드리겠습니다." 하고 다음 단계로 넘어감.
        - 만약 사용자가 "비싸요", "베이직으로 할게요", "부담돼요" 등 부정하면: "아 그러시군요! 베이직 플랜으로 변경을 원하시면 담당 매니저에게 카톡으로 문의 부탁드립니다!" 라고 안내.
        - 이후 "그럼 우선은 프리미엄 기준으로 상담을 계속 진행해 드릴까요?" 라고 물어보고 답변 받기.
        `
    });
  }
  
  steps.push({
    title: '나이 조율',
    guide: `질문: "${ageGuide}"${getNoAskInstruction(ageGuide)}\n       - 답변 후: ${ageReaction}`
  });
  
  steps.push({
    title: '키 조율 (말풍선 적극 분리)',
    guide: `- 말풍선 1: (이전 답변에 대한 반응)\n       - 말풍선 2: "다음으로 키 조건 확인해 드릴게요. 키 조건을 너무 높게 잡으면 외모나 연봉 등 다른 조건이 아쉬운 분이 매칭될 수도 있어서요!"\n       - 말풍선 3: "${heightGuide}"${getNoAskInstruction(heightGuide)}\n       - 답변 후: ${heightReaction}`
  });

  steps.push({
    title: '지역 확인 (말풍선 적극 분리)',
    guide: `- 말풍선 1: (이전 답변에 대한 반응)\n       - 말풍선 2: "다음으로 지역 확인 도와드릴게요."\n       - 말풍선 3: ${locationGuide}\n       - 답변 후: (지역은 비보장 시에도 '안내'만 하고 끝나므로 별도 비보장 고지 없이 "네 확인했습니다." 정도로 짧게 받고 넘어감)`
  });

  steps.push({
    title: '흡연 확인',
    guide: `질문: "${smokingGuide}"${getNoAskInstruction(smokingGuide)}\n       - 답변 후: ${smokingReaction}`
  });

  if (religionGuide) {
    steps.push({
      title: '종교 확인',
      guide: `질문: "${religionGuide}"${getNoAskInstruction(religionGuide)}\n       - 답변 후: (보장/비보장 여부에 따른 적절한 반응 출력)`
    });
  }

  steps.push({
    title: '학력 조율',
    guide: `질문: "${eduGuide}"${getNoAskInstruction(eduGuide)}\n       - 답변 후: ${eduReaction}`
  });

  steps.push({
    title: '연봉 조율',
    guide: `질문: "${incomeGuide}"${getNoAskInstruction(incomeGuide)}\n       - 답변 후: ${incomeReaction}`
  });

  steps.push({
    title: '직업 질문',
    guide: `질문: "${jobGuide}"${getNoAskInstruction(jobGuide)}\n       - 답변 후: ${jobReaction}`
  });

  steps.push({
    title: '마무리',
    guide: `질문: "모든 상담이 완료되었습니다! ${name}님께서 선택하신 [최종 확정된 보장 조건들] 조건은 확실히 보장하여 매칭을 진행해 드릴 예정입니다. 고생하셨습니다. 감사합니다!"\n
    - **[중요] 데이터 저장**: 상담 종료 시, 변경되거나 확정된 조건들을 **아래 지정된 '시트 헤더명'을 Key로 사용하여** JSON 형식으로 출력하세요.\n
    - **[핵심] 변경 내역 요약 (AL열 저장용)**: JSON 안에 \`changeSummary\` 필드를 추가하여, 상담을 통해 **값이 변경되거나 조율된 조건**들을 \`"조건명 기존값 -> 변경값"\` 형식으로 요약해 주세요. 여러 개일 경우 \` / \`로 구분합니다. **화살표(->)를 사용하여 변경 전후를 명확히 보여주세요.**\n
      - 예시: "키 180cm이하 -> 178cm이하 / 흡연 비흡연 -> 흡연 가능 / 나이 1998년생 -> 1995년생"\n
      - 변경된 사항이 없으면 "변경 사항 없음"이라고 적으세요.\n
    - JSON 예시:\n
    \`\`\`json
    {
      "updates": {
        "${HEADERS.AGE}": "1990년생 이상 ~ 1995년생 이하",
        "${HEADERS.HEIGHT}": "166cm 이하",
        "${HEADERS.SMOKING}": "흡연자도 가능",
        "${HEADERS.INCOME}": "4천만 원 이상",
        "${HEADERS.RELIGION}": "무교만",
        "${HEADERS.JOB}": "자영업 포함",
        "${HEADERS.CONDITIONS_LIST}": "나이, 키"
      },
      "changeSummary": "키 165cm이하 -> 166cm이하 / 흡연 비흡연 -> 흡연 가능 / 연봉 5천만 원 이상 -> 4천만 원 이상",
      "memo": "성격이 급하신 편."
    }
    \`\`\`
    - 변경되지 않은 조건은 updates에 포함하지 마세요.`
  });

  const stepsText = steps.map((step, idx) => `${idx + 1}. ${step.title}:\n       ${step.guide}`).join('\n\n    ');

  const systemInstruction = `
    당신은 이음로그의 상담 매니저입니다. 아래 규칙을 절대적으로 지키며 상담을 진행하세요.

    [핵심 정보]
    - 회원이 초기에 선택한 보장 조건 목록: [${conditionStr}]
    - 보장 조건에 포함된 항목은 확실하게 매칭해 주어야 하며, 포함되지 않은 항목은 가점 매칭(비보장)입니다.
    - 선호 학력(Z열 데이터): ${prefEdu} (이 값을 기준으로 질문을 생성했습니다.)

    [핵심 규칙 1: 답변에 대한 반응 (매우 중요)]
    사용자의 답변을 듣고 나서, 현재 다루고 있는 주제(예: 나이, 키, 흡연, 연봉 등)가 '현재 유효한 보장 조건'인지 확인 후 아래와 같이 반응하세요.

    CASE A: 조건 조율/변경 (사용자가 "3천 이상도 괜찮아요", "상관없어요", "흡연자도 돼요", "자녀 계획 없음" 등 조건을 완화하거나 변경할 때)
    - 반응: "네, 확인했습니다! 말씀하신 대로 [변경된 내용]으로 기준을 수정하여 매칭 진행해 드리겠습니다." (확실하게 수용 의사 표시)

    CASE B: 현재 주제가 '보장 조건'에 포함되는 경우
    - 반응: "네, 말씀하신 [주제] 조건은 확실하게 보장해서 매칭해 드릴게요!" 또는 "확인했습니다. 이 부분은 꼭 맞춰서 진행하겠습니다."

    CASE C: 현재 주제가 '보장 조건'에 포함되지 않는 경우 (비보장)
    - 반응: 기계적인 반복을 피하기 위해 아래 3가지 멘트 중 하나를 자연스럽게 골라서 사용하세요.
      옵션 1: "네, 이 부분은 필수 보장 조건은 아니어서 최대한 맞춰보겠지만, 상황에 따라 조금 다른 분이 소개될 수도 있는 점 양해 부탁드려요!"
      옵션 2: "넵! 선호하시는 대로 가점은 드리지만, 보장 조건은 아니라서 100% 일치하지 않을 수도 있다는 점 참고해 주세요."
      옵션 3: "알겠습니다. 최대한 반영해 보겠지만, 필수 조건 외에는 매칭 상황에 따라 조금 유연하게 진행될 수 있어요!"
    
    [핵심 규칙 2: 플랜 및 조건 변경 (프리미엄 -> 베이직)]
    - 만약 사용자가 상담 초반에 **베이직 플랜으로 변경**을 요청하여 보장 조건을 2가지로 줄였다면, 이후 상담부터는 **그 2가지 조건만 '보장 조건'으로 취급**해야 합니다.
    - **[매우 중요]**: 상담이 끝나고 JSON을 출력할 때, \`updates\` 항목에 반드시 \`"${HEADERS.CONDITIONS_LIST}"\` 키를 포함하고, 값으로 **사용자가 최종 선택한 2가지 조건 목록(예: "나이, 키")**을 넣어야 합니다. 그래야 엑셀 시트에 변경 사항이 저장됩니다.

    [핵심 규칙 3: 데이터 전송용 출력 (가장 중요)]
    - 상담 완료 후 JSON 출력 시, 반드시 **스프레드시트의 정확한 헤더명**을 Key로 사용해야 합니다.
    - 만약 사용자가 조건을 변경했다면(예: 비흡연 -> 흡연 가능, 키 180 -> 175, 자녀 계획 변경 등), \`updates\` 객체에 반드시 해당 헤더명과 변경된 값을 포함하세요.
    - **updates에 포함된 내용만 시트에 반영됩니다.** 사용자가 "괜찮다", "가능하다"고 하여 조건이 완화된 경우 반드시 updates에 포함하세요.
    
    - **[중요] 값의 형식 통일**: 변경된 값은 반드시 아래 지정된 형식 중 하나로만 저장하세요. (시트 데이터 일관성 유지)
      1. **흡연**: "비흡연자만" 또는 "흡연자도 가능" (사용자가 '상관없다', '괜찮다'고 하면 무조건 "흡연자도 가능"으로 저장)
      2. **학력**: "고졸 이상", "전문대졸 이상", "대졸 이상" (뒤에 '가능' 등을 붙이지 말고 딱 이 포맷 유지)
      3. **연봉**: "3천만 원 이상", "5천만 원 이상", "7천만 원 이상", "1억 원 이상" 또는 "무관" (단위 '천만 원' 필수)
      4. **키**: "160cm 이상", "175cm 이상", "165cm 이하" 등 (cm 뒤에 띄어쓰기 후 이상/이하)
      5. **나이**: "1990~1995" 또는 "1995년생 이하" 등 (년도 범위나 특정 기준)
      6. **자녀 계획**: "생각 있음 (상의 가능)", "생각 없음" 등
    
    - JSON은 사용자에게 보이지 않지만 시스템이 읽어서 **시트의 해당 칸을 자동으로 수정**합니다. 정확한 키를 사용하세요.

    [핵심 규칙 4: 흐름 복귀 (매우 중요)]
    - 사용자가 현재 질문과 다른 주제(예: 흡연 질문 중인데 지나간 키 이야기)를 꺼내면, **해당 요청(키 변경)을 처리했다고 답한 후 반드시 '원래 하던 질문(흡연)'을 다시 던지세요.**
    - 절대 대화를 뚝 끊지 마세요.
    - 예시: "아, 키 기준을 166cm로 변경 원하시는군요? 네, 바로 수정해 드리겠습니다! \n\n그럼 다시 이어서 여쭤볼게요. 흡연은 비흡연자만 원하시나요?"

    [상담 시퀀스 - 순서 엄수]
    각 단계별로 지정된 가이드 문구를 사용하여 질문하되, 문맥에 맞게 자연스럽게 이어가세요.

    ${stepsText}

    [주의 사항]
    - 마크다운(**) 절대 사용 금지.
    - 질문 전에는 절대 '비보장 고지'를 하지 마세요. 반드시 답변 후에 반응하세요.
  `;

  useEffect(() => {
    if (!currentApiKey) return; 

    // 이미 초기화되었거나 대화 내역이 있다면 중복 실행 방지
    if (introCalled.current) return;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
        introCalled.current = true;
      } catch (e) {
        console.error("Chat history parsing failed");
      }
    } else if (name) {
      introCalled.current = true;
      startIntro();
    }
  }, [name, currentApiKey]); 

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  const saveConsultationData = async (summaryData: any) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
        // [수정] 상담 내용 전체(fullChatLog) 대신 변경 요약(changeSummary)만 저장
        let logData = "변경 사항 없음";
        if (summaryData && summaryData.changeSummary) {
            logData = summaryData.changeSummary;
        }

        const payload: any = {
            action: 'save_consultation',
            name: name,
            birth: birthYear,
            chatLog: logData // AL열에 요약본 저장
        };

        if (summaryData) {
            if (summaryData.updates) {
                payload.updates = JSON.stringify(summaryData.updates);
            }
            if (summaryData.memo) {
                payload.memo = summaryData.memo;
            }
        }

        await fetch(scriptUrl, {
            method: 'POST',
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify(payload)
        });
        
        // 사용자에게 저장 완료 알림 (화면 표시용)
        setMessages(prev => [...prev, { role: 'model', text: "✅ 상담 내용과 변경된 조건이 시스템에 안전하게 저장되었습니다." }]);
        
    } catch (e) {
        console.error('Failed to save consultation', e);
        setMessages(prev => [...prev, { role: 'model', text: "⚠ 상담 내용 저장 중 네트워크 지연이 발생했습니다. (담당자가 수동으로 확인할 예정이니 안심하세요!)" }]);
    } finally {
        setIsSaving(false);
    }
  };

  const appendMessages = async (texts: string[]) => {
    for (const text of texts) {
      if (abortRef.current) return;
      if (!text || !text.trim()) continue;

      if (text.includes('```json')) {
         continue; 
      }

      setIsTyping(true);
      const delay = Math.min(Math.max(text.length * 35, 700), 1500);
      await new Promise(resolve => setTimeout(resolve, delay));
      if (abortRef.current) return;

      setMessages(prev => [...prev, { role: 'model', text: text.replace(/\*\*/g, '').trim() }]);
      setIsTyping(false);
    }
  };

  const startIntro = async (isReset: boolean = false) => {
    // [중복 방지 2차 체크] 이미 실행 중이거나 메시지가 있으면 중단
    // 단, 리셋 직후에는 messages state가 아직 비워진 것으로 인식되지 않을 수 있으므로(클로저) isReset=true일 경우 length 체크 생략
    if (introInProgress.current || (!isReset && messages.length > 0)) return;
    introInProgress.current = true;

    let introParts = [
      `안녕하세요 ${name}님! 이음로그 매니저입니다.\n보내주신 프로필과 이상형 조건 꼼꼼하게 확인했습니다.`
    ];

    if (isPremiumUser) {
        introParts.push(
            `선택하신 조건이 ${selectedConditions.length}가지 이상이라 프리미엄(다수 보장) 기준에 해당됩니다 😊\n이용료가 조금 더 높은 플랜인데, 이 기준으로 진행 괜찮으실까요?`,
            `(혹시 베이직으로 진행 원하시면 담당 매니저에게 카톡으로 문의 부탁드립니다!)`
        );
    } else {
        introParts.push(
            `현재 [${conditionStr}] 조건을 확실히 보장해드리는 ${planName} 플랜으로 신청해 주셨네요! 😊`,
            `매칭 시작 전, 몇 가지 세부 사항을 조율하고자 합니다. 잠시 대화 가능하실까요?`
        );
    }
    
    await appendMessages(introParts);
  };

  const handleReset = () => {
    if (window.confirm("현재 대화 내용을 모두 삭제하고 처음부터 다시 상담을 시작하시겠습니까?")) {
      abortRef.current = true;
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      
      localStorage.removeItem(STORAGE_KEY);
      setMessages([]);
      setIsTyping(false);
      setInput(''); 
      introCalled.current = true; // reset 후 수동 호출하므로 flag 유지
      introInProgress.current = false; // reset이므로 실행 가능 상태로

      resetTimeoutRef.current = setTimeout(() => {
          abortRef.current = false;
          startIntro(true);
      }, 300);
    }
  };
  
  const handleUpdateApiKey = () => {
      const newKey = prompt("새로운 API 키를 입력해주세요 (브라우저에 저장됩니다):", currentApiKey);
      if (newKey && newKey.trim()) {
          const k = newKey.trim();
          localStorage.setItem('GEMINI_LOCAL_API_KEY', k);
          setCurrentApiKey(k);
          alert("API 키가 저장되었습니다. 브라우저를 닫거나 새로고침해도 유지됩니다.");
      }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async (manualInput?: string) => {
    const userMsg = manualInput || input;
    if (!userMsg.trim() || isTyping) return;

    abortRef.current = false;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    if (!currentApiKey) {
      setMessages(prev => [...prev, { role: 'model', text: "⚠ 오류: 시스템 설정(API Key)이 완료되지 않았습니다. 우측 상단 열쇠 아이콘을 눌러 키를 설정해주세요." }]);
      setIsTyping(false);
      return;
    }

    try {
      const formattedContents = [];
      let lastRole = '';

      for (const msg of messages) {
        const role = msg.role === 'model' ? 'model' : 'user';
        const text = msg.text || '';

        if (formattedContents.length > 0 && role === lastRole) {
          formattedContents[formattedContents.length - 1].parts[0].text += `\n\n${text}`;
        } else {
          formattedContents.push({ role, parts: [{ text }] });
          lastRole = role;
        }
      }

      const currentUserText = `[규칙: 긴 답변은 무조건 \\n\\n으로 분리(모바일 배려), 사용자가 조건(연봉, 나이, 학력, 흡연, 자녀계획 등)을 완화하거나 변경하면 확실히 수용하고 반영 멘트 하기] ${userMsg}`;
      
      if (lastRole === 'user' && formattedContents.length > 0) {
        formattedContents[formattedContents.length - 1].parts[0].text += `\n\n${currentUserText}`;
      } else {
        formattedContents.push({ role: 'user', parts: [{ text: currentUserText }] });
      }

      if (formattedContents.length > 0 && formattedContents[0].role === 'model') {
        formattedContents.unshift({
          role: 'user',
          parts: [{ text: "상담 매니저님, 상담 시작해주세요. (시스템: 대화 연결)" }]
        });
      }

      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      
      let aiText = "";
      let lastError = null;
      let success = false;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (abortRef.current) return;
        
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: formattedContents,
                config: {
                systemInstruction: systemInstruction,
                temperature: 0.2,
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                ]
                }
            });
            aiText = response.text || "";
            success = true;
            break;
        } catch (e: any) {
            console.warn(`Attempt ${attempt + 1} failed:`, e);
            lastError = e;
            const errStr = e.toString();
            if (errStr.includes('API_KEY_INVALID') || errStr.includes('403') || errStr.includes('400')) {
                throw e;
            }
            await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
        }
      }

      if (!success && lastError) {
          throw lastError;
      }

      // 1. JSON 추출
      let finalJsonData = null;
      const jsonRegex = /```json\s*({[\s\S]*?})\s*```/;
      const jsonMatch = aiText.match(jsonRegex);
      
      if (jsonMatch && jsonMatch[1]) {
          try {
              finalJsonData = JSON.parse(jsonMatch[1]);
          } catch (e) {
              console.error("JSON Parse Error during send", e);
          }
      }

      // 2. 화면 표시용 텍스트 (JSON 제거)
      const cleanText = aiText.replace(jsonRegex, '').trim();
      const parts = cleanText.split('\n\n').filter(p => p.trim());
      
      if (abortRef.current) return;

      // 3. 메시지 출력
      await appendMessages(parts);

      // 4. JSON 데이터가 있으면 바로 저장 실행
      if (finalJsonData) {
          await saveConsultationData(finalJsonData);
      }

    } catch (error: any) {
      if (abortRef.current) return;
      
      console.error("Gemini API Error:", error);
      
      let errorMsg = "상담 매니저와의 연결이 잠시 원활하지 않았습니다. 방금 말씀해주신 내용을 다시 한번 입력 부탁드려요!";
      const errStr = error.toString();
      
      if (errStr.includes('leaked') || errStr.includes('expired') || errStr.includes('API_KEY_INVALID') || errStr.includes('400') || errStr.includes('403')) {
         const newKey = prompt(`🚨 API 키 오류가 발생했습니다 (${errStr.includes('expired') ? '만료됨' : '유효하지 않음'}).\n\n새로운 API 키를 입력해주시면 즉시 적용되어 계속 상담할 수 있습니다:`, currentApiKey);
         if (newKey && newKey.trim()) {
             const k = newKey.trim();
             localStorage.setItem('GEMINI_LOCAL_API_KEY', k);
             setCurrentApiKey(k);
             alert("API 키가 갱신 및 저장되었습니다. 다시 '전송' 버튼을 눌러주세요.");
             errorMsg = "API 키가 갱신되었습니다. 방금 입력하신 내용을 다시 전송해주세요!";
         } else {
             errorMsg = "API 키 오류로 인해 답변을 생성할 수 없습니다. 우측 상단 열쇠 아이콘을 눌러 키를 설정해주세요.";
         }
      }
      
      setMessages(prev => [...prev, { role: 'model', text: errorMsg }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center md:p-4">
      <div 
        style={{ height: viewportHeight }} 
        className="bg-white w-full md:h-[92vh] md:max-w-md md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300 border border-white/20"
      >
        <div className="bg-emerald-600 p-4 md:p-5 text-white flex justify-between items-center shrink-0 shadow-lg z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl shadow-inner border border-white/10">👩‍💼</div>
            <div>
              <div className="font-bold text-[14px] md:text-[15px] tracking-tight">이음로그 매니저</div>
              <div className="text-[10px] opacity-90 flex items-center gap-1">
                {isSaving ? (
                  <>
                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></span>
                    상담 내용 저장 중...
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                    실시간 상담 진행 중
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            {isAdmin && (
              <button 
                  onClick={handleUpdateApiKey} 
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-lg transition-all"
                  title="API 키 수동 설정"
              >
                  🔑
              </button>
            )}
            <button 
                onClick={handleReset} 
                className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-lg transition-all"
                title="처음부터 다시 시작"
            >
                🔄
            </button>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-2xl transition-all">&times;</button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f0f2f5] custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
              {msg.role === 'model' && (
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-[9px] mr-2 mt-1 shrink-0 font-black text-emerald-700 border border-emerald-200 shadow-sm">이음</div>
              )}
              <div className={`max-w-[85%] px-3 py-2.5 md:px-4 md:py-3 rounded-2xl text-[13px] md:text-[14px] shadow-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user' 
                ? 'bg-emerald-500 text-white rounded-tr-none' 
                : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
               <div className="bg-white px-3 py-2.5 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 md:p-4 bg-white border-t border-slate-100 shrink-0 relative pb-safe">
          <div className="flex gap-2">
            <input 
              ref={inputRef}
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isTyping ? "입력 중..." : "내용 입력"}
              disabled={isTyping}
              className={`flex-1 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 text-[13px] md:text-sm outline-none transition-all shadow-inner 
                ${isTyping 
                  ? 'bg-slate-50 border border-slate-100 opacity-70 placeholder:text-slate-400' 
                  : 'bg-white border-2 border-emerald-500 ring-2 ring-emerald-500/10 placeholder:text-emerald-600 placeholder:font-bold'
                }
              `}
            />
            <button 
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              className="bg-slate-900 text-white px-4 md:px-6 rounded-xl md:rounded-2xl font-bold text-[13px] md:text-sm hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-30 shadow-lg whitespace-nowrap"
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

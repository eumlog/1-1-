
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

interface AIChatbotProps {
  userData: any;
  apiKey: string; 
  onClose: () => void;
  scriptUrl: string;
}

export const AIChatbot: React.FC<AIChatbotProps> = ({ userData, apiKey, onClose, scriptUrl }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentApiKey, setCurrentApiKey] = useState(apiKey);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 상위에서 apiKey가 바뀌면 업데이트
  useEffect(() => {
    if (apiKey) setCurrentApiKey(apiKey);
  }, [apiKey]);

  // 1. 데이터 매핑 (시트의 정확한 헤더명과 데이터를 매칭)
  const HEADERS = {
    NAME: '이름(*)',
    BIRTH: '생년월일(*)',
    AGE: '선호 나이 범위(*)',
    HEIGHT: '최소한의 허용 가능한 키(*)',
    SMOKING: '흡연 기준(*)',
    INCOME: '상대방의 연봉(소득) 기준이 있다면(*)',
    EDU: '선호 학력(*)',
    RELIGION: '종교(*)', 
    PRIORITY: '이상형 조건 순위(*)'
  };

  const name = userData?.[HEADERS.NAME] || userData?.name || '회원';
  const birthYear = userData?.[HEADERS.BIRTH] || '';
  const gender = userData?.['성별(*)'] || '';
  const location = userData?.['거주지역(*)'] || '';
  const religion = userData?.[HEADERS.RELIGION] || '무교';
  
  const prefAge = userData?.[HEADERS.AGE] || '';
  const prefHeight = userData?.[HEADERS.HEIGHT] || '';
  const prefSmoking = userData?.[HEADERS.SMOKING] || '';
  const prefIncome = userData?.[HEADERS.INCOME] || '';
  const prefEdu = userData?.[HEADERS.EDU] || '';
  const priorityWeights = userData?.[HEADERS.PRIORITY] || '';

  const rawConditions = userData?.['보장 조건 선택 (중요)(*)'] || '';
  const selectedConditions = typeof rawConditions === 'string' 
    ? rawConditions.split(/[|/]/).map(s => s.trim()).filter(Boolean)
    : [];
  
  const conditionStr = selectedConditions.length > 0 ? selectedConditions.join(', ') : '없음';
  const planName = selectedConditions.length >= 3 ? '프리미엄' : '베이직';

  // 2. 로직 헬퍼
  const isSelected = (keyword: string) => selectedConditions.some(cond => cond.includes(keyword));
  const hasOption = (keyword: string) => selectedConditions.some(cond => cond.includes(keyword));
  const isFlexible = (text: string) => /무관|상관\s*없|모두|다\s*괜찮|다\s*가능|전혀|오픈/.test(text);
  const isMaxLimit = (text: string) => /이하|미만|작은|아담/.test(text);

  // 질문 여부 판단 헬퍼
  const isQuestion = (text: string) => text.includes('?') || text.includes('까') || text.includes('요?');
  const getNoAskInstruction = (text: string) => isQuestion(text) ? '' : ' (이 멘트만 출력하고, "괜찮으신가요?" 같은 질문을 절대 덧붙이지 마세요. 그냥 멘트만 딱 끝내세요.)';

  // 3. 질문 가이드 생성 로직
  const REACTION_DEFAULT = "(보장/비보장 여부에 따른 적절한 반응 출력)";
  const REACTION_EASY = "(조건이 까다롭지 않으므로, '비보장 안내' 멘트를 절대 하지 말고 '네 확인했습니다' 정도로 깔끔하게 답변)";
  const REACTION_CONDITIONAL = "(사용자가 제안을 수락하거나 유연한 태도(괜찮다 등)를 보이면 '비보장 안내' 멘트를 절대 하지 말고 '네, 그럼 해당 기준으로 넓혀서 매칭해드리겠습니다'라고 변경 사항을 확정하세요. 반면 까다로운 조건을 고집하면 보장/비보장 여부에 따라 반응하세요.)";

  // [나이 가이드]
  let ageGuide = '';
  let ageReaction = REACTION_DEFAULT;

  const birthYear2 = birthYear.substring(0, 2);
  let myYearFull = 1900 + parseInt(birthYear2);
  if (parseInt(birthYear2) < 30) myYearFull = 2000 + parseInt(birthYear2);

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
      } else { // 남자
        const ageDiff = minPrefYear - myYearFull;
        if (ageDiff >= 2) {
           const oneYearYounger = myYearFull + 1; // 1살 연하
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

  // [키 가이드]
  let heightGuide = '';
  let heightReaction = REACTION_DEFAULT;

  if (prefHeight) {
    const hNum = parseInt(prefHeight.replace(/[^0-9]/g, '')) || 0;
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
    } else { // 남자
      // '이하', '미만' 등이 포함되어 있으면 이미 작은 키를 허용하는 것이므로 질문 생략
      if (isMaxLimit(prefHeight)) {
         heightGuide = `키는 ${prefHeight}으로 ${priorityText}, 원하시는 아담한 스타일이나 해당 키 범위의 분들로 잘 찾아보겠습니다!`;
         heightReaction = REACTION_EASY;
      } else if (hNum >= 161) {
         heightGuide = `키는 ${prefHeight}으로 ${priorityText}, 혹시 비율이 좋다면 158cm 등 150대 후반 분들도 괜찮으실까요? 조율이 가능한지 여쭤봅니다!`;
         heightReaction = REACTION_CONDITIONAL;
      } else {
         heightGuide = `키 관련해서 ${prefHeight}으로 ${priorityText}, 다른 조건이 정말 괜찮다면 조금 유연하게 봐주실 수 있을까요?`;
         heightReaction = REACTION_CONDITIONAL;
      }
    }
  } else {
    heightGuide = `키 조건을 선택해주셨는데, 구체적으로 선호하시는 키 기준이 있으실까요?`;
  }

  // [지역 가이드]
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

  // [흡연 가이드]
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

  // [종교 가이드]
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

  // [학력 가이드]
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

  // [연봉 가이드]
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

  // [직업 가이드]
  let jobGuide = `직업은 직장인을 선호하시는걸까요? 아니면 자영업도 가능하실까요?`;
  let jobReaction = REACTION_CONDITIONAL;
  
  if (hasOption('자영업') || hasOption('사업') || (conditionStr.includes('자영업'))) {
    jobGuide = `직업 조건으로 자영업/사업가 분들도 괜찮다고 해주셔서, 폭넓게 소개해드리겠습니다!`;
    jobReaction = REACTION_EASY;
  } else if (hasOption('직장인')) {
    jobGuide = `직업 조건으로 '직장인'을 선택해주셨는데, 혹시 안정적인 자영업(사업가) 분들도 괜찮으실까요?`;
    jobReaction = REACTION_CONDITIONAL;
  }

  const STORAGE_KEY = `eumlog_chat_${name}_${birthYear}`;

  const steps = [];
  
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
    guide: `질문: "모든 상담이 완료되었습니다! ${name}님께서 선택하신 [${conditionStr}] 조건은 확실히 보장하여 매칭을 진행해 드릴 예정입니다. 고생하셨습니다. 감사합니다!"\n
    - **[중요] 데이터 저장**: 상담 종료 시, 변경되거나 확정된 조건들을 **아래 지정된 '시트 헤더명'을 Key로 사용하여** JSON 형식으로 출력하세요.\n
    - JSON 예시:\n
    \`\`\`json
    {
      "updates": {
        "${HEADERS.AGE}": "1990년생 이상 ~ 1995년생 이하",
        "${HEADERS.HEIGHT}": "165cm 이상",
        "${HEADERS.SMOKING}": "무관"
      },
      "memo": "연봉은 3천 초반도 괜찮다고 하심."
    }
    \`\`\`
    - 변경되지 않은 조건은 updates에 포함하지 마세요.`
  });

  const stepsText = steps.map((step, idx) => `${idx + 1}. ${step.title}:\n       ${step.guide}`).join('\n\n    ');

  const systemInstruction = `
    당신은 이음로그의 상담 매니저입니다. 아래 규칙을 절대적으로 지키며 상담을 진행하세요.

    [핵심 정보]
    - 회원이 선택한 보장 조건 목록: [${conditionStr}]
    - 보장 조건에 포함된 항목은 확실하게 매칭해 주어야 하며, 포함되지 않은 항목은 가점 매칭(비보장)입니다.
    - 선호 학력(Z열 데이터): ${prefEdu} (이 값을 기준으로 질문을 생성했습니다.)

    [핵심 규칙 1: 답변에 대한 반응 (매우 중요)]
    사용자의 답변을 듣고 나서, 현재 다루고 있는 주제(예: 나이, 키, 흡연, 연봉 등)가 '보장 조건'인지 확인 후 아래와 같이 반응하세요.

    CASE A: 조건 조율/변경 (사용자가 "3천 이상도 괜찮아요", "상관없어요", "전문대도 돼요" 등 조건을 완화하거나 변경할 때)
    - 반응: "네, 확인했습니다! 말씀하신 대로 [변경된 내용]으로 기준을 수정하여 매칭 진행해 드리겠습니다." (확실하게 수용 의사 표시)

    CASE B: 현재 주제가 '보장 조건'([${conditionStr}])에 포함되는 경우
    - 반응: "네, 말씀하신 [주제] 조건은 확실하게 보장해서 매칭해 드릴게요!" 또는 "확인했습니다. 이 부분은 꼭 맞춰서 진행하겠습니다."

    CASE C: 현재 주제가 '보장 조건'에 포함되지 않는 경우 (비보장)
    - 반응: 기계적인 반복을 피하기 위해 아래 3가지 멘트 중 하나를 자연스럽게 골라서 사용하세요.
      옵션 1: "네, 이 부분은 필수 보장 조건은 아니어서 최대한 맞춰보겠지만, 상황에 따라 조금 다른 분이 소개될 수도 있는 점 양해 부탁드려요!"
      옵션 2: "넵! 선호하시는 대로 가점은 드리지만, 보장 조건은 아니라서 100% 일치하지 않을 수도 있다는 점 참고해 주세요."
      옵션 3: "알겠습니다. 최대한 반영해 보겠지만, 필수 조건 외에는 매칭 상황에 따라 조금 유연하게 진행될 수 있어요!"

    [핵심 규칙 2: 말풍선 분리 (모바일 가독성 최우선)]
    - **긴 답변은 무조건 자르세요.** 모바일 화면에서 5줄 이상 넘어가지 않도록, **한 말풍선당 1~2문장**으로 짧게 끊어서 \`\\n\\n\`으로 구분하세요.
    - 특히 **[이전 답변에 대한 반응]**과 **[다음 주제로 넘어가는 멘트]**가 합쳐지면 내용이 길어지므로, 이 둘은 **무조건** \`\\n\\n\`으로 분리해서 보내야 합니다.

    [핵심 규칙 3: 데이터 전송용 출력 (가장 중요)]
    - 상담 완료 후 JSON 출력 시, 반드시 **스프레드시트의 정확한 헤더명**을 Key로 사용해야 합니다.
    - 사용할 헤더명 목록:
      - 나이 -> "${HEADERS.AGE}"
      - 키 -> "${HEADERS.HEIGHT}"
      - 흡연 -> "${HEADERS.SMOKING}"
      - 연봉 -> "${HEADERS.INCOME}"
      - 학력 -> "${HEADERS.EDU}"
      - 종교 -> "${HEADERS.RELIGION}"
    
    - JSON은 사용자에게 보이지 않지만 시스템이 읽어서 **시트의 해당 칸을 자동으로 수정**합니다. 정확한 키를 사용하세요.

    [상담 시퀀스 - 순서 엄수]
    각 단계별로 지정된 가이드 문구를 사용하여 질문하되, 문맥에 맞게 자연스럽게 이어가세요.

    ${stepsText}

    [주의 사항]
    - 마크다운(**) 절대 사용 금지.
    - 질문 전에는 절대 '비보장 고지'를 하지 마세요. 반드시 답변 후에 반응하세요.
  `;

  useEffect(() => {
    // 키가 없으면 키 입력 프롬프트 자동 실행은 하지 않음 (헤더 버튼 이용 유도)
    if (!currentApiKey) return; 

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Chat history parsing failed");
      }
    } else if (userData) {
      startIntro();
    }
  }, [userData, currentApiKey]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      // 마지막 메시지가 모델이 보낸 완료 메시지라면 저장 로직 실행
      if (lastMsg.role === 'model' && (lastMsg.text.includes('고생하셨습니다') || lastMsg.text.includes('감사합니다'))) {
        // 마지막 메시지에서 JSON 추출 시도
        const jsonMatch = lastMsg.text.match(/```json\s*({[\s\S]*?})\s*```/);
        let summaryData = null;
        if (jsonMatch && jsonMatch[1]) {
            try {
                summaryData = JSON.parse(jsonMatch[1]);
            } catch (e) {
                console.error("JSON parse error", e);
            }
        }
        saveConsultationData(summaryData);
      }
    }
  }, [messages]);

  const saveConsultationData = async (summaryData: any) => {
    try {
        const fullChatLog = messages.map(m => `[${m.role}] ${m.text}`).join('\n\n');
        
        // 서버로 보낼 페이로드 구성
        const payload: any = {
            action: 'save_consultation',
            name: name,
            birth: birthYear,
            chatLog: fullChatLog
        };

        if (summaryData) {
            // updates 객체가 있으면 문자열로 변환하여 전송 (백엔드에서 파싱)
            if (summaryData.updates) {
                payload.updates = JSON.stringify(summaryData.updates);
            }
            if (summaryData.memo) {
                payload.memo = summaryData.memo;
            }
        }

        await fetch(scriptUrl, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        console.log('Consultation saved successfully');
    } catch (e) {
        console.error('Failed to save consultation', e);
    }
  };

  const appendMessages = async (texts: string[]) => {
    for (const text of texts) {
      if (!text.trim()) continue;

      // JSON 데이터 블록은 사용자에게 보여주지 않고 숨김 처리 (로직용)
      if (text.includes('```json')) {
         continue; 
      }

      setIsTyping(true);
      const delay = Math.min(Math.max(text.length * 35, 700), 1500);
      await new Promise(resolve => setTimeout(resolve, delay));
      setMessages(prev => [...prev, { role: 'model', text: text.replace(/\*\*/g, '').trim() }]);
      setIsTyping(false);
    }
  };

  const startIntro = async () => {
    const introParts = [
      `안녕하세요 ${name}님! 이음로그 매니저입니다.\n보내주신 프로필과 이상형 조건 꼼꼼하게 확인했습니다.`,
      `현재 [${conditionStr}] 조건을 확실히 보장해드리는 ${planName} 플랜으로 신청해 주셨네요! 😊`,
      `매칭 시작 전, 몇 가지 세부 사항을 조율하고자 합니다. 잠시 대화 가능하실까요?`
    ];
    await appendMessages(introParts);
  };

  const handleReset = () => {
    if (window.confirm("현재 대화 내용을 모두 삭제하고 처음부터 다시 상담을 시작하시겠습니까?")) {
      localStorage.removeItem(STORAGE_KEY);
      setMessages([]);
      setIsTyping(false);
      setTimeout(() => {
          startIntro();
      }, 100);
    }
  };
  
  const handleUpdateApiKey = () => {
      const newKey = prompt("새로운 API 키를 입력해주세요:", currentApiKey);
      if (newKey && newKey.trim()) {
          setCurrentApiKey(newKey.trim());
          alert("API 키가 업데이트되었습니다. 다시 전송 버튼을 눌러보세요.");
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
        const text = msg.text;

        if (formattedContents.length > 0 && role === lastRole) {
          formattedContents[formattedContents.length - 1].parts[0].text += `\n\n${text}`;
        } else {
          formattedContents.push({ role, parts: [{ text }] });
          lastRole = role;
        }
      }

      const currentUserText = `[규칙: 긴 답변은 무조건 \\n\\n으로 분리(모바일 배려), 사용자가 조건(연봉, 나이, 학력 등)을 완화하거나 변경하면 확실히 수용하고 반영 멘트 하기] ${userMsg}`;
      
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

      const aiText = response.text || "";
      const parts = aiText.split('\n\n').filter(p => p.trim());
      await appendMessages(parts);

    } catch (error: any) {
      console.error("Gemini API Error:", error);
      
      let errorMsg = "상담 매니저와의 연결이 잠시 원활하지 않았습니다. 방금 말씀해주신 내용을 다시 한번 입력 부탁드려요!";
      const errStr = error.toString();
      let detailMsg = error.message || "알 수 없는 에러";
      
      // 키 관련 에러 시 즉시 수정 유도
      if (errStr.includes('leaked') || errStr.includes('expired') || errStr.includes('API_KEY_INVALID') || errStr.includes('400') || errStr.includes('403')) {
         const newKey = prompt(`🚨 API 키 오류가 발생했습니다 (${errStr.includes('expired') ? '만료됨' : '유효하지 않음'}).\n\n새로운 API 키를 입력해주시면 즉시 적용되어 계속 상담할 수 있습니다:`, "");
         if (newKey && newKey.trim()) {
             setCurrentApiKey(newKey.trim());
             alert("API 키가 갱신되었습니다. 다시 '전송' 버튼을 눌러주세요.");
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
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md h-[92vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300 border border-white/20">
        <div className="bg-emerald-600 p-5 text-white flex justify-between items-center shrink-0 shadow-lg z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl shadow-inner border border-white/10">👩‍💼</div>
            <div>
              <div className="font-bold text-[15px] tracking-tight">이음로그 매니저</div>
              <div className="text-[10px] opacity-90 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                실시간 상담 진행 중
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={handleUpdateApiKey} 
                className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-lg transition-all"
                title="API 키 수동 설정"
            >
                🔑
            </button>
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
              <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[14px] shadow-sm whitespace-pre-wrap leading-relaxed ${
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

        <div className="p-4 bg-white border-t border-slate-100 shrink-0 relative">
          <div className="flex gap-2">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isTyping ? "매니저가 답변 입력 중..." : "내용을 입력해주세요."}
              disabled={isTyping}
              className={`flex-1 rounded-2xl px-5 py-4 text-sm outline-none transition-all shadow-inner 
                ${isTyping 
                  ? 'bg-slate-50 border border-slate-100 opacity-70 placeholder:text-slate-400' 
                  : 'bg-white border-2 border-emerald-500 ring-4 ring-emerald-500/10 placeholder:text-emerald-600 placeholder:font-bold'
                }
              `}
            />
            <button 
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              className="bg-slate-900 text-white px-6 rounded-2xl font-bold text-sm hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-30 shadow-lg"
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

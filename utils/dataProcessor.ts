
import { Person } from '../types';

export const parseConsultationData = (text: string): Person[] => {
  const results: Person[] = [];
  const lines = text.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    if (!line.trim()) continue;

    const fields = line.split('\t');
    let genderIndex = -1;
    // Find pivot column (Gender)
    for (let i = 0; i < fields.length; i++) {
      const val = fields[i].trim();
      if (val === '남자' || val === '여자') {
        genderIndex = i;
        break;
      }
    }

    if (genderIndex === -1) continue;

    const g = genderIndex;
    const groupRaw = fields[0] ? fields[0].trim() : '';
    const group = groupRaw === '' ? '일반' : groupRaw;

    let preferredAge = '';
    let preferredHeight = '';
    let preferredSmoking = '';
    let preferredIncome = '';
    let preferredEducation = '';
    let selectedConditionStr = '';
    let priorityWeights = '';

    // Logic to find selected condition columns
    const conditionKeywords = ['나이', '키', '지역', '직업', '학력', '종교', '연봉', '흡연'];
    let conditionColIndex = -1;
    let maxKeywordCount = 0;

    for (let i = g + 5; i < fields.length; i++) {
      const val = (fields[i] || '').trim();
      if (val.length > 200) continue;
      if (val.includes('동의합니다') || val.includes('사실이며') || val.includes('규정을 확인')) continue;

      // Skip date-like strings that are not conditions
      if (val.includes('/') && /\d/.test(val) && !val.includes('년생') && !val.includes('cm') && !val.includes('~')) {
        continue;
      }

      let count = 0;
      conditionKeywords.forEach((kw) => {
        if (val.includes(kw)) count++;
      });

      if (count > 0) {
        if (val.includes('|')) {
          conditionColIndex = i;
          maxKeywordCount = 999;
        } else if (count >= maxKeywordCount && maxKeywordCount < 999) {
          if (val.includes(',') || count >= 1) {
            maxKeywordCount = count;
            conditionColIndex = i;
          }
        }
      }
    }

    if (conditionColIndex !== -1) {
      selectedConditionStr = fields[conditionColIndex].trim();
    }

    // Find preferred values
    let searchStart = conditionColIndex !== -1 ? conditionColIndex - 10 : g + 5;
    if (searchStart < g + 5) searchStart = g + 5;

    for (let i = searchStart; i < fields.length; i++) {
      if (i === conditionColIndex) continue;
      const val = (fields[i] || '').trim();
      if (!val) continue;
      if (val.includes('동의합니다') || val.includes('사실이며')) continue;

      // Smoking
      if ((val.includes('흡연자') || val.includes('비흡연')) && !preferredSmoking && val.length < 20) {
        preferredSmoking = val;
        continue;
      }
      // Education
      if (/대졸|고졸|전문대|대학원|석사|박사/.test(val) && !preferredEducation && !val.includes('학력')) {
        preferredEducation = val;
        continue;
      }
      // Age
      const isAgePattern = /년생|19\d{2}|20\d{2}|\d{2}\s*~/.test(val) || /\d{2}살/.test(val);
      if (isAgePattern && !preferredAge && !val.includes(fields[g + 1])) {
        const nums = val.match(/\d+/g);
        if (nums && nums[0].length <= 4) {
          preferredAge = val;
          continue;
        }
      }
      // Height
      let isHeightCandidate = false;
      if (!val.includes('원') && !val.includes('천') && !val.includes('억')) {
        if (val.includes('cm') || val.includes('이상') || val.includes('이하')) {
          if (!val.includes('년생') && !val.includes('kg')) isHeightCandidate = true;
        } else {
          const nums = val.match(/\d{3}/g);
          if (nums) {
            for (const nStr of nums) {
              const n = parseInt(nStr);
              if (n >= 140 && n <= 190) {
                isHeightCandidate = true;
                break;
              }
            }
          }
        }
      }
      if (isHeightCandidate && !preferredHeight && i !== g + 5) {
        preferredHeight = val;
        continue;
      }
      // Income
      if ((val.includes('천') || val.includes('억') || (val.includes('무관') && val.includes('연봉'))) && !preferredIncome) {
        if (!val.includes('년') && !val.includes('세')) {
          preferredIncome = val;
        }
      }
      // Weights
      if (val.includes('순위') || val.includes('중요') || (val.includes('/') && /\d/.test(val) && !val.includes('년생'))) {
        priorityWeights = val;
      }
    }

    let selectedConditions: string[] = [];
    const cleanCondStr = selectedConditionStr.replace(/\[|\]/g, '');
    if (cleanCondStr.includes('|')) {
      selectedConditions = cleanCondStr.split('|');
    } else if (cleanCondStr.includes(',')) {
      selectedConditions = cleanCondStr.split(',');
    } else if (cleanCondStr) {
      selectedConditions = [cleanCondStr];
    }
    selectedConditions = selectedConditions
      .map((s) => s.trim())
      .filter((s) => s && !s.includes('동의') && !s.includes('사실'));

    const membershipType: 'PREMIUM' | 'BASIC' = selectedConditions.length > 2 ? 'PREMIUM' : 'BASIC';

    // Generate a robust unique ID by including loop index to prevent collisions
    const uniqueId = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}-${results.length}`;

    const person: Person = {
      id: uniqueId,
      group: group,
      name: fields[g - 1] || '',
      gender: fields[g] || '',
      birth: fields[g + 1] || '',
      phone: fields[g + 2] || '',
      location: fields[g + 3] || '',
      job: fields[g + 4] || '',
      height: fields[g + 5] || '',
      education: fields[g + 6] || '',
      income: fields[g + 7] || '',
      smoking: fields[g + 8] || '',
      religion: fields[g + 11] || '무교',

      preferredAge,
      preferredHeight,
      preferredIncome,
      preferredEducation,
      preferredSmoking,

      priorityWeights,
      selectedConditionStr,
      selectedConditions,
      membershipType,

      personality: fields[g + 26] || '',
    };

    if (person.name) results.push(person);
  }

  return results;
};

const getPriceObj = (gender: string, group: string) => {
  const isMale = gender === '남자';
  const groupName = (group || '').trim();
  const isEvent = groupName.includes('이벤트');

  if (isEvent) {
    if (isMale) return { basic: '13만원', premium: '21만원' };
    else return { basic: '8만원', premium: '14만원' };
  } else {
    if (isMale) return { basic: '18만원', premium: '32만원' };
    else return { basic: '12만원', premium: '21만원' };
  }
};

export const generateScript = (person: Person): string => {
  const isPremium = person.membershipType === 'PREMIUM';
  const conditions = person.selectedConditions;
  const conditionText = conditions.map((c) => c.split('(')[0].trim()).join(', ');

  const birthYear2 = person.birth.substring(0, 2);
  let myYearFull = 1900 + parseInt(birthYear2);
  if (parseInt(birthYear2) < 30) {
    myYearFull = 2000 + parseInt(birthYear2);
  }
  const gender = person.gender;

  let script = `안녕하세요 ${person.name}님! 이음로그 매니저입니다.\n`;
  script += `보내주신 프로필과 이상형 조건 꼼꼼하게 확인했습니다.\n\n`;

  if (isPremium) {
    script += `선택하신 조건이 5가지 이상이라 프리미엄(5개 보장) 기준에 해당됩니다 😊\n`;
    script += `이용료가 조금 더 높은 플랜인데, 이 기준으로 진행 괜찮으실까요?\n\n`;
    script += `(혹시 베이직으로 진행 원하시면 조건을 2개로 줄여드릴 수도 있습니다!)\n`;
  } else {
    script += `보장되는 조건이 최대 2개인 베이직 플랜으로 안내드릴게요!\n`;
    script += `선택하신 [${conditionText}] 두 가지 조건은 확실히 보장해드립니다 😊\n\n`;
    script += `다만, 그 외 조건들은 맞지 않을 수도 있다는 점 참고 부탁드려요.\n`;
    script += `(더 많은 조건 보장을 원하시면 프리미엄으로 변경도 가능합니다.)\n`;
  }

  script += `\n--------------------------------\n\n`;
  script += `그럼 매칭 진행 전, 몇 가지 세부 사항 확인차 질문드리고 싶은데 5-10분 정도 시간 괜찮으실까요?\n\n`;

  let qNum = 1;
  const isSelected = (keyword: string) => conditions.some((cond) => cond.includes(keyword));
  const hasOption = (optionStr: string) => conditions.some((cond) => cond.includes(optionStr));
  const getTitle = (key: string, info = '', suffix = '', displayLabel: string | null = null) => {
    const label = displayLabel || key;
    const infoText = info ? ` (본인 ${info})` : '';
    const titleText = `${qNum}. ${label} 조건${infoText} ${suffix}`;
    return isSelected(key) ? `📌 ${titleText} (선택)` : titleText;
  };

  // 1. 나이
  if (isSelected('나이') || person.preferredAge) {
    let ageQ = `${getTitle('나이', person.birth.substring(0, 2) + '년생')}\n`;
    if (person.preferredAge) {
      const ageMatch = person.preferredAge.match(/\d{2,4}/g);
      let minPrefYear = 9999;
      if (ageMatch) {
        ageMatch.forEach((y) => {
          let yNum = parseInt(y);
          if (y.length === 2) {
            yNum = yNum < 30 ? 2000 + yNum : 1900 + yNum;
          }
          if (yNum < minPrefYear) minPrefYear = yNum;
        });
      }
      
      if (minPrefYear === 9999) {
          ageQ += `나이는 ${person.preferredAge}으로 적어주셨는데, 설문지 내용 그대로 우선 반영하겠습니다.\n`;
      } else {
          // Female Logic
          if (gender === '여자') {
             const older5Year = myYearFull - 5;
             if (minPrefYear > older5Year) {
               // Gap exists between preference (e.g. 1990) and limit (1985)
               const limitYear = minPrefYear - 1;
               const startYear = older5Year;
               
               let rangeStr = '';
               const yStart = startYear.toString().substring(2);
               const yEnd = limitYear.toString().substring(2);
               
               rangeStr = (yStart === yEnd) ? `${yStart}년생` : `${yStart}~${yEnd}년생`;
               
               ageQ += `나이는 ${person.preferredAge}으로 적어주셨는데, ${rangeStr}(5살 연상)까지는 어떠실까요?`;
             } else {
               ageQ += `나이는 ${person.preferredAge}으로 적어주셨는데, 설문지 내용 그대로 우선 반영하겠습니다.\n`;
             }
          } 
          // Male Logic
          else {
             const ageDiff = minPrefYear - myYearFull;
             // If ageDiff >= 2, means there is a gap between preferred oldest and "1 year younger"
             if (ageDiff >= 2) {
                const oneYearYounger = myYearFull + 1;
                const limitYear = minPrefYear - 1; 
                
                let rangeStr = '';
                const yStart = oneYearYounger.toString().substring(2);
                const yEnd = limitYear.toString().substring(2);
                 
                rangeStr = (yStart === yEnd) ? `${yStart}년생` : `${yStart}~${yEnd}년생`;
                
                ageQ += `나이는 ${person.preferredAge}으로 적어주셨는데, ${rangeStr}(1살 연하)까지는 어떠실까요?`;
             } else if (minPrefYear > myYearFull) {
                // Prefers 1 year younger or same age exactly
                ageQ += `나이는 ${person.preferredAge}으로 적어주셨는데, 설문지 내용 그대로 우선 반영하겠습니다.\n혹시 성향이 잘 맞는다면 연상도 가능하실까요?`;
             } else {
                ageQ += `나이는 ${person.preferredAge}으로 적어주셨는데, 설문지 내용 그대로 우선 반영하겠습니다.\n`;
             }
          }
      }
    } else {
      ageQ += `나이 조건을 선택해주셨는데, 선호하시는 구체적인 연령대가 있으실까요?`;
    }
    if (!isSelected('나이')) {
      ageQ += `\n네 필수조건은 아니셔서 선호하시는 연령대로 가점 매칭되지만, 위아래로 나이 차이가 나는 분이 나올 수도 있는 점 참고부탁드려요!`;
    }
    script += ageQ + '\n\n';
    qNum++;
  }

  // 2. 키
  if (isSelected('키') || person.preferredHeight) {
    let heightQ = `${getTitle('키', person.height)}\n`;
    if (person.preferredHeight) {
      const hNum = parseInt(person.preferredHeight.replace(/[^0-9]/g, '')) || 0;
      const isHeightPriority =
        person.priorityWeights && (person.priorityWeights.includes('키1') || person.priorityWeights.includes('키 1'));
      const priorityText = isHeightPriority ? '1순위로 두셨는데' : '적어주셨는데';

      if (gender === '여자') {
        if (hNum > 0) {
          heightQ += `키 관련해서 ${person.preferredHeight}으로 ${priorityText}, 다른 조건이 괜찮다면 `;
          if (hNum >= 178) {
            const minH = hNum - 3;
            const maxH = hNum - 1;
            heightQ += `${minH}~${maxH}cm 정도는 괜찮으실까요?`;
          } else {
            const minH = hNum - 2;
            const maxH = hNum - 1;
            heightQ += `${minH}~${maxH}cm 정도는 괜찮으실까요?`;
          }
        } else {
          heightQ += `키 관련해서 ${person.preferredHeight}으로 적어주셨는데, 구체적인 기준(cm)이 있으실까요?`;
        }
      } else {
        heightQ += `키 관련해서 ${person.preferredHeight}으로 ${priorityText}, 다른 조건이 정말 괜찮다면 조금 유연하게 봐주실 수 있을까요?`;
      }
    } else {
      heightQ += `키 조건을 선택해주셨는데, 구체적으로 선호하시는 키 기준이 있으실까요?`;
    }

    if (!isSelected('키')) {
      heightQ += `\n네 필수조건은 아니셔서 희망하시는 키로 가점 매칭되지만, 약간의 차이가 있는 분이 나올 수도 있는 점 참고부탁드려요!`;
    }

    heightQ += `\n키 조건을 높게 잡으면 외모나 연봉 등 다른 조건이 조금 아쉬운 분이 매칭될 수도 있어서요!`;

    script += heightQ + '\n\n';
    qNum++;
  }

  // 3. 흡연
  if (isSelected('흡연') || person.preferredSmoking) {
    const titleInfo = person.preferredSmoking ? `선호: ${person.preferredSmoking}` : '';
    let smokeQ = `${getTitle('흡연', titleInfo)}\n`;

    if (person.preferredSmoking && person.preferredSmoking.includes('비흡연') && isSelected('흡연')) {
      smokeQ += `비흡연 선호라고 해주셔서, 비흡연자로 소개드리도록 하겠습니다!`;
    } else if (person.preferredSmoking && person.preferredSmoking.includes('비흡연')) {
      smokeQ += `비흡연 선호라고 해주셨는데,\n`;
      smokeQ += `다른 조건이 괜찮다면 흡연자라도 괜찮으실까요?`;
      if (!isSelected('흡연')) {
        smokeQ += `\n네 필수조건은 아니셔서 비흡연자로 가점 매칭되지만 흡연자가 제공될수도 있는 점 참고부탁드려요!`;
      }
    } else if (person.preferredSmoking) {
      smokeQ += `흡연 여부는 설문에 적어주신 대로 반영하겠습니다!`;
    } else {
      smokeQ += `흡연 조건을 선택해주셨는데, 비흡연자만 원하시나요?`;
    }
    script += smokeQ + '\n\n';
    qNum++;
  }

  // 4. 종교
  if (isSelected('종교')) {
    let relQ = `${getTitle('종교', person.religion)}\n`;

    if (person.religion === '무교') {
      relQ += `본인 종교가 무교이신데요, 상대방도 무교이신 분으로 소개드리겠습니다!`;
    } else {
      relQ += `본인 종교가 ${person.religion}이신데요,\n`;
      if (hasOption('무교만')) {
        relQ += `종교 조건으로 '무교만'을 선택해주셨네요!\n`;
        relQ += `상대방이 무교인 분들 위주로 우선 매칭해드리겠습니다.`;
      } else if (hasOption('종교일치')) {
        relQ += `종교 조건으로 '종교 일치'를 선택해주셨네요!\n`;
        relQ += `회원님과 같은 종교를 가지신 분들 위주로 매칭 진행하겠습니다.`;
      } else if (person.religion && person.religion !== '무교') {
        relQ += `혹시 상대방도 꼭 같은 종교여야 할까요? 아니면 무교인 분까지는 괜찮으실까요?\n`;
        relQ += `(특정 종교만 고집하면 매칭이 어려울 수 있어서, 무교까지 넓혀주시면 훨씬 좋은 분 소개가 가능합니다!)`;
      } else {
        relQ += `상대방이 무교거나 다른 종교여도 존중해주시면 괜찮으신지 확인 부탁드려요!`;
      }
    }
    script += relQ + '\n\n';
    qNum++;
  }

  // 5. 학력
  const prefEdu = person.preferredEducation || '';
  const isHighEdu = prefEdu.includes('대졸') || prefEdu.includes('4년제') || prefEdu.includes('대학원');
  if (isSelected('학력') || isHighEdu) {
    let eduQ = `${getTitle('학력')}\n`;
    if (isHighEdu) {
      eduQ += `대졸 이상으로 하셨는데, 전문대졸은 괜찮으실까요?\n`;
      
      const isJeonnam = person.location.includes('여수') || person.location.includes('순천') || person.location.includes('광양');
      
      if (isJeonnam) {
        eduQ += `지역특성상 대기업분들이 전문대졸이나 고졸이 많으셔서요!`;
      }
      
      if (!isSelected('학력')) {
        eduQ += `\n네 필수조건은 아니셔서 대졸로 가점 매칭되지만 다른학력이 나올 수도 있는 점 참고부탁드려요!`;
      }
    } else {
      eduQ += `필수로 학력조건 선택해주셨는데, ${prefEdu}로 반영하여 진행하겠습니다!`;
    }
    script += eduQ + '\n\n';
    qNum++;
  }

  // 6. 지역
  let locQ = `${getTitle('지역')}\n`;
  if (isSelected('지역')) {
    if (hasOption('전남')) {
      let myCity = '해당 지역';
      if (person.location.includes('여수')) myCity = '여수';
      if (person.location.includes('순천')) myCity = '순천';
      if (person.location.includes('광양')) myCity = '광양';
      if (person.location.includes('목포')) myCity = '목포';

      locQ += `지역 조건으로 '전남'을 선택해주셨네요!\n`;
      locQ += `${person.name}님 거주지인 ${myCity} 기준으로 가점을 드리지만,\n`;
      locQ += `필터 특성상 전남 전체 지역이 소개 범위에 포함되는 점 참고 부탁드립니다.\n`;
      locQ += `(광주 필터와는 분리되어 진행됩니다!)`;
    } else if (hasOption('광주')) {
      locQ += `지역 조건으로 '광주'를 선택해주셨네요!\n`;
      locQ += `광주와 광주 근교 거주자분들로 매칭 도와드리겠습니다.`;
    } else {
      const loc = person.location || '';
      if (loc.includes('광주')) {
        locQ += `거주지가 광주이신데, 광주 지역만 선호하시나요? 아니면 전남(여순광)도 괜찮으신가요?`;
      } else {
        locQ += `지역 필터는 크게 전남(여순광)과 광주로 나뉩니다.\n`;
        locQ += `선호하시는 지역을 말씀해주시면 그쪽에 가점을 반영해드릴게요.`;
      }
    }
  } else {
    locQ += `지역이 필수조건은 아니셔서 선호하시는 지역(거주지)으로 가점 매칭되지만, 인근이나 타 지역 분이 나올 수도 있는 점 참고부탁드려요!`;
  }
  script += locQ + '\n\n';
  qNum++;

  // 7. 연봉
  if (isSelected('연봉') || (person.preferredIncome && !person.preferredIncome.includes('무관'))) {
    let incQ = `${getTitle('연봉', '', '', '연봉(경제력)')}\n`;
    if (person.preferredIncome) {
      incQ += `연봉 ${person.preferredIncome}으로 하셨는데,\n`;
      if (person.preferredIncome.startsWith('7천') || person.preferredIncome.includes('1억')) {
        incQ += `이 기준이 절대적인가요? 혹시 다른 조건이 정말 좋다면 조금 조절 가능하실까요?`;
      } else {
        incQ += `설문지 내용 그대로 우선 반영하도록 하겠습니다.`;
      }
    } else {
      incQ += `연봉(경제력) 조건을 선택해주셨는데, 어느 정도 기준을 원하시나요?`;
    }
    if (!isSelected('연봉')) {
      incQ += `\n네 필수조건은 아니셔서 희망하시는 연봉대로 가점 매칭되지만, 금액대가 다른 분이 나올 수도 있는 점 참고부탁드려요!`;
    }
    script += incQ + '\n\n';
    qNum++;
  }

  // 8. 직업
  let jobQ = `${getTitle('직업')}\n`;

  jobQ += `직업은 직장인을 선호하시는걸까요?\n아니면 자영업도 가능하실까요?`;

  if (!isSelected('직업')) {
    jobQ += `\n네 필수조건은 아니셔서 직장인으로 가점 매칭되지만 자영업이 나올 수도 있는 점 참고부탁드려요!`;
  }
  script += jobQ + '\n\n';
  qNum++;

  // 마무리
  script += `--------------------------------\n\n`;
  script += `네! 질문 모두 확인했습니다 🙂\n`;

  if (isPremium) {
    script += `말씀해주신 ${conditions.length}가지 조건은 확실하게 맞춰서 소개해드리겠습니다!\n`;
    script += `그 외 부분들도 최대한 신경 써서 좋은 분 찾아볼게요.\n\n`;
  } else {
    script += `회원님께서 선택하신 2가지 조건은 확실히 보장해드리며,\n`;
    script += `그 외 조건들도 가능한 범위 내에서 최대한 맞춰 소개해드리겠습니다!\n\n`;
  }

  if (person.group === '돈냄') {
    script += `1차 후보군 검색을 시작하겠습니다 😊\n\n`;
    script += `네 이번주 중으로 매칭 연락 드리겠습니다! 감사합니다.`;
  } else {
    script += `이제 본격적인 매칭 진행을 위해 [프로필 제공권] 결제 진행 부탁드립니다!\n\n`;

    const priceObj = getPriceObj(person.gender, person.group);

    script += `💰 이용권 안내\n`;
    if (isPremium) {
      script += `프리미엄: ${priceObj.premium} (3개월 간 프로필 제공)\n`;
    } else {
      script += `베이직: ${priceObj.basic} (3개월 간 프로필 제공)\n`;
    }

    script += `\n📩 입금 계좌\n카카오뱅크 7979-03-95796 임상현\n`;
    script += `※ '오늘 오후 8시'까지, 입금 확인 후 바로 리스트업 들어갑니다!\n\n`;
    script += `네 이번주 중으로 매칭 연락 드리겠습니다! 감사합니다.`;
  }

  return script;
};

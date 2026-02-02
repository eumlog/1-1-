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

    // Assuming fields layout based on common spreadsheet structure
    // Typically: Group, ID/Date, Name, Birth, Gender, Location, Job, Height, Education, Income, Smoking, Religion...
    const name = fields[g - 2] || fields[g - 1] || '회원';
    const birth = fields[g - 1] || '';
    const gender = fields[g];
    const location = fields[g + 1] || '';
    const job = fields[g + 2] || '';
    const height = fields[g + 3] || '';
    const education = fields[g + 4] || '';
    const income = fields[g + 5] || '';
    const smoking = fields[g + 6] || '';
    const religion = fields[g + 7] || '';
    const personality = fields[g + 8] || ''; // Hypothetical

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

    // Scan for condition column
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
      if ((val.includes('천') || val.includes('억') || val.includes('무관')) && (val.includes('원') || val.includes('이상') || val.includes('미만'))) {
         if (!preferredIncome && !val.includes('비용')) {
             preferredIncome = val;
             continue;
         }
      }
    }

    const selectedConditions = selectedConditionStr.split(/[|,\/]/).map(s => s.trim()).filter(Boolean);

    results.push({
      id: Math.random().toString(36).substr(2, 9),
      group,
      name,
      gender,
      birth,
      phone: '', // Mock
      location,
      job,
      height,
      education,
      income,
      smoking,
      religion,
      
      preferredAge,
      preferredHeight,
      preferredIncome,
      preferredEducation,
      preferredSmoking,
      
      priorityWeights,
      selectedConditionStr,
      selectedConditions,
      membershipType: selectedConditions.length >= 3 ? 'PREMIUM' : 'BASIC',
      
      personality
    });
  }
  return results;
};

export const generateScript = (person: Person): string => {
  const isPremium = person.membershipType === 'PREMIUM';
  const conditions = person.selectedConditions.length > 0 ? person.selectedConditions.join(', ') : '없음';

  return `안녕하세요, ${person.name}님. 이음로그 매니저입니다.
보내주신 프로필과 이상형 정보 잘 확인했습니다.

회원님은 현재 [${person.group}] 그룹, ${person.membershipType} 플랜으로 분류되셨으며,
선택하신 보장 조건은 [${conditions}] 입니다.

1. 나이: ${person.preferredAge || '-'}
2. 키: ${person.preferredHeight || '-'}
3. 흡연: ${person.preferredSmoking || '-'}
4. 학력: ${person.preferredEducation || '-'}
5. 연봉: ${person.preferredIncome || '-'}

위 내용을 바탕으로 최적의 상대를 찾아드리겠습니다.
수정이 필요하시면 언제든 말씀해 주세요.`;
};
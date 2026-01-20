import React, { useMemo } from 'react';
import { Person } from '../types';
import { generateScript } from '../utils/dataProcessor';

interface ResultCardProps {
  person: Person;
  index: number;
  searchTerm: string;
}

const HighlightText: React.FC<{ text: string; term: string }> = ({ text, term }) => {
  if (!term || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === term.toLowerCase() ? (
          <span key={i} className="bg-yellow-100 rounded px-0.5">{part}</span>
        ) : (
          part
        )
      )}
    </>
  );
};

export const ResultCard: React.FC<ResultCardProps> = ({ person, index, searchTerm }) => {
  const isPremium = person.membershipType === 'PREMIUM';
  const scriptContent = useMemo(() => generateScript(person), [person]);
  const groupBadgeColor = person.group === '일반' ? 'bg-gray-400' : 'bg-emerald-500';

  return (
    <div 
      id={`card-${index}`}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 transition-transform duration-200 hover:shadow-md"
    >
      <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4 border-b-2 border-gray-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-extrabold text-slate-700">
            <HighlightText text={person.name} term={searchTerm} />
          </div>
          <div className="flex gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold text-white uppercase ${groupBadgeColor}`}>
              {person.group}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold text-white uppercase bg-gradient-to-br ${isPremium ? 'from-purple-500 to-purple-600' : 'from-blue-500 to-blue-600'}`}>
              {person.membershipType}
            </span>
          </div>
        </div>
        <div className="text-[15px] text-gray-500 bg-gray-50 px-4 py-2 rounded-lg">
          {person.gender} · {person.birth.substring(0, 2)}년생 · <HighlightText text={person.location} term={searchTerm} /> · <HighlightText text={person.job} term={searchTerm} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-[#fbfbfb] p-5 rounded-xl border border-gray-100">
          <div className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
            기본 프로필
          </div>
          <div className="text-[15px] leading-7 text-gray-700">
            📞 {person.phone}<br />
            📏 {person.height} / {person.education}<br />
            💰 {person.income}<br />
            🚬 {person.smoking}<br />
            ✨ {person.personality || '-'}
          </div>
        </div>
        <div className="bg-[#fbfbfb] p-5 rounded-xl border border-gray-100">
          <div className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
            매칭 조건 설정
          </div>
          <div className="text-[15px] leading-7 text-gray-700">
            🎯 <b>선택 조건:</b> {person.selectedConditions.length > 0 ? person.selectedConditions.join(', ') : <span className="text-red-500">미확인</span>}<br />
            ❤️ <b>선호 나이:</b> {person.preferredAge || '-'}<br />
            📏 <b>선호 키:</b> {person.preferredHeight || '-'}<br />
            🚫 <b>선호 흡연:</b> {person.preferredSmoking || '-'}
          </div>
        </div>
      </div>

      <div className={`rounded-r-xl border-l-[5px] p-6 relative ${isPremium ? 'bg-[#f3f0ff] border-purple-500' : 'bg-[#f0f7ff] border-blue-500'}`}>
        <div className={`font-bold mb-4 text-lg flex items-center gap-2 ${isPremium ? 'text-purple-600' : 'text-indigo-600'}`}>
          💬 [{person.group}] {person.membershipType} 맞춤 상담 스크립트
        </div>
        <div className="whitespace-pre-wrap font-[Pretendard] text-gray-700 leading-relaxed">
          {scriptContent}
        </div>
      </div>
    </div>
  );
};

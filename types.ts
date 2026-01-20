export interface Person {
  id: string;
  group: string;
  name: string;
  gender: string;
  birth: string;
  phone: string;
  location: string;
  job: string;
  height: string;
  education: string;
  income: string;
  smoking: string;
  religion: string;
  
  preferredAge: string;
  preferredHeight: string;
  preferredIncome: string;
  preferredEducation: string;
  preferredSmoking: string;
  
  priorityWeights: string;
  selectedConditionStr: string;
  selectedConditions: string[];
  membershipType: 'PREMIUM' | 'BASIC';
  
  personality: string;
}

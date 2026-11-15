import {
  CefrLevel,
  InterviewLevel,
  InterviewRoleId,
  LevelEvaluationCriteria,
  QuestionBankItem,
  RubricConfig,
} from '../types/interviewCenter';

// ============================================================================
// 1. SUPPORTED SPOKEN LANGUAGES FOR VOICE RECOGNITION & TRANSLATION
// ============================================================================
export interface SupportedSpokenLanguage {
  code: string;
  bcp47: string;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_SPOKEN_LANGUAGES: SupportedSpokenLanguage[] = [
  { code: 'auto', bcp47: 'en-US', label: 'Auto-Detect / International English', nativeLabel: 'Auto / English' },
  { code: 'en-GB', bcp47: 'en-GB', label: 'English (UK / British)', nativeLabel: 'English (UK)' },
  { code: 'en-US', bcp47: 'en-US', label: 'English (US / North America)', nativeLabel: 'English (US)' },
  { code: 'en-IN', bcp47: 'en-IN', label: 'English (South Asian Accent)', nativeLabel: 'English (IN/BD/PK)' },
  { code: 'bn', bcp47: 'bn-BD', label: 'Bengali (Translated to English)', nativeLabel: 'বাংলা (Bengali)' },
  { code: 'hi', bcp47: 'hi-IN', label: 'Hindi (Translated to English)', nativeLabel: 'हिन्दी (Hindi)' },
  { code: 'ur', bcp47: 'ur-PK', label: 'Urdu (Translated to English)', nativeLabel: 'اردو (Urdu)' },
  { code: 'ar', bcp47: 'ar-SA', label: 'Arabic (Translated to English)', nativeLabel: 'العربية (Arabic)' },
  { code: 'es', bcp47: 'es-ES', label: 'Spanish (Translated to English)', nativeLabel: 'Español (Spanish)' },
  { code: 'fr', bcp47: 'fr-FR', label: 'French (Translated to English)', nativeLabel: 'Français (French)' },
  { code: 'pt', bcp47: 'pt-BR', label: 'Portuguese (Translated to English)', nativeLabel: 'Português (Portuguese)' },
  { code: 'ru', bcp47: 'ru-RU', label: 'Russian (Translated to English)', nativeLabel: 'Русский (Russian)' },
  { code: 'tl', bcp47: 'tl-PH', label: 'Filipino / Tagalog (Translated to English)', nativeLabel: 'Filipino / Tagalog' },
  { code: 'ne', bcp47: 'ne-NP', label: 'Nepali (Translated to English)', nativeLabel: 'नेपाली (Nepali)' },
];

// ============================================================================
// 2. LEVEL-SPECIFIC INSTRUCTIONS, EVALUATION CRITERIA & PASSING REQUIREMENTS
// ============================================================================
export const LEVEL_EVALUATION_RULES: Record<InterviewLevel, LevelEvaluationCriteria> = {
  '1': {
    level: '1',
    levelLabel: 'Level 1 — Basic (Entry / Foundational)',
    instructions:
      'Level 1 (Basic) assesses foundational job duties, polite customer communication, basic workplace hygiene, and essential safety awareness. Answer each question in 2 to 4 clear sentences.',
    passingScoreThreshold: 65,
    minQuestionsRequired: 3,
    minWordCountPerAnswer: 12,
    evaluationFocus: [
      'Foundational role duties and routine procedures',
      'Polite, understandable English sentences',
      'Basic workplace hygiene, honesty, and safety compliance',
    ],
    passingRequirementsText:
      'Minimum Score: 65/100 (65%) · At least 3 primary questions answered · Zero critical safety violations.',
  },
  '2': {
    level: '2',
    levelLabel: 'Level 2 — Intermediate (Operational & Troubleshooting)',
    instructions:
      'Level 2 (Intermediate) assesses practical problem-solving, service recovery, technical troubleshooting, workflow organization, and safety protocols. Answer in 3 to 5 structured sentences explaining your step-by-step reasoning.',
    passingScoreThreshold: 70,
    minQuestionsRequired: 3,
    minWordCountPerAnswer: 18,
    evaluationFocus: [
      'Step-by-step operational troubleshooting and service recovery',
      'Accurate technical/hospitality terminology and structured sentences',
      'Proactive allergen, hygiene, or electrical/plumbing safety verification',
    ],
    passingRequirementsText:
      'Minimum Score: 70/100 (70%) · At least 3 primary questions answered · Zero critical safety violations.',
  },
  '3': {
    level: '3',
    levelLabel: 'Level 3 — Advanced (Complex Scenarios & Leadership)',
    instructions:
      'Level 3 (Advanced) assesses complex diagnostics, high-pressure de-escalation, supervisory judgment, preventive maintenance/quality systems, and strict regulatory compliance. Provide comprehensive, well-structured responses (4 to 6 sentences).',
    passingScoreThreshold: 75,
    minQuestionsRequired: 3,
    minWordCountPerAnswer: 24,
    evaluationFocus: [
      'Advanced technical/service diagnosis and root-cause prevention',
      'Supervisory prioritization, escalation, and clear professional English',
      'Strict adherence to LOTO, public health, allergen, and licensing laws',
    ],
    passingRequirementsText:
      'Minimum Score: 75/100 (75%) · At least 3 primary questions answered · Zero critical safety violations.',
  },
  A1: {
    level: 'A1',
    levelLabel: 'CEFR A1 — Beginner',
    instructions:
      'CEFR A1 assesses your ability to use simple everyday expressions, basic present-tense sentences, and familiar personal/workplace vocabulary.',
    passingScoreThreshold: 60,
    minQuestionsRequired: 3,
    minWordCountPerAnswer: 8,
    evaluationFocus: ['Understandable short sentences', 'Basic present tense verbs', 'Everyday personal and routine vocabulary'],
    passingRequirementsText: 'Minimum Score: 60/100 (60%) · At least 3 primary questions answered.',
  },
  A2: {
    level: 'A2',
    levelLabel: 'CEFR A2 — Elementary',
    instructions:
      'CEFR A2 assesses connected short sentences about routine work, past experiences, future plans, and polite customer assistance.',
    passingScoreThreshold: 65,
    minQuestionsRequired: 3,
    minWordCountPerAnswer: 12,
    evaluationFocus: ['Simple past and future tenses', 'Connected sentences using because/and/but', 'Polite everyday workplace exchanges'],
    passingRequirementsText: 'Minimum Score: 65/100 (65%) · At least 3 primary questions answered.',
  },
  B1: {
    level: 'B1',
    levelLabel: 'CEFR B1 — Intermediate',
    instructions:
      'CEFR B1 assesses connected explanations, workplace problem-solving narratives, opinions supported by reasons, and practical grammatical control.',
    passingScoreThreshold: 70,
    minQuestionsRequired: 3,
    minWordCountPerAnswer: 18,
    evaluationFocus: ['Coherent multi-sentence explanations', 'Reasons and real examples', 'Controlled grammar across past, present, and conditional tenses'],
    passingRequirementsText: 'Minimum Score: 70/100 (70%) · At least 3 primary questions answered.',
  },
  B2: {
    level: 'B2',
    levelLabel: 'CEFR B2 — Upper Intermediate',
    instructions:
      'CEFR B2 assesses clear, detailed arguments comparing options, evaluating pros and cons, and handling workplace misunderstandings professionally.',
    passingScoreThreshold: 72,
    minQuestionsRequired: 3,
    minWordCountPerAnswer: 22,
    evaluationFocus: ['Structured arguments and comparisons', 'Varied workplace vocabulary and connectors', 'Complex clause structures with high clarity'],
    passingRequirementsText: 'Minimum Score: 72/100 (72%) · At least 3 primary questions answered.',
  },
  C1: {
    level: 'C1',
    levelLabel: 'CEFR C1 — Advanced',
    instructions:
      'CEFR C1 assesses fluent, well-structured discourse on complex ethical, analytical, and leadership topics tailored to diverse audiences.',
    passingScoreThreshold: 75,
    minQuestionsRequired: 3,
    minWordCountPerAnswer: 26,
    evaluationFocus: ['Nuanced professional vocabulary', 'Complex grammatical accuracy and discourse markers', 'Analytical depth and persuasive clarity'],
    passingRequirementsText: 'Minimum Score: 75/100 (75%) · At least 3 primary questions answered.',
  },
  C2: {
    level: 'C2',
    levelLabel: 'CEFR C2 — Proficient',
    instructions:
      'CEFR C2 assesses mastery-level precision, idiomatic control, critical synthesis of counterarguments, and adaptive register across audiences.',
    passingScoreThreshold: 78,
    minQuestionsRequired: 3,
    minWordCountPerAnswer: 30,
    evaluationFocus: ['Precision of meaning and subtle qualification', 'Sophisticated syntactic variety and cohesion', 'Executive-level synthesis of competing viewpoints'],
    passingRequirementsText: 'Minimum Score: 78/100 (78%) · At least 3 primary questions answered.',
  },
};

export function getLevelEvaluationCriteria(level: InterviewLevel): LevelEvaluationCriteria {
  return LEVEL_EVALUATION_RULES[level] || LEVEL_EVALUATION_RULES['1'];
}

// ============================================================================
// 3. SYNONYM & CONCEPT VARIATION DICTIONARY FOR DETERMINISTIC EVALUATION
// ============================================================================
const CONCEPT_SYNONYM_GROUPS: Record<string, string[]> = {
  greeting: ['greet', 'welcome', 'hello', 'good morning', 'good evening', 'smile', 'eye contact', 'warm', 'friendly', 'polite'],
  apology: ['apologise', 'apologize', 'sorry', 'sincerely', 'regret', 'pardon', 'excuse', 'acknowledge', 'understand'],
  repeat: ['repeat', 'confirm', 'read back', 'write down', 'verify', 'double check', 'check back', 'note'],
  allergy: ['allergy', 'allergies', 'allergen', 'allergens', 'intolerance', 'dietary', 'nut', 'gluten', 'dairy', 'celiac', 'anaphylaxis', 'epipen', 'cross-contact', 'cross contamination', 'separate', 'ingredient', 'chef', 'kitchen', 'manager'],
  kitchen: ['kitchen', 'chef', 'cook', 'pass', 'ticket', 'pos', 'order', 'update', 'communicate', 'coordinate'],
  supervisor: ['supervisor', 'manager', 'lead', 'senior', 'duty manager', 'escalate', 'report', 'inform', 'notify'],
  intoxicated: ['intoxicated', 'drunk', 'alcohol', 'refuse', 'cut off', 'water', 'soft drink', 'non-alcoholic', 'taxi', 'cab', 'safety', 'law', 'policy', 'polite'],
  clean: ['clean', 'sanitize', 'sanitise', 'wipe', 'hygiene', 'wash', 'purge', 'organize', 'organised', 'tidy', 'spill', 'broken glass', 'ice well', 'burn', 'discard'],
  cocktail: ['shake', 'shaking', 'stir', 'stirring', 'build', 'building', 'jigger', 'measure', 'recipe', 'spec', 'ice', 'garnish', 'glass', 'citrus', 'spirit', 'vermouth', 'liqueur', 'bitters', 'balance', 'sweet', 'acid', 'sour'],
  fifo: ['fifo', 'first in first out', 'rotation', 'date', 'label', 'expiry', 'fresh', 'freshness', 'sealed', 'airtight', 'storage', 'waste', 'wastage'],
  espresso: ['espresso', 'grind', 'grinder', 'dose', 'tamp', 'distribute', 'extract', 'extraction', 'shot', 'portafilter', 'group head', 'purge', 'yield', 'time', 'seconds', 'grams', 'scale', 'bitter', 'sour', 'under-extracted', 'over-extracted', 'dial in'],
  milk: ['milk', 'steam', 'steaming', 'wand', 'aerate', 'aeration', 'microfoam', 'whirlpool', 'texture', 'temperature', 'latte', 'cappuccino', 'americano', 'flat white', 'oat', 'soy', 'almond', 'pitcher'],
  loto: ['isolate', 'isolation', 'loto', 'lockout', 'tagout', 'lock out', 'tag out', 'padlock', 'de-energise', 'de-energize', 'turn off', 'switch off', 'breaker', 'disconnect', 'verify', 'prove dead', 'test before touch', 'voltage indicator', 'multimeter', 'proving unit', 'zero energy', 'ppe', 'arc flash', 'gloves', 'insulated'],
  electrical: ['overload', 'short circuit', 'thermal', 'magnetic', 'breaker', 'mcb', 'rcd', 'gfci', 'earth', 'ground', 'leakage', 'imbalance', 'continuity', 'resistance', 'ohm', 'insulation', 'megger', 'single-phase', 'three-phase', '230v', '400v', '415v', 'motor', 'phase sequence', 'reverse', 'swap', 'two phases', 'relay', 'contactor', 'star', 'delta', 'interlock', 'vfd', 'inverter', 'pwm', 'capacitor', 'power factor', 'apfc', 'harmonics', 'plc', 'emi', 'shield', 'transformer', 'buchholz'],
  plumbing: ['pvc', 'cpvc', 'copper', 'pex', 'pipe', 'temperature', 'hot water', 'cold water', 'drain', 'drainage', 'p-trap', 'trap', 'water seal', 'sewer', 'gas', 'odour', 'vent', 'siphon', 'solder', 'flux', 'lead-free', 'deburr', 'cut', 'torch', 'fire', 'slope', 'gradient', 'fall', 'pressure test', 'gauge', 'cap', 'leak', 'rpz', 'backflow', 'cross-connection', 'potable', 'air gap', 'relief', 'heater', 'thermostat', 'thermocouple', 'sediment', 'flue', 'pump', 'impeller', 'float', 'sewage', 'expansion tank', 'tpr', 'grease', 'hydro-jet', 'snake', 'auger', 'booster', 'head', 'water hammer', 'arrestor', 'legionella', 'tmv', 'mixing valve', 'scald', 'greywater', 'blackwater', 'softener', 'resin', 'brine'],
};

// Build rich backend evaluation guidelines for any QuestionBankItem
export function enrichQuestionWithBackendGuidelines(question: QuestionBankItem): QuestionBankItem {
  const levelRules = getLevelEvaluationCriteria(question.level);

  // Extract key concepts from evaluatorLooksFor
  const rawPhrases = question.evaluatorLooksFor
    .replace(/\.$/, '')
    .split(/[,;]+/)
    .map(s => s.trim())
    .filter(Boolean);

  // Build acceptable variations list by expanding keywords with domain synonyms
  const acceptableSet = new Set<string>();
  const lowerLooksFor = (question.evaluatorLooksFor + ' ' + question.questionText).toLowerCase();

  rawPhrases.forEach(p => acceptableSet.add(p.toLowerCase()));
  Object.entries(CONCEPT_SYNONYM_GROUPS).forEach(([groupKey, synonyms]) => {
    if (lowerLooksFor.includes(groupKey) || synonyms.some(syn => lowerLooksFor.includes(syn))) {
      synonyms.forEach(syn => acceptableSet.add(syn));
    }
  });

  const modelAnswer = question.modelAnswer || buildCuratedModelAnswer(question);

  return {
    ...question,
    instructions: question.instructions || levelRules.instructions,
    keyConcepts: question.keyConcepts && question.keyConcepts.length > 0 ? question.keyConcepts : rawPhrases,
    acceptableVariations:
      question.acceptableVariations && question.acceptableVariations.length > 0
        ? question.acceptableVariations
        : Array.from(acceptableSet).slice(0, 25),
    modelAnswer,
    passingScore: question.passingScore || levelRules.passingScoreThreshold,
  };
}

export function buildCuratedModelAnswer(question: QuestionBankItem): string {
  const criteria = question.evaluatorLooksFor.replace(/\.$/, '');
  if (question.role === 'electrician') {
    return `First, I would notify affected personnel, follow full Lockout/Tagout (LOTO) safe isolation, and verify zero energy using an approved voltage indicator and proving unit ("test before touch") while wearing risk-assessed PPE. Next, I would systematically address ${criteria}. Finally, I would verify safe operation, document the readings, and escalate any abnormal condition to the supervisor.`;
  }
  if (question.role === 'plumber') {
    return `First, I would isolate the water or energy supply as required, wear appropriate PPE, and verify local plumbing code and manufacturer specifications. I would then address ${criteria} step by step while protecting potable water safety and preventing leaks or contamination. Finally, I would pressure-test or inspect the work and record the maintenance details.`;
  }
  if (question.role === 'waiter') {
    return `I would remain calm, polite, and attentive to the guest. Specifically, I would ensure ${criteria}. Throughout the interaction, I would communicate clearly with the kitchen and my supervisor, never guess on allergens or availability, and follow up with the table to confirm the guest is completely satisfied.`;
  }
  if (question.role === 'bartender') {
    return `Behind the bar, I would maintain a clean, organised station and follow the exact standard recipe and responsible service policies. For this scenario, I would focus on ${criteria}, verify any allergen or dietary requirements using official product specifications, and ensure consistent presentation and guest satisfaction.`;
  }
  if (question.role === 'barista') {
    return `As a barista, I would keep the espresso machine, steam wand, and grinder clean and calibrated. I would systematically apply ${criteria}, changing only one variable at a time when troubleshooting extraction, and maintain strict hygiene and allergen cross-contact prevention for every customer order.`;
  }
  // CEFR English
  return `A strong ${question.levelLabel} response directly answers "${question.questionText}" in complete, well-connected English sentences, demonstrating ${criteria} with specific real-world examples and clear reasons.`;
}

// ============================================================================
// 4. DETERMINISTIC SAFETY HAZARD & OMISSION DETECTOR
// ============================================================================
export function detectSafetyStatusAutomated(
  role: InterviewRoleId,
  question: QuestionBankItem,
  answerText: string
): { flagged: boolean; reason?: string } {
  const lower = answerText.toLowerCase();

  // 1. Explicit unsafe actions
  if (role === 'electrician') {
    const unsafeLiveWork =
      /(work live|without isolating|skip loto|no loto|bypass interlock|bypass breaker|jumper the fuse|bare hands on live|touch live wire|keep resetting the breaker)/i.test(
        lower
      );
    if (unsafeLiveWork) {
      return {
        flagged: true,
        reason:
          'Candidate proposed working on live electrical equipment, bypassing protection/interlocks, or skipping Lockout/Tagout (LOTO) safe isolation.',
      };
    }
    if (
      question.isSafetyCritical &&
      /loto|isolat|lockout|open circuit|reverse|vfd|capacitor|transformer/i.test(question.questionText) &&
      !/\b(isolat|loto|lock|tag|off|de-energ|test|verify|zero|dead|ppe|safe|escalat|discharge)\b/i.test(lower)
    ) {
      return {
        flagged: true,
        reason:
          'Safety-critical electrical question answered without mentioning safe isolation (LOTO), de-energising, or verifying zero energy before work.',
      };
    }
  }

  if (role === 'plumber') {
    const unsafePlumbing =
      /(use lead solder on drinking|plug the relief valve|cap the tpr|cap relief valve|connect sewage directly to drinking|ignore gas leak|use open flame to find gas leak)/i.test(
        lower
      );
    if (unsafePlumbing) {
      return {
        flagged: true,
        reason:
          'Candidate proposed an unsafe plumbing practice (capping a relief valve, potable water contamination, lead solder on drinking lines, or unsafe gas handling).',
      };
    }
  }

  if (role === 'waiter' || role === 'bartender' || role === 'barista') {
    const unsafeAllergyOrAlcohol =
      /(guess the ingredient|probably fine for allergy|don't tell the kitchen about allergy|serve the drunk|give more alcohol to intoxicated|serve anyway even if allergic|leave broken glass in ice)/i.test(
        lower
      );
    if (unsafeAllergyOrAlcohol) {
      return {
        flagged: true,
        reason:
          'Candidate proposed guessing on food/drink allergens, serving alcohol to an visibly intoxicated guest, or ignoring physical contamination hazards.',
      };
    }
  }

  return { flagged: false };
}

// ============================================================================
// 5. DETERMINISTIC ENGLISH GRAMMAR, VOCABULARY & SENTENCE ANALYZER
// ============================================================================
interface GrammarRuleCheck {
  pattern: RegExp;
  fix: (match: string) => string;
  explanation: string;
}

const DETERMINISTIC_GRAMMAR_RULES: GrammarRuleCheck[] = [
  {
    pattern: /\bi\b/g,
    fix: () => 'I',
    explanation: 'Capitalize the first-person pronoun "I" in formal English.',
  },
  {
    pattern: /\b(i am agree|i'm agree)\b/gi,
    fix: () => 'I agree',
    explanation: '"Agree" is a verb in English, so use "I agree" instead of "I am agree".',
  },
  {
    pattern: /\b(i|we|they|you) (goes|gives|has|does|wants|needs|asks|tells|makes|works|takes|checks|says)\b/gi,
    fix: (m: string) => {
      const parts = m.split(/\s+/);
      const subj = parts[0].toLowerCase() === 'i' ? 'I' : parts[0];
      const verb = parts[1].toLowerCase();
      const map: Record<string, string> = {
        goes: 'go',
        gives: 'give',
        has: 'have',
        does: 'do',
        wants: 'want',
        needs: 'need',
        asks: 'ask',
        tells: 'tell',
        makes: 'make',
        works: 'work',
        takes: 'take',
        checks: 'check',
        says: 'say',
      };
      return `${subj} ${map[verb] || verb.replace(/s$/, '')}`;
    },
    explanation: 'Use base verb forms ("go", "give", "have", "do") with first-person and plural subjects ("I", "we", "they", "you").',
  },
  {
    pattern: /\b(he|she|it|guest|customer|manager|chef) (have|do|go|say|want|need|ask|tell|make|work)\b/gi,
    fix: (m: string) => {
      const parts = m.split(/\s+/);
      const subj = parts[0];
      const verb = parts[1].toLowerCase();
      const map: Record<string, string> = {
        have: 'has',
        do: 'does',
        go: 'goes',
        say: 'says',
        want: 'wants',
        need: 'needs',
        ask: 'asks',
        tell: 'tells',
        make: 'makes',
        work: 'works',
      };
      return `${subj} ${map[verb] || verb + 's'}`;
    },
    explanation: 'Use third-person singular verb agreement (-s/-es) with singular subjects (he/she/it/the guest/the customer).',
  },
  {
    pattern: /\b(they|we|you|guests|customers) (was|is|has)\b/gi,
    fix: (m: string) => {
      const parts = m.split(/\s+/);
      const subj = parts[0];
      const verb = parts[1].toLowerCase();
      const map: Record<string, string> = { was: 'were', is: 'are', has: 'have' };
      return `${subj} ${map[verb] || verb}`;
    },
    explanation: 'Use plural verb forms ("were", "are", "have") with plural subjects ("they", "we", "you", "guests").',
  },
  {
    pattern: /\b(informations|equipments|feedbacks|advices|knowledges)\b/gi,
    fix: (m: string) => m.replace(/s$/i, ''),
    explanation: 'Uncountable nouns such as "information", "equipment", "feedback", "advice", and "knowledge" do not take a plural "-s".',
  },
  {
    pattern: /\b(gonna|wanna|gotta|ain't)\b/gi,
    fix: (m: string) => {
      const lower = m.toLowerCase();
      if (lower === 'gonna') return 'going to';
      if (lower === 'wanna') return 'want to';
      if (lower === 'gotta') return 'have to';
      return 'am not / is not';
    },
    explanation: 'Avoid informal slang contractions ("gonna", "wanna", "gotta") in a professional interview; use full professional verbs.',
  },
  {
    pattern: /\b(more better|more faster|more easier|more higher)\b/gi,
    fix: (m: string) => m.replace(/^more\s+/i, ''),
    explanation: 'Avoid double comparatives ("more better" -> "better", "more faster" -> "faster").',
  },
  {
    pattern: /\b(didn't went|didn't did|didn't saw|didn't took|didn't checked|didn't told)\b/gi,
    fix: (m: string) => {
      const map: Record<string, string> = {
        'didn\'t went': 'did not go',
        'didn\'t did': 'did not do',
        'didn\'t saw': 'did not see',
        'didn\'t took': 'did not take',
        'didn\'t checked': 'did not check',
        'didn\'t told': 'did not tell',
      };
      return map[m.toLowerCase()] || m;
    },
    explanation: 'After auxiliary "did not / didn\'t", always use the base infinitive form of the verb (e.g., "did not check", not "didn\'t checked").',
  },
  {
    pattern: /\b(explain me|tell to me|ask to him|discuss about)\b/gi,
    fix: (m: string) => {
      const lower = m.toLowerCase();
      if (lower === 'explain me') return 'explain to me';
      if (lower === 'tell to me') return 'tell me';
      if (lower === 'ask to him') return 'ask him';
      if (lower === 'discuss about') return 'discuss';
      return m;
    },
    explanation: 'Use standard English verb-preposition collocations ("explain to me", "tell me", "discuss [topic]").',
  },
];

export function analyzeEnglishGrammarAndCommunication(answerText: string): {
  wordCount: number;
  sentenceCount: number;
  lexicalDiversity: number;
  connectorCount: number;
  politeMarkersCount: number;
  isGibberishOrNonAnswer: boolean;
  grammarRatio: number; // 0 to 1
  fluencyRatio: number; // 0 to 1
  grammarCorrection: { original: string; corrected: string; explanation: string } | null;
} {
  const trimmed = answerText.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Detect gibberish, keyboard mashing, or explicit non-answers
  const alphaWords = words.filter(w => /[a-zA-Z]{2,}/.test(w));
  const uniqueLowerWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean));
  const lexicalDiversity = wordCount > 0 ? uniqueLowerWords.size / wordCount : 0;

  const isExplicitNonAnswer =
    wordCount <= 2 ||
    /^(i don'?t know|no idea|not sure|pass|skip|nothing|none|n\/a|idk|no|yes|ok|okay|test|hello|hi)\.?$/i.test(trimmed) ||
    alphaWords.length < Math.min(2, wordCount) ||
    (wordCount >= 6 && lexicalDiversity < 0.25);

  const sentences = trimmed
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(Boolean);
  const sentenceCount = Math.max(1, sentences.length);

  // Check connectors and professional register
  const connectors = trimmed.match(
    /\b(first|second|third|next|then|finally|after that|because|therefore|however|furthermore|in addition|while|when|if|so that|to ensure|for example)\b/gi
  );
  const connectorCount = connectors ? connectors.length : 0;

  const politeMarkers = trimmed.match(
    /\b(please|thank|apologise|apologize|sorry|certainly|happy to|gladly|respectfully|politely|calmly|immediately|safety|carefully|verify|confirm)\b/gi
  );
  const politeMarkersCount = politeMarkers ? politeMarkers.length : 0;

  // Check grammar rules
  let correctedText = trimmed;
  let explanations: string[] = [];
  let errorCount = 0;

  for (const rule of DETERMINISTIC_GRAMMAR_RULES) {
    if (rule.pattern.test(correctedText)) {
      errorCount += 1;
      correctedText = correctedText.replace(rule.pattern, match => rule.fix(match));
      if (!explanations.includes(rule.explanation)) {
        explanations.push(rule.explanation);
      }
    }
  }

  // Check capitalization of first letter and ending punctuation
  if (correctedText.length > 0 && /^[a-z]/.test(correctedText)) {
    correctedText = correctedText.charAt(0).toUpperCase() + correctedText.slice(1);
    if (explanations.length === 0) {
      explanations.push('Start sentences with a capital letter.');
    }
  }
  if (correctedText.length > 0 && !/[.!?]$/.test(correctedText)) {
    correctedText = correctedText + '.';
  }

  let grammarCorrection: { original: string; corrected: string; explanation: string } | null = null;
  if (errorCount > 0 && correctedText !== trimmed) {
    grammarCorrection = {
      original: trimmed.slice(0, 220),
      corrected: correctedText.slice(0, 240),
      explanation: explanations.slice(0, 2).join(' '),
    };
  } else if (wordCount > 0 && wordCount < 12 && !isExplicitNonAnswer) {
    // Provide a constructive sentence expansion example for brief answers
    grammarCorrection = {
      original: trimmed,
      corrected: `In this situation, ${trimmed.charAt(0).toLowerCase() + trimmed.slice(1).replace(/[.!?]+$/, '')}, and I would verify all steps carefully to ensure high standards.`,
      explanation: 'Expand short phrases into complete, multi-clause professional sentences using connectors.',
    };
  }

  if (isExplicitNonAnswer) {
    return {
      wordCount,
      sentenceCount,
      lexicalDiversity,
      connectorCount,
      politeMarkersCount,
      isGibberishOrNonAnswer: true,
      grammarRatio: 0.1,
      fluencyRatio: 0.1,
      grammarCorrection: {
        original: trimmed || '(No answer provided)',
        corrected: 'I would approach this situation step by step by assessing the requirements, following standard procedure, and communicating clearly.',
        explanation: 'A complete professional answer in full English sentences is required to pass.',
      },
    };
  }

  // Calculate deterministic grammar & fluency ratios (0.0 to 1.0)
  const lengthScore = Math.min(1, wordCount / 28);
  const diversityScore = Math.min(1, lexicalDiversity / 0.62);
  const structureBonus = Math.min(0.25, connectorCount * 0.08 + (sentenceCount >= 2 ? 0.09 : 0));
  const errorPenalty = Math.min(0.45, errorCount * 0.12);

  const grammarRatio = Math.max(0.25, Math.min(1, lengthScore * 0.45 + diversityScore * 0.4 + structureBonus - errorPenalty));
  const fluencyRatio = Math.max(0.25, Math.min(1, lengthScore * 0.55 + diversityScore * 0.3 + structureBonus));

  return {
    wordCount,
    sentenceCount,
    lexicalDiversity,
    connectorCount,
    politeMarkersCount,
    isGibberishOrNonAnswer: false,
    grammarRatio,
    fluencyRatio,
    grammarCorrection,
  };
}

// ============================================================================
// 6. AUTOMATED SELF-OPERATING ANSWER EVALUATOR (ZERO GEMINI DEPENDENCY)
// ============================================================================
export function evaluateInterviewAnswerAutomated(params: {
  role: InterviewRoleId;
  level: InterviewLevel;
  question: QuestionBankItem;
  isFollowUp: boolean;
  questionText: string;
  answerText: string;
  rubric: RubricConfig;
}): {
  perQuestionScore: number;
  questionPassStatus: 'PASS' | 'FAIL';
  relevanceScore: number;
  rubricSubScores: {
    roleKnowledge: number;
    situationalJudgment: number;
    grammarVocab: number;
    clarityFluency: number;
    professionalismSafety: number;
  };
  feedback: string;
  strengths: string[];
  improvements: string[];
  grammarCorrection: { original: string; corrected: string; explanation: string } | null;
  modelAnswerExample: string;
  safetyFlagged: boolean;
  safetyReason?: string;
  needsFollowUp: boolean;
  generatedFollowUpQuestion: string;
} {
  const { role, level, question: rawQuestion, isFollowUp, questionText, answerText, rubric } = params;
  const question = enrichQuestionWithBackendGuidelines(rawQuestion);
  const levelRules = getLevelEvaluationCriteria(level);
  const safetyStatus = detectSafetyStatusAutomated(role, question, answerText);
  const langAnalysis = analyzeEnglishGrammarAndCommunication(answerText);

  const modelAnswerExample = question.modelAnswer || buildCuratedModelAnswer(question);
  const passThreshold = Math.max(levelRules.passingScoreThreshold, rubric.passThreshold || 70);

  // 1. Handle non-answers, gibberish, or ultra-short 1-2 word responses strictly (NEVER PASS)
  if (langAnalysis.isGibberishOrNonAnswer) {
    const rk = Math.min(3, rubric.roleKnowledgeWeight);
    const sj = Math.min(2, rubric.situationalJudgmentWeight);
    const gv = Math.min(3, rubric.grammarVocabWeight);
    const cf = Math.min(2, rubric.clarityFluencyWeight);
    const ps = safetyStatus.flagged ? 0 : Math.min(2, rubric.professionalismSafetyWeight);
    const total = rk + sj + gv + cf + ps;

    return {
      perQuestionScore: total,
      questionPassStatus: 'FAIL',
      relevanceScore: 5,
      rubricSubScores: {
        roleKnowledge: rk,
        situationalJudgment: sj,
        grammarVocab: gv,
        clarityFluency: cf,
        professionalismSafety: ps,
      },
      feedback: `Incomplete or insufficient response (${langAnalysis.wordCount} words). To pass ${levelRules.levelLabel}, you must directly address the question and explain: ${question.evaluatorLooksFor}`,
      strengths: ['Session response recorded'],
      improvements: [
        `Directly answer the question in at least ${levelRules.minWordCountPerAnswer}+ words`,
        `Cover the required key points: ${question.evaluatorLooksFor}`,
        'Use complete English sentences explaining what you would do and why',
      ],
      grammarCorrection: langAnalysis.grammarCorrection,
      modelAnswerExample,
      safetyFlagged: safetyStatus.flagged,
      safetyReason: safetyStatus.reason,
      needsFollowUp: !isFollowUp,
      generatedFollowUpQuestion: question.followUpPrompt,
    };
  }

  // 2. Evaluate Relevance & Concept Accuracy against Backend Guidelines
  const lowerAns = answerText.toLowerCase();

  // Extract meaningful tokens from evaluatorLooksFor + questionText + acceptableVariations
  const targetConceptPhrases = question.keyConcepts || [];
  const acceptableTerms = question.acceptableVariations || [];

  const criteriaWords = question.evaluatorLooksFor
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(w => w.length > 3 && !['with', 'from', 'that', 'this', 'what', 'when', 'where', 'which', 'their', 'would', 'should', 'could', 'about', 'into'].includes(w));

  const matchedCriteriaWords = criteriaWords.filter(kw => lowerAns.includes(kw));
  const matchedAcceptableTerms = acceptableTerms.filter(term => {
    const tokens = term.toLowerCase().split(/\s+/).filter(t => t.length > 3);
    if (tokens.length === 0) return lowerAns.includes(term.toLowerCase());
    return tokens.some(t => lowerAns.includes(t));
  });

  // Check which specific concept phrases were covered vs missed
  const coveredConcepts: string[] = [];
  const missingConcepts: string[] = [];

  for (const phrase of targetConceptPhrases) {
    const tokens = phrase
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length > 3);
    const isHit =
      tokens.some(t => lowerAns.includes(t)) ||
      Object.values(CONCEPT_SYNONYM_GROUPS).some(
        group => tokens.some(t => group.includes(t)) && group.some(syn => lowerAns.includes(syn))
      );
    if (isHit) {
      coveredConcepts.push(phrase);
    } else {
      missingConcepts.push(phrase);
    }
  }

  // Relevance & Knowledge Ratio (0.0 to 1.0)
  const conceptHitRatio =
    targetConceptPhrases.length > 0 ? coveredConcepts.length / targetConceptPhrases.length : 0.5;
  const keywordHitRatio =
    criteriaWords.length > 0
      ? Math.min(1, matchedCriteriaWords.length / Math.max(2, Math.ceil(criteriaWords.length * 0.45)))
      : 0.5;
  const variationBonus = Math.min(0.3, matchedAcceptableTerms.length * 0.06);
  const lengthAdequacy = Math.min(1, langAnalysis.wordCount / Math.max(12, levelRules.minWordCountPerAnswer));

  // For CEFR English open-ended questions (where answers are personal experiences/opinions),
  // relevance depends heavily on addressing the prompt topic + linguistic structure
  const questionTopicWords = questionText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 3 && !['what', 'when', 'where', 'which', 'would', 'could', 'should', 'explain', 'describe', 'tell', 'about', 'your'].includes(w));
  const matchedTopicWords = questionTopicWords.filter(tw => lowerAns.includes(tw));
  const topicRelevance =
    questionTopicWords.length > 0 ? Math.min(1, (matchedTopicWords.length + 1) / Math.max(2, questionTopicWords.length * 0.6)) : 0.75;

  let knowledgeRatio: number;
  if (question.category === 'english') {
    knowledgeRatio = Math.min(
      1,
      topicRelevance * 0.45 + langAnalysis.grammarRatio * 0.3 + lengthAdequacy * 0.25 + variationBonus * 0.5
    );
  } else {
    knowledgeRatio = Math.min(
      1,
      Math.max(conceptHitRatio, keywordHitRatio) * 0.6 + lengthAdequacy * 0.25 + variationBonus + (topicRelevance * 0.1)
    );
  }

  // If answer has zero overlap with both criteria and question topic and is very short, cap knowledgeRatio
  if (coveredConcepts.length === 0 && matchedCriteriaWords.length === 0 && matchedTopicWords.length === 0 && question.category === 'professional') {
    knowledgeRatio = Math.min(0.32, knowledgeRatio);
  }

  // Situational Judgment Ratio (0.0 to 1.0)
  const hasActionReasoning =
    langAnalysis.connectorCount >= 1 ||
    /\b(first|check|verify|ask|inform|apolog|ensure|isolate|test|confirm|escalate|report|clean|prepare|measure|explain)\b/i.test(lowerAns);
  const judgmentRatio = safetyStatus.flagged
    ? 0.2
    : Math.min(
        1,
        knowledgeRatio * 0.55 +
          lengthAdequacy * 0.25 +
          (hasActionReasoning ? 0.15 : 0) +
          Math.min(0.1, langAnalysis.politeMarkersCount * 0.04)
      );

  // Safety & Professionalism Ratio
  const safetyProfRatio = safetyStatus.flagged
    ? 0.15
    : Math.min(
        1,
        0.55 +
          knowledgeRatio * 0.25 +
          Math.min(0.2, langAnalysis.politeMarkersCount * 0.06) +
          (question.isSafetyCritical && coveredConcepts.length > 0 ? 0.1 : 0)
      );

  // Compute Rubric Sub-scores
  const rk = Math.min(rubric.roleKnowledgeWeight, Math.max(0, Math.round(rubric.roleKnowledgeWeight * knowledgeRatio)));
  const sj = Math.min(rubric.situationalJudgmentWeight, Math.max(0, Math.round(rubric.situationalJudgmentWeight * judgmentRatio)));
  const gv = Math.min(rubric.grammarVocabWeight, Math.max(0, Math.round(rubric.grammarVocabWeight * langAnalysis.grammarRatio)));
  const cf = Math.min(rubric.clarityFluencyWeight, Math.max(0, Math.round(rubric.clarityFluencyWeight * langAnalysis.fluencyRatio)));
  const ps = Math.min(
    rubric.professionalismSafetyWeight,
    Math.max(0, Math.round(rubric.professionalismSafetyWeight * safetyProfRatio))
  );

  const totalScore = Math.min(100, Math.max(0, rk + sj + gv + cf + ps));
  const relevanceScore = Math.round(knowledgeRatio * 100);
  const questionPassStatus: 'PASS' | 'FAIL' =
    !safetyStatus.flagged && totalScore >= passThreshold ? 'PASS' : 'FAIL';

  // Build specific strengths & actionable improvements
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (coveredConcepts.length > 0) {
    strengths.push(`Addressed key criteria: ${coveredConcepts.slice(0, 3).join(', ')}`);
  } else if (matchedTopicWords.length > 0) {
    strengths.push('Responded directly to the core scenario');
  }

  if (langAnalysis.wordCount >= levelRules.minWordCountPerAnswer) {
    strengths.push(`Provided a structured response (${langAnalysis.wordCount} words across ${langAnalysis.sentenceCount} sentence${langAnalysis.sentenceCount > 1 ? 's' : ''})`);
  }
  if (langAnalysis.grammarRatio >= 0.78) {
    strengths.push('Demonstrated clear English grammar and appropriate workplace vocabulary');
  }
  if (strengths.length === 0) {
    strengths.push('Attempted the interview question in English');
  }

  if (safetyStatus.flagged && safetyStatus.reason) {
    improvements.push(`CRITICAL SAFETY: ${safetyStatus.reason}`);
  }
  if (missingConcepts.length > 0) {
    improvements.push(`Include missing evaluation points: ${missingConcepts.slice(0, 3).join(', ')}`);
  }
  if (langAnalysis.wordCount < levelRules.minWordCountPerAnswer) {
    improvements.push(
      `Expand your explanation to at least ${levelRules.minWordCountPerAnswer}–${levelRules.minWordCountPerAnswer + 15} words with step-by-step detail`
    );
  }
  if (langAnalysis.grammarCorrection) {
    improvements.push(`Grammar & Phrasing: ${langAnalysis.grammarCorrection.explanation}`);
  }
  if (improvements.length === 0) {
    improvements.push('Continue using specific workplace examples and structured transition words');
  }

  const feedbackParts: string[] = [];
  if (safetyStatus.flagged) {
    feedbackParts.push(`FAIL — Safety Concern (${totalScore}/100): ${safetyStatus.reason}`);
  } else {
    feedbackParts.push(
      `Question Evaluation: ${questionPassStatus} (${totalScore}/100 · Pass Threshold: ${passThreshold}/100).`
    );
  }
  if (coveredConcepts.length > 0) {
    feedbackParts.push(`You effectively covered: ${coveredConcepts.join(', ')}.`);
  }
  if (missingConcepts.length > 0) {
    feedbackParts.push(`To improve your score, also explain: ${missingConcepts.join(', ')}.`);
  }

  return {
    perQuestionScore: totalScore,
    questionPassStatus,
    relevanceScore,
    rubricSubScores: {
      roleKnowledge: rk,
      situationalJudgment: sj,
      grammarVocab: gv,
      clarityFluency: cf,
      professionalismSafety: ps,
    },
    feedback: feedbackParts.join(' '),
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    grammarCorrection: langAnalysis.grammarCorrection,
    modelAnswerExample,
    safetyFlagged: safetyStatus.flagged,
    safetyReason: safetyStatus.reason,
    needsFollowUp: !isFollowUp && (langAnalysis.wordCount < levelRules.minWordCountPerAnswer || missingConcepts.length >= 2),
    generatedFollowUpQuestion: question.followUpPrompt,
  };
}

// ============================================================================
// 7. MULTILINGUAL SPEECH DETECTION & TRANSLATION ENGINE (ZERO GEMINI DEPENDENCY)
// ============================================================================
const BUILTIN_MULTILINGUAL_DICTIONARY: Array<{ pattern: RegExp; english: string; lang: string }> = [
  // Bengali (বাংলা) common interview phrases & vocabulary
  { pattern: /আমার নাম/g, english: 'My name is', lang: 'bn' },
  { pattern: /আমি প্রথমে|প্রথমে আমি/g, english: 'First, I', lang: 'bn' },
  { pattern: /আমি একজন/g, english: 'I am a', lang: 'bn' },
  { pattern: /আমি কাজ করি/g, english: 'I work', lang: 'bn' },
  { pattern: /অতিথিদের|অতিথি|গেস্ট|কাস্টমার|গ্রাহক/g, english: 'greet the guests', lang: 'bn' },
  { pattern: /হাসিমুখে স্বাগত জানাই|স্বাগতম জানাবো|শুভেচ্ছা জানাবো|স্বাগত জানাই/g, english: 'warmly with a smile and welcome them politely', lang: 'bn' },
  { pattern: /মেনু দেই|মেনু দিবো|মেনু/g, english: 'present the menu', lang: 'bn' },
  { pattern: /জল অফার করি|পানি অফার করি|পানি দেই/g, english: 'offer water', lang: 'bn' },
  { pattern: /খাবারের অ্যালার্জি সম্পর্কে জিজ্ঞাসা করি|অ্যালার্জি|এলার্জি/g, english: 'ask about food allergies and check official allergen information with the chef', lang: 'bn' },
  { pattern: /ক্ষমা চাইবো|দুঃখিত বলবো/g, english: 'apologize sincerely to the guest', lang: 'bn' },
  { pattern: /অর্ডার লিখে নিবো|অর্ডার রিপিট করবো/g, english: 'write down and repeat back the order to confirm accuracy', lang: 'bn' },
  { pattern: /রান্নাঘর|কিচেন|শেফ/g, english: 'coordinate with the kitchen and chef', lang: 'bn' },
  { pattern: /ম্যানেজার|সুপারভাইজার/g, english: 'inform the manager and supervisor', lang: 'bn' },
  { pattern: /বিদ্যুৎ বন্ধ করবো|আইসোলেট করবো|লকআউট ট্যাগআউট/g, english: 'isolate the power supply using Lockout Tagout (LOTO) and test before touch with a voltage tester', lang: 'bn' },
  { pattern: /নিরাপত্তা|সেফটি|পিপিই/g, english: 'follow safety procedures and wear required PPE', lang: 'bn' },
  { pattern: /পাইপ|প্লাম্বিং|পানি বন্ধ|লিক/g, english: 'isolate the main water supply valve, inspect the plumbing pipework, and perform a pressure leak test', lang: 'bn' },
  { pattern: /কফি|এসপ্রেসো|দুধ/g, english: 'dial in espresso extraction, calibrate the burr grinder, and steam milk cleanly', lang: 'bn' },

  // Hindi (हिन्दी) common interview phrases & vocabulary
  { pattern: /मेरा नाम/g, english: 'My name is', lang: 'hi' },
  { pattern: /सबसे पहले मैं|पहले मैं/g, english: 'First, I', lang: 'hi' },
  { pattern: /मैं एक/g, english: 'I am a', lang: 'hi' },
  { pattern: /मेहमानों का मुस्कान के साथ स्वागत करता हूँ|स्वागत करूंगा|नमस्ते/g, english: 'greet the guests warmly with a smile', lang: 'hi' },
  { pattern: /अपना परिचय देता हूँ/g, english: 'introduce myself politely', lang: 'hi' },
  { pattern: /मेनू देता हूँ|मेनू/g, english: 'present the menu and offer water', lang: 'hi' },
  { pattern: /खाने की एलर्जी के बारे में पूछता हूँ|एलर्जी/g, english: 'ask about food allergies and verify ingredients with the chef without guessing', lang: 'hi' },
  { pattern: /मेहमान|ग्राहक|कस्टमर/g, english: 'the guest', lang: 'hi' },
  { pattern: /माफी मांगूंगा|क्षमा/g, english: 'apologize sincerely to the guest', lang: 'hi' },
  { pattern: /ऑर्डर लिखूंगा|दोहराऊंगा/g, english: 'write down and repeat the order back to confirm accuracy', lang: 'hi' },
  { pattern: /सुरक्षा|सेफ्टी|बिजली बंद/g, english: 'perform safe isolation with Lockout Tagout (LOTO), wear PPE, and verify zero voltage with a proved tester', lang: 'hi' },

  // Spanish (Español) common interview phrases
  { pattern: /\b(primero saludo a los clientes con una sonrisa|primero saludo|saludo a los clientes)\b/gi, english: 'First, I greet the guests warmly with a smile', lang: 'es' },
  { pattern: /\b(con una sonrisa)\b/gi, english: 'with a smile', lang: 'es' },
  { pattern: /\b(me presento)\b/gi, english: 'introduce myself', lang: 'es' },
  { pattern: /\b(entrego el menú|presento el menú|doy el menú)\b/gi, english: 'present the menu', lang: 'es' },
  { pattern: /\b(ofrezco agua)\b/gi, english: 'offer water', lang: 'es' },
  { pattern: /\b(pregunto si tienen alergias alimentarias|pregunto por alergias|alergias alimentarias|alergia|alérgenos)\b/gi, english: 'ask if they have any food allergies and verify allergen ingredients with the kitchen', lang: 'es' },
  { pattern: /\b(hola|buenos días|buenas tardes)\b/gi, english: 'Hello, I greet the guest warmly', lang: 'es' },
  { pattern: /\b(mi nombre es|me llamo)\b/gi, english: 'my name is', lang: 'es' },
  { pattern: /\b(cliente|clientes|huésped|invitado)\b/gi, english: 'the guest', lang: 'es' },
  { pattern: /\b(pedir disculpas|disculparme|lo siento)\b/gi, english: 'apologize politely to the guest', lang: 'es' },
  { pattern: /\b(aislar|bloquear|etiquetar|sin tensión|multímetro)\b/gi, english: 'isolate the circuit with Lockout Tagout (LOTO) and verify zero energy with a multimeter', lang: 'es' },

  // Arabic (العربية) common interview phrases
  { pattern: /اسمي/g, english: 'My name is', lang: 'ar' },
  { pattern: /أرحب بالضيوف بابتسامة|أرحب|ترحيب/g, english: 'First, I greet the guests warmly with a smile', lang: 'ar' },
  { pattern: /أقدم القائمة|القائمة/g, english: 'present the menu and offer water', lang: 'ar' },
  { pattern: /الضيف|العميل|الزبون/g, english: 'the guest', lang: 'ar' },
  { pattern: /أعتذر|اعتذار/g, english: 'I apologize sincerely', lang: 'ar' },
  { pattern: /حساسية الطعام|حساسية/g, english: 'ask about food allergies and verify with the kitchen and official allergen guide', lang: 'ar' },
  { pattern: /فصل الكهرباء|عزل|الأمان/g, english: 'isolate the electrical supply, apply Lockout Tagout (LOTO), and test before touch', lang: 'ar' },

  // French (Français)
  { pattern: /\b(je m'appelle|mon nom est)\b/gi, english: 'My name is', lang: 'fr' },
  { pattern: /\b(j'accueille les clients avec le sourire|accueille)\b/gi, english: 'First, I greet the guests warmly with a smile', lang: 'fr' },
  { pattern: /\b(je présente le menu|menu)\b/gi, english: 'present the menu and offer water', lang: 'fr' },
  { pattern: /\b(client|invité)\b/gi, english: 'the guest', lang: 'fr' },
  { pattern: /\b(allergie|allergènes)\b/gi, english: 'ask about food allergies and check official allergen information with the chef', lang: 'fr' },
];

export function detectTextLanguage(text: string, hintLang?: string): { code: string; label: string; isEnglish: boolean } {
  const clean = text.trim();
  if (/[\u0980-\u09FF]/.test(clean)) return { code: 'bn', label: 'Bengali (বাংলা)', isEnglish: false };
  if (/[\u0900-\u097F]/.test(clean)) return { code: 'hi', label: 'Hindi / Devanagari', isEnglish: false };
  if (/[\u0600-\u06FF]/.test(clean)) return { code: 'ar', label: 'Arabic / Urdu', isEnglish: false };
  if (/[\u0400-\u04FF]/.test(clean)) return { code: 'ru', label: 'Russian (Русский)', isEnglish: false };

  // Check common Spanish/French/Portuguese/Tagalog markers even when hintLang is auto
  if (/\b(primero|saludo|clientes|sonrisa|entrego|menú|ofrezco|agua|pregunto|alergias|alimentarias|porque|cocina|trabajo|seguridad)\b/i.test(clean)) {
    return { code: 'es', label: 'Spanish (Español)', isEnglish: false };
  }
  if (/\b(j'accueille|clients|sourire|présente|sécurité|cuisine|travail|allergènes)\b/i.test(clean)) {
    return { code: 'fr', label: 'French (Français)', isEnglish: false };
  }

  if (hintLang && !hintLang.startsWith('en') && hintLang !== 'auto') {
    const found = SUPPORTED_SPOKEN_LANGUAGES.find(
      l => l.code === hintLang || l.bcp47.toLowerCase() === hintLang.toLowerCase()
    );
    if (found) {
      return { code: found.code, label: found.label, isEnglish: false };
    }
  }

  return { code: 'en', label: 'English', isEnglish: true };
}

export async function translateAndNormalizeSpokenAnswer(
  rawText: string,
  spokenLanguageHint = 'auto'
): Promise<{
  originalTranscript: string;
  englishTranslation: string;
  detectedLanguage: string;
  detectedLanguageLabel: string;
  wasTranslated: boolean;
}> {
  const clean = String(rawText || '').trim();
  if (!clean) {
    return {
      originalTranscript: '',
      englishTranslation: '',
      detectedLanguage: 'en',
      detectedLanguageLabel: 'English',
      wasTranslated: false,
    };
  }

  const detected = detectTextLanguage(clean, spokenLanguageHint);
  if (detected.isEnglish) {
    let normalized = clean.replace(/\s+/g, ' ');
    if (/^[a-z]/.test(normalized)) {
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }
    if (!/[.!?]$/.test(normalized)) {
      normalized += '.';
    }
    return {
      originalTranscript: clean,
      englishTranslation: normalized,
      detectedLanguage: 'en',
      detectedLanguageLabel: 'English',
      wasTranslated: false,
    };
  }

  // Layer 1: Try public Google Translate HTTP endpoint (requires no API key)
  try {
    const sl = detected.code === 'auto' ? 'auto' : detected.code.split('-')[0];
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sl
    )}&tl=en&dt=t&q=${encodeURIComponent(clean)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      const json: any = await resp.json();
      if (Array.isArray(json?.[0])) {
        const translatedParts = json[0].map((segment: any) => segment?.[0] || '').join(' ').trim();
        if (translatedParts && translatedParts.toLowerCase() !== clean.toLowerCase()) {
          return {
            originalTranscript: clean,
            englishTranslation: translatedParts,
            detectedLanguage: detected.code,
            detectedLanguageLabel: detected.label,
            wasTranslated: true,
          };
        }
      }
    }
  } catch {
    // Fallback to Layer 2 deterministic built-in dictionary translator
  }

  // Layer 2: Deterministic offline dictionary & phrase synthesizer
  const matchedPhrases: string[] = [];
  for (const entry of BUILTIN_MULTILINGUAL_DICTIONARY) {
    const regex = new RegExp(entry.pattern.source, entry.pattern.flags);
    if (regex.test(clean)) {
      if (!matchedPhrases.includes(entry.english)) {
        matchedPhrases.push(entry.english);
      }
    }
  }

  if (matchedPhrases.length > 0) {
    let synthesized = matchedPhrases.join(', ');
    synthesized = synthesized.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    if (/^[a-z]/.test(synthesized)) {
      synthesized = synthesized.charAt(0).toUpperCase() + synthesized.slice(1);
    }
    if (!/[.!?]$/.test(synthesized)) {
      synthesized += '.';
    }
    return {
      originalTranscript: clean,
      englishTranslation: synthesized,
      detectedLanguage: detected.code,
      detectedLanguageLabel: detected.label,
      wasTranslated: true,
    };
  }

  return {
    originalTranscript: clean,
    englishTranslation: clean,
    detectedLanguage: detected.code,
    detectedLanguageLabel: detected.label,
    wasTranslated: true,
  };
}


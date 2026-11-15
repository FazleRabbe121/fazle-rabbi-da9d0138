import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Volume2,
  Mic,
  Square,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Download,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  FileText,
  Award,
  RefreshCw,
} from 'lucide-react';
import {
  EnglishExamMetrics,
  EnglishExamResultPayload,
  InterviewAttemptRecord,
} from '../types/interviewCenter';
import {
  submitCompleteEnglishExam,
  transcribeSpokenAudioWithGemini,
} from '../services/interviewCenterService';
import {
  CertificatePreselection,
  mapAttemptToCertificatePreselection,
} from '../services/certificateService';

export interface ExamQuestionItem {
  levelIndex: number; // 0=A1 .. 5=C2
  skill: 'Grammar' | 'Vocabulary' | 'Reading' | 'Listening';
  question: string;
  options: [string, string, string, string]; // index 0 is always the correct answer in source bank
  extra?: {
    p?: string;
    say?: string;
  };
}

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export const EXAM_LEVEL_DESCRIPTIONS: Record<string, string> = {
  'Below A1': 'Starter: begin with basic words and simple sentences.',
  A1: 'Beginner: you understand very basic phrases.',
  A2: 'Elementary: you can handle simple everyday conversations.',
  B1: 'Intermediate: you can discuss familiar topics and write simply.',
  B2: 'Upper-Intermediate: confident, effective English for work.',
  C1: 'Advanced: fluent and precise on complex topics.',
  C2: 'Proficient: near-native command of English.',
};

export const SPEAKING_PROMPTS: string[] = [
  'Introduce yourself: your name, your job and where you work.',
  'Describe a typical day at work, from start to finish.',
  'Some people prefer working alone, others prefer a team. Which do you prefer, and why?',
];

export const WRITING_PROMPT =
  'Write 100 to 150 words: Describe your job and your goals for the next five years.';

export const ENGLISH_EXAM_QUESTIONS: ExamQuestionItem[] = [
  {
    levelIndex: 0,
    skill: 'Grammar',
    question: 'She ___ a teacher.',
    options: ['is', 'are', 'am', 'be'],
  },
  {
    levelIndex: 0,
    skill: 'Grammar',
    question: 'I ___ coffee every morning.',
    options: ['drink', 'drinks', 'drinking', 'drunk'],
  },
  {
    levelIndex: 0,
    skill: 'Vocabulary',
    question: 'The opposite of “big” is ___.',
    options: ['small', 'long', 'tall', 'heavy'],
  },
  {
    levelIndex: 0,
    skill: 'Grammar',
    question: 'There ___ two books on the table.',
    options: ['are', 'is', 'am', 'be'],
  },
  {
    levelIndex: 0,
    skill: 'Listening',
    question: 'How old is Anna?',
    options: ['20', '18', '22', '12'],
    extra: { say: 'My name is Anna. I am twenty years old. I live in London.' },
  },
  {
    levelIndex: 1,
    skill: 'Grammar',
    question: 'Yesterday I ___ to the market.',
    options: ['went', 'go', 'goes', 'gone'],
  },
  {
    levelIndex: 1,
    skill: 'Grammar',
    question: 'He is taller ___ his brother.',
    options: ['than', 'then', 'that', 'as'],
  },
  {
    levelIndex: 1,
    skill: 'Vocabulary',
    question: 'I need to ___ a ticket for the train.',
    options: ['buy', 'do', 'speak', 'wear'],
  },
  {
    levelIndex: 1,
    skill: 'Reading',
    question: 'Why does Tom walk to work?',
    options: ['The bus is expensive', 'He likes football', 'He starts at 5 p.m.', 'He has no job'],
    extra: {
      p: 'Tom gets up at 6 a.m. He walks to work because the bus is expensive. He finishes at 5 p.m. and plays football with friends.',
    },
  },
  {
    levelIndex: 1,
    skill: 'Listening',
    question: 'When is the meeting?',
    options: ['Thursday at 3:30', 'Wednesday at 3:30', 'Thursday at 2:30', 'Wednesday at 3:00'],
    extra: { say: 'The meeting is on Thursday at half past three, not Wednesday.' },
  },
  {
    levelIndex: 2,
    skill: 'Grammar',
    question: 'If it rains tomorrow, we ___ at home.',
    options: ['will stay', 'would stay', 'stayed', 'stay'],
  },
  {
    levelIndex: 2,
    skill: 'Grammar',
    question: 'I have lived here ___ 2015.',
    options: ['since', 'for', 'from', 'during'],
  },
  {
    levelIndex: 2,
    skill: 'Vocabulary',
    question: 'She was very ___ when she heard the good news.',
    options: ['excited', 'exciting', 'excite', 'excitement'],
  },
  {
    levelIndex: 2,
    skill: 'Reading',
    question: 'What is one disadvantage of working from home?',
    options: ['Workers may feel lonely', 'It costs more time', 'Pay is lower', 'Offices close'],
    extra: {
      p: 'Many people now work from home. This saves commuting time, but some workers feel lonely and find it hard to separate work from personal life.',
    },
  },
  {
    levelIndex: 2,
    skill: 'Listening',
    question: 'Why didn’t the speaker call earlier?',
    options: ['The phone battery died', 'He forgot', 'He was busy', 'He had no number'],
    extra: { say: 'I’d have called you earlier, but my phone battery died.' },
  },
  {
    levelIndex: 3,
    skill: 'Grammar',
    question: 'I wish I ___ more time to prepare yesterday.',
    options: ['had had', 'have', 'would have', 'had'],
  },
  {
    levelIndex: 3,
    skill: 'Grammar',
    question: 'By the time we arrived, the film ___.',
    options: [
      'had already started',
      'already started',
      'has already started',
      'was already starting',
    ],
  },
  {
    levelIndex: 3,
    skill: 'Vocabulary',
    question: 'The company decided to ___ the project due to lack of funding.',
    options: ['abandon', 'abolish', 'abstain', 'absorb'],
  },
  {
    levelIndex: 3,
    skill: 'Reading',
    question: 'Who criticised the policy, and why?',
    options: [
      'Small businesses, fearing high costs',
      'Environmental groups, saying it was weak',
      'Consumers, fearing higher prices',
      'The government, over delays',
    ],
    extra: {
      p: 'Although the new policy was welcomed by environmental groups, it drew criticism from small businesses, who argued that compliance costs would outweigh any long-term benefits.',
    },
  },
  {
    levelIndex: 3,
    skill: 'Grammar',
    question: 'She suggested ___ a taxi to avoid the traffic.',
    options: ['taking', 'to take', 'take', 'took'],
  },
  {
    levelIndex: 4,
    skill: 'Grammar',
    question: 'Not only ___ late, but he also forgot the documents.',
    options: ['did he arrive', 'he arrived', 'he did arrive', 'arrived he'],
  },
  {
    levelIndex: 4,
    skill: 'Vocabulary',
    question: 'His speech was so ___ that nobody could understand the main point.',
    options: ['convoluted', 'concise', 'lucid', 'explicit'],
  },
  {
    levelIndex: 4,
    skill: 'Grammar',
    question: 'Had I known about the delay, I ___ earlier.',
    options: ['would have left', 'would leave', 'will have left', 'had left'],
  },
  {
    levelIndex: 4,
    skill: 'Reading',
    question: 'What does the writer suggest about the author’s prose?',
    options: [
      'It seems simple but hides irony',
      'It is plainly written and shallow',
      'It is full of obvious jokes',
      'It is difficult to read at all',
    ],
    extra: {
      p: 'The author’s prose, while ostensibly straightforward, conceals layers of irony that only emerge upon rereading.',
    },
  },
  {
    levelIndex: 4,
    skill: 'Listening',
    question: 'What happened to the proposal?',
    options: ['It was approved narrowly', 'It was rejected', 'It was postponed', 'It was withdrawn'],
    extra: {
      say: 'Notwithstanding the committee’s reservations, the proposal was ratified by a narrow margin.',
    },
  },
  {
    levelIndex: 5,
    skill: 'Vocabulary',
    question:
      'The politician’s remarks were deliberately ___, leaving room for multiple interpretations.',
    options: ['equivocal', 'emphatic', 'candid', 'vehement'],
  },
  {
    levelIndex: 5,
    skill: 'Grammar',
    question: 'Scarcely ___ the door when the phone began to ring.',
    options: ['had she opened', 'she had opened', 'did she open', 'she opened'],
  },
  {
    levelIndex: 5,
    skill: 'Vocabulary',
    question:
      'The new rules have had a ___ effect on small manufacturers, gradually undermining their viability.',
    options: ['pernicious', 'propitious', 'perfunctory', 'peripheral'],
  },
  {
    levelIndex: 5,
    skill: 'Reading',
    question: 'What does the writer claim about the metaphor?',
    options: [
      'It is essential to the argument’s structure',
      'It is merely decorative',
      'It is confusing to readers',
      'It is borrowed from another poet',
    ],
    extra: {
      p: 'Far from being a mere ornament, the metaphor in her poem serves as the load-bearing structure of the entire argument.',
    },
  },
  {
    levelIndex: 5,
    skill: 'Grammar',
    question: 'Were it not for her intervention, the negotiations ___ collapsed.',
    options: ['would have', 'will have', 'had', 'would'],
  },
];

interface ShuffledOption {
  text: string;
  isCorrect: boolean;
}

interface SpeakingRecordState {
  blobUrl?: string;
  durationSec: number;
  transcript: string;
  statusText: string;
  isTranscribing?: boolean;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function countWords(text: string): number {
  return (text.trim().match(/\S+/g) || []).length;
}

export function calculateExamMetrics(
  text: string,
  durationSec: number,
  sentenceCount: number
): EnglishExamMetrics {
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  const n = words.length;
  if (n < 15) {
    return {
      words: n,
      band: n ? 'Insufficient' : 'No data',
    };
  }
  const uniqueRatio = new Set(words).size / n;
  const avgLength = words.join('').length / n;
  const wpm = durationSec ? Math.round((n / durationSec) * 60) : null;
  const points =
    (uniqueRatio > 0.65 ? 2 : uniqueRatio > 0.5 ? 1 : 0) +
    (avgLength > 4.7 ? 2 : avgLength > 4.1 ? 1 : 0) +
    (durationSec
      ? wpm !== null && wpm >= 100
        ? 2
        : wpm !== null && wpm >= 65
        ? 1
        : 0
      : n / Math.max(1, sentenceCount) > 16
      ? 2
      : n / Math.max(1, sentenceCount) > 9
      ? 1
      : 0);

  return {
    words: n,
    wpm,
    lexicalVariety: Number(uniqueRatio.toFixed(2)),
    avgWordLength: Number(avgLength.toFixed(1)),
    band: points <= 1 ? 'A2 or below' : points <= 3 ? 'B1' : points <= 5 ? 'B2' : 'C1+',
  };
}

interface EnglishLevelExamModuleProps {
  participantName: string;
  participantEmail: string;
  isAdminPreview?: boolean;
  onExamSaved?: (attempt: InterviewAttemptRecord) => void;
  onRevokedAccess?: (reason?: string) => void;
  onGetCertificate?: (pre: CertificatePreselection) => void;
}

export const EnglishLevelExamModule: React.FC<EnglishLevelExamModuleProps> = ({
  participantName,
  participantEmail,
  isAdminPreview = false,
  onExamSaved,
  onRevokedAccess,
  onGetCertificate,
}) => {
  const totalQuestions = ENGLISH_EXAM_QUESTIONS.length;
  const timeLimitMin = 45;

  const [step, setStep] = useState<'start' | 'questions' | 'speaking' | 'writing' | 'results'>('start');
  const [candidateName, setCandidateName] = useState(participantName || '');
  const [candidateEmail, setCandidateEmail] = useState(participantEmail || '');
  const [formError, setFormError] = useState<string | null>(null);

  const [shuffledOptions, setShuffledOptions] = useState<ShuffledOption[][]>([]);
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [skipConfirmPending, setSkipConfirmPending] = useState(false);

  const [startTimeMs, setStartTimeMs] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(timeLimitMin * 60);

  // Speaking state
  const [speakingRecords, setSpeakingRecords] = useState<Record<number, SpeakingRecordState>>({});
  const [activeRecTask, setActiveRecTask] = useState<number | null>(null);
  const [recElapsedSec, setRecElapsedSec] = useState<number>(0);

  // Writing state
  const [writingText, setWritingText] = useState('');
  const [shortWritingConfirmPending, setShortWritingConfirmPending] = useState(false);

  // Results & Server Sync state
  const [examResult, setExamResult] = useState<EnglishExamResultPayload | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [savedAttempt, setSavedAttempt] = useState<InterviewAttemptRecord | null>(null);

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechRecRef = useRef<any>(null);
  const recStartRef = useRef<number>(0);
  const recIntervalRef = useRef<any>(null);
  const isFinishedRef = useRef<boolean>(false);

  useEffect(() => {
    if (participantName && !candidateName) setCandidateName(participantName);
    if (participantEmail && !candidateEmail) setCandidateEmail(participantEmail);
  }, [participantName, participantEmail]);

  // Cleanup microphone on unmount
  useEffect(() => {
    return () => {
      stopActiveRecording();
    };
  }, []);

  // 45-minute countdown timer
  useEffect(() => {
    if (step === 'start' || step === 'results' || !startTimeMs) return;
    const interval = setInterval(() => {
      const remaining = timeLimitMin * 60 - Math.floor((Date.now() - startTimeMs) / 1000);
      if (remaining <= 0) {
        clearInterval(interval);
        setSecondsLeft(0);
        handleFinishExam(true);
      } else {
        setSecondsLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [step, startTimeMs]);

  const stopActiveRecording = () => {
    if (recIntervalRef.current) {
      clearInterval(recIntervalRef.current);
      recIntervalRef.current = null;
    }
    try {
      if (speechRecRef.current) {
        speechRecRef.current.onend = null;
        speechRecRef.current.stop();
        speechRecRef.current = null;
      }
    } catch {}
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
    } catch {}
    setActiveRecTask(null);
  };

  const handleStartExam = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = candidateName.trim();
    if (!cleanName) {
      setFormError('Please enter your full name before starting the exam.');
      return;
    }
    setFormError(null);
    isFinishedRef.current = false;

    const preparedOptions = ENGLISH_EXAM_QUESTIONS.map(q =>
      shuffleArray(
        q.options.map((optText, idx) => ({
          text: optText,
          isCorrect: idx === 0,
        }))
      )
    );

    setShuffledOptions(preparedOptions);
    setAnswers(new Array(totalQuestions).fill(undefined));
    setCurrentQIndex(0);
    setSpeakingRecords({});
    setWritingText('');
    setExamResult(null);
    setSavedAttempt(null);
    setSyncStatus('idle');
    setSyncMessage('');
    setStartTimeMs(Date.now());
    setSecondsLeft(timeLimitMin * 60);
    setStep('questions');
  };

  const handleSelectOption = (optionIndex: number) => {
    setSkipConfirmPending(false);
    setAnswers(prev => {
      const next = [...prev];
      next[currentQIndex] = optionIndex;
      return next;
    });
  };

  const handleNextQuestion = () => {
    if (answers[currentQIndex] === undefined && !skipConfirmPending) {
      setSkipConfirmPending(true);
      return;
    }
    setSkipConfirmPending(false);
    if (currentQIndex < totalQuestions - 1) {
      setCurrentQIndex(prev => prev + 1);
    } else {
      setStep('speaking');
    }
  };

  const handlePrevQuestion = () => {
    setSkipConfirmPending(false);
    if (currentQIndex > 0) {
      setCurrentQIndex(prev => prev - 1);
    }
  };

  const toggleRecordingTask = async (taskIndex: number) => {
    if (activeRecTask === taskIndex) {
      stopActiveRecording();
      return;
    }
    if (activeRecTask !== null) {
      stopActiveRecording();
    }

    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setSpeakingRecords(prev => ({
        ...prev,
        [taskIndex]: {
          durationSec: 0,
          transcript: prev[taskIndex]?.transcript || '',
          statusText: 'Recording is not supported in this browser. Use Chrome, Edge or Safari.',
        },
      }));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const chunks: Blob[] = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      let liveTranscript = '';
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      let srInstance: any = null;
      let isStopped = false;

      if (SR) {
        try {
          srInstance = new SR();
          srInstance.lang = 'en-US';
          srInstance.continuous = true;
          srInstance.interimResults = false;
          srInstance.onresult = (ev: any) => {
            for (let j = ev.resultIndex; j < ev.results.length; j++) {
              if (ev.results[j].isFinal) {
                liveTranscript += ev.results[j][0].transcript + ' ';
              }
            }
          };
          srInstance.onend = () => {
            if (!isStopped) {
              try {
                srInstance.start();
              } catch {}
            }
          };
          srInstance.start();
          speechRecRef.current = srInstance;
        } catch {
          srInstance = null;
        }
      }

      recorder.ondataavailable = ev => {
        if (ev.data && ev.data.size > 0) {
          chunks.push(ev.data);
        }
      };

      const startedAt = Date.now();
      recStartRef.current = startedAt;
      setRecElapsedSec(0);
      setActiveRecTask(taskIndex);

      recIntervalRef.current = setInterval(() => {
        setRecElapsedSec(Math.round((Date.now() - startedAt) / 1000));
      }, 500);

      recorder.onstop = async () => {
        isStopped = true;
        stream.getTracks().forEach(t => t.stop());
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const blobUrl = URL.createObjectURL(blob);
        const browserText = liveTranscript.trim();

        setSpeakingRecords(prev => ({
          ...prev,
          [taskIndex]: {
            blobUrl,
            durationSec,
            transcript: browserText,
            statusText: `Saved (${durationSec}s)`,
            isTranscribing: !browserText,
          },
        }));

        // If browser SpeechRecognition didn't capture text (or isn't supported), use Gemini 3.5 Transcribe
        if (!browserText && blob.size > 0) {
          try {
            const base64Audio = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(String(reader.result || ''));
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            const transRes = await transcribeSpokenAudioWithGemini(
              base64Audio,
              recorder.mimeType || 'audio/webm',
              isAdminPreview
            );
            if (transRes.transcript) {
              setSpeakingRecords(prev => ({
                ...prev,
                [taskIndex]: {
                  ...prev[taskIndex],
                  transcript: transRes.transcript.trim(),
                  isTranscribing: false,
                },
              }));
              return;
            }
          } catch (err: any) {
            if (err?.status === 401 || err?.status === 403 || err?.revoked) {
              onRevokedAccess?.(err?.message);
              return;
            }
          }
        }

        setSpeakingRecords(prev => ({
          ...prev,
          [taskIndex]: {
            ...prev[taskIndex],
            isTranscribing: false,
          },
        }));
      };

      recorder.start(500);
    } catch {
      setSpeakingRecords(prev => ({
        ...prev,
        [taskIndex]: {
          durationSec: 0,
          transcript: prev[taskIndex]?.transcript || '',
          statusText: 'Microphone blocked. Allow microphone access in the browser and try again.',
        },
      }));
    }
  };

  const handleFinishExam = async (timedOut: boolean) => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    stopActiveRecording();

    const levelScores = [0, 0, 0, 0, 0, 0];
    const skillTotals: Record<string, [number, number]> = {};
    const incorrectItems: EnglishExamResultPayload['incorrectAnswers'] = [];

    ENGLISH_EXAM_QUESTIONS.forEach((q, idx) => {
      const selectedIdx = answers[idx];
      const opts = shuffledOptions[idx] || [];
      const isOk = selectedIdx !== undefined && Boolean(opts[selectedIdx]?.isCorrect);

      if (!skillTotals[q.skill]) {
        skillTotals[q.skill] = [0, 0];
      }
      skillTotals[q.skill][1]++;

      if (isOk) {
        levelScores[q.levelIndex]++;
        skillTotals[q.skill][0]++;
      } else {
        incorrectItems.push({
          n: idx + 1,
          type: q.skill,
          q: q.question,
          yours: selectedIdx === undefined ? 'No answer' : opts[selectedIdx]?.text || 'No answer',
          correct: q.options[0],
        });
      }
    });

    // CEFR Climbing Rule from app.js: >= 3/5 at each level from A1 to C2
    let highestPassedIndex = -1;
    for (let i = 0; i < 6; i++) {
      if (levelScores[i] >= 3) {
        highestPassedIndex = i;
      } else {
        break;
      }
    }

    const totalCorrect = levelScores.reduce((a, b) => a + b, 0);
    const achievedLevel = highestPassedIndex < 0 ? 'Below A1' : CEFR_LEVELS[highestPassedIndex];

    const byLevel: Record<string, string> = {};
    CEFR_LEVELS.forEach((lvl, i) => {
      byLevel[lvl] = `${levelScores[i]}/5`;
    });

    const bySkill: Record<string, string> = {};
    Object.keys(skillTotals).forEach(sk => {
      bySkill[sk] = `${skillTotals[sk][0]}/${skillTotals[sk][1]}`;
    });

    const speakingPayload = SPEAKING_PROMPTS.map((promptText, k) => {
      const rec = speakingRecords[k];
      if (rec && (rec.durationSec > 0 || rec.transcript.trim())) {
        return {
          prompt: promptText,
          seconds: rec.durationSec,
          transcript: rec.transcript.trim(),
          metrics: calculateExamMetrics(rec.transcript, rec.durationSec, 1),
        };
      }
      return {
        prompt: promptText,
        seconds: 0,
        transcript: '',
        metrics: { words: 0, band: 'Not attempted' },
      };
    });

    const sentenceCount = (writingText.match(/[.!?]+/g) || []).length || 1;
    const writingMetrics = calculateExamMetrics(writingText, 0, sentenceCount);
    const durationSec = startTimeMs ? Math.max(1, Math.round((Date.now() - startTimeMs) / 1000)) : 60;

    const resultPayload: EnglishExamResultPayload = {
      candidate: {
        name: candidateName.trim() || participantName || 'Participant',
        email: candidateEmail.trim() || participantEmail || '',
        ref: '',
      },
      submittedAt: new Date().toISOString(),
      timedOut,
      durationSec,
      objective: {
        level: achievedLevel,
        score: totalCorrect,
        total: totalQuestions,
        byLevel,
        bySkill,
      },
      speaking: speakingPayload,
      writing: {
        text: writingText,
        words: countWords(writingText),
        metrics: writingMetrics,
      },
      incorrectAnswers: incorrectItems,
      examinerReview: 'pending',
    };

    setExamResult(resultPayload);
    setStep('results');
    setSyncStatus('saving');
    setSyncMessage('Sending result to server…');

    try {
      const response = await submitCompleteEnglishExam(resultPayload, isAdminPreview);
      setSyncStatus('saved');
      setSyncMessage('Result saved to your Interview Center history & Admin Control Panel.');
      setSavedAttempt(response.attempt);
      onExamSaved?.(response.attempt);
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403 || err?.revoked) {
        onRevokedAccess?.(err?.message);
        return;
      }
      setSyncStatus('error');
      setSyncMessage(
        err?.message || 'Could not send to the server. Please download the JSON result below.'
      );
    }
  };

  const handleDownloadJson = () => {
    if (!examResult) return;
    const blob = new Blob([JSON.stringify(examResult, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const safeName = (examResult.candidate.name || 'candidate').replace(/\W+/g, '-');
    a.download = `english-exam-${safeName}.json`;
    a.click();
  };

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const progressPercentage = (() => {
    if (step === 'start') return 0;
    if (step === 'questions') return Math.round((currentQIndex / (totalQuestions + 2)) * 100);
    if (step === 'speaking') return Math.round((totalQuestions / (totalQuestions + 2)) * 100);
    if (step === 'writing') return Math.round(((totalQuestions + 1) / (totalQuestions + 2)) * 100);
    return 100;
  })();

  return (
    <div className="space-y-6">
      {/* Top Exam Header Bar */}
      <div className="p-5 rounded-2xl bg-[#111624] border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                English Assessment Center — CEFR Level Exam (A1 to C2)
              </h2>
              <p className="text-xs text-slate-400">
                30 Objective Questions (Grammar, Vocabulary, Reading, Listening) + 3 Speaking Tasks + 1 Writing Task
              </p>
            </div>
          </div>

          {step !== 'start' && step !== 'results' && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0b0f1a] border border-slate-800 text-xs font-mono tabular-nums">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-slate-400">Time left</span>
              <span className={secondsLeft < 300 ? 'text-rose-400 font-bold' : 'text-white font-bold'}>
                {formatClock(secondsLeft)}
              </span>
            </div>
          )}
        </div>

        {step !== 'start' && (
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        )}
      </div>

      {/* STEP 1: START SCREEN */}
      {step === 'start' && (
        <div className="p-6 sm:p-8 rounded-2xl bg-[#111624] border border-slate-800 max-w-3xl mx-auto space-y-6">
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30">
              Complete CEFR Placement & Proficiency Exam
            </span>
            <h3 className="text-2xl font-bold text-white pt-1">English Level Exam (CEFR A1 to C2)</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              This exam checks your English from beginner (A1) to proficient (C2).
            </p>
          </div>

          <ul className="space-y-2 text-xs text-slate-300 bg-[#0b0f1a] border border-slate-800 rounded-xl p-4">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>
                <strong className="text-white">30 questions:</strong> grammar, vocabulary, reading and listening (5 per CEFR level A1–C2)
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>
                <strong className="text-white">3 short speaking tasks</strong> (microphone required)
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>
                <strong className="text-white">1 short writing task</strong> (100–150 words)
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>
                <strong className="text-white">Time limit:</strong> 45 minutes · Climbing rule: score at least 3/5 at a level to advance to the next CEFR band
              </span>
            </li>
          </ul>

          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
              {formError}
            </div>
          )}

          <form onSubmit={handleStartExam} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full name *
                </label>
                <input
                  type="text"
                  required
                  value={candidateName}
                  onChange={e => setCandidateName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#070a12] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email (Approved Participant)
                </label>
                <input
                  type="email"
                  value={candidateEmail}
                  onChange={e => setCandidateEmail(e.target.value)}
                  placeholder="participant@gmail.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#070a12] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer"
              >
                Start exam
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: 30 OBJECTIVE QUESTIONS */}
      {step === 'questions' && shuffledOptions.length === totalQuestions && (
        <div className="p-6 sm:p-8 rounded-2xl bg-[#111624] border border-slate-800 max-w-3xl mx-auto space-y-6">
          {(() => {
            const q = ENGLISH_EXAM_QUESTIONS[currentQIndex];
            const opts = shuffledOptions[currentQIndex] || [];
            const selectedOpt = answers[currentQIndex];
            const cefrBand = CEFR_LEVELS[q.levelIndex];

            return (
              <>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    Question <strong className="text-white">{currentQIndex + 1}</strong> of {totalQuestions} ·{' '}
                    <span className="text-blue-400 font-semibold">{q.skill}</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px]">
                    Level {cefrBand}
                  </span>
                </div>

                {/* Reading Passage */}
                {q.extra?.p && (
                  <blockquote className="p-4 rounded-xl bg-[#0b0f1a] border-l-4 border-blue-500 text-sm text-slate-200 leading-relaxed">
                    {q.extra.p}
                  </blockquote>
                )}

                {/* Listening Audio Player */}
                {q.extra?.say && (
                  <div className="p-4 rounded-xl bg-[#0b0f1a] border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                      <Volume2 className="w-4 h-4" />
                      <span>Listening Audio Clip (Question {currentQIndex + 1})</span>
                    </div>
                    <audio
                      key={`audio-q-${currentQIndex}`}
                      controls
                      preload="auto"
                      src={`/english-exam/assets/audio/q${currentQIndex}.wav`}
                      className="w-full mt-1"
                    />
                    <div className="text-[11px] text-slate-400">
                      You can play the audio as many times as you need.
                    </div>
                  </div>
                )}

                <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">{q.question}</h3>

                <div className="space-y-2.5">
                  {opts.map((opt, k) => {
                    const isChecked = selectedOpt === k;
                    return (
                      <label
                        key={k}
                        onClick={() => handleSelectOption(k)}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm transition cursor-pointer ${
                          isChecked
                            ? 'bg-blue-600/15 border-blue-500 text-white font-semibold'
                            : 'bg-[#0b0f1a] border-slate-800 hover:border-slate-700 text-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`exam-q-${currentQIndex}`}
                          checked={isChecked}
                          onChange={() => handleSelectOption(k)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>{opt.text}</span>
                      </label>
                    );
                  })}
                </div>

                {skipConfirmPending && (
                  <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-4">
                    <span>You have not selected an answer for this question. Skip this question?</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSkipConfirmPending(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
                      >
                        Stay
                      </button>
                      <button
                        type="button"
                        onClick={handleNextQuestion}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                      >
                        Yes, Skip
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    disabled={currentQIndex === 0}
                    onClick={handlePrevQuestion}
                    className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 disabled:opacity-40 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <span>
                      {currentQIndex === totalQuestions - 1 ? 'Continue to Speaking' : 'Next'}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* STEP 3: SPEAKING TASKS (3 PROMPTS) */}
      {step === 'speaking' && (
        <div className="p-6 sm:p-8 rounded-2xl bg-[#111624] border border-slate-800 max-w-3xl mx-auto space-y-6">
          <div>
            <h3 className="text-xl font-bold text-white">Speaking (3 Tasks)</h3>
            <p className="text-xs text-slate-400 mt-1">
              Press Record, speak for at least 30 seconds, then press Stop. Allow microphone access when asked. You can re-record any task.
            </p>
          </div>

          <div className="space-y-4">
            {SPEAKING_PROMPTS.map((promptText, k) => {
              const isRecThis = activeRecTask === k;
              const recState = speakingRecords[k];
              return (
                <div
                  key={k}
                  className="p-4 rounded-xl bg-[#0b0f1a] border border-slate-800 space-y-3"
                >
                  <div className="text-sm text-white">
                    <strong className="text-blue-400">Task {k + 1}.</strong> {promptText}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleRecordingTask(k)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                        isRecThis
                          ? 'bg-rose-600 hover:bg-rose-500 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/40'
                      }`}
                    >
                      {isRecThis ? (
                        <>
                          <Square className="w-3.5 h-3.5" />
                          <span>■ Stop</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          <span>{recState?.blobUrl ? '● Re-record' : '● Record'}</span>
                        </>
                      )}
                    </button>

                    <span className="text-xs text-slate-400 font-mono">
                      {isRecThis
                        ? `Recording… ${recElapsedSec}s`
                        : recState?.isTranscribing
                        ? 'Transcribing audio with Gemini…'
                        : recState?.statusText || ''}
                    </span>
                  </div>

                  {recState?.blobUrl && (
                    <audio controls src={recState.blobUrl} className="w-full mt-2" />
                  )}

                  {recState && !isRecThis && (
                    <div className="text-xs text-slate-300 bg-slate-900/90 border border-slate-800/80 rounded-lg p-3">
                      {recState.isTranscribing ? (
                        <span className="text-blue-400 flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating transcript…</span>
                        </span>
                      ) : recState.transcript ? (
                        <>
                          <span className="text-slate-400 font-semibold">Transcript: </span>
                          {recState.transcript}
                        </>
                      ) : (
                        <span className="text-slate-400">
                          Recording saved for examiner evaluation. You may also type or edit your spoken transcript below if needed:
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                stopActiveRecording();
                setStep('questions');
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Questions</span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopActiveRecording();
                setStep('writing');
              }}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>Continue to Writing</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: WRITING TASK (100-150 WORDS) */}
      {step === 'writing' && (
        <div className="p-6 sm:p-8 rounded-2xl bg-[#111624] border border-slate-800 max-w-3xl mx-auto space-y-5">
          <div>
            <h3 className="text-xl font-bold text-white">Writing</h3>
            <p className="text-sm text-slate-200 mt-1">{WRITING_PROMPT}</p>
          </div>

          <textarea
            rows={10}
            value={writingText}
            onChange={e => {
              setWritingText(e.target.value);
              setShortWritingConfirmPending(false);
            }}
            placeholder="Type your answer here (aim for 100 to 150 words)..."
            className="w-full p-4 rounded-xl bg-[#070a12] border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />

          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>{countWords(writingText)} words</span>
            <span>Target: 100–150 words</span>
          </div>

          {shortWritingConfirmPending && (
            <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-4">
              <span>Your text is very short ({countWords(writingText)} words). Submit anyway?</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShortWritingConfirmPending(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
                >
                  Keep Writing
                </button>
                <button
                  type="button"
                  onClick={() => handleFinishExam(false)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                >
                  Submit Anyway
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setStep('speaking')}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Speaking</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (countWords(writingText) < 40 && !shortWritingConfirmPending) {
                  setShortWritingConfirmPending(true);
                  return;
                }
                handleFinishExam(false);
              }}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold uppercase tracking-wider text-white transition cursor-pointer"
            >
              Submit exam
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: RESULTS REPORT */}
      {step === 'results' && examResult && (
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Hero Level Card */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#111624] border border-slate-800 text-center space-y-2">
            <div className="text-xs text-slate-400">
              {examResult.candidate.name} · {new Date(examResult.submittedAt).toLocaleDateString()}
            </div>
            <div className="text-5xl sm:text-6xl font-extrabold text-blue-400 tracking-tight py-2">
              {examResult.objective.level}
            </div>
            <p className="text-sm text-slate-200 font-medium">
              {EXAM_LEVEL_DESCRIPTIONS[examResult.objective.level] || ''}
            </p>
            <p className="text-xs text-slate-400 font-mono">
              Objective score: {examResult.objective.score} / {examResult.objective.total}
              {examResult.timedOut ? ' (submitted automatically, time is up)' : ''}
            </p>
          </div>

          {/* Breakdown By CEFR Level & By Skill */}
          <div className="p-6 rounded-2xl bg-[#111624] border border-slate-800 space-y-5">
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                By CEFR level
              </h4>
              <div className="space-y-2">
                {CEFR_LEVELS.map(lvl => {
                  const raw = examResult.objective.byLevel[lvl] || '0/5';
                  const [num, den] = raw.split('/').map(Number);
                  const pct = den ? Math.round((num / den) * 100) : 0;
                  return (
                    <div
                      key={lvl}
                      className="grid grid-cols-[90px_1fr_52px] items-center gap-3 text-xs"
                    >
                      <span className="font-bold text-white">{lvl}</span>
                      <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-right font-mono text-slate-300">{raw}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5 pt-3 border-t border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">By skill</h4>
              <div className="space-y-2">
                {Object.entries(examResult.objective.bySkill).map(([skillName, raw]) => {
                  const [num, den] = raw.split('/').map(Number);
                  const pct = den ? Math.round((num / den) * 100) : 0;
                  return (
                    <div
                      key={skillName}
                      className="grid grid-cols-[90px_1fr_52px] items-center gap-3 text-xs"
                    >
                      <span className="font-bold text-white">{skillName}</span>
                      <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-right font-mono text-slate-300">{raw}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Speaking & Writing Indicative Metrics */}
          <div className="p-6 rounded-2xl bg-[#111624] border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Speaking and Writing
            </h4>
            <p className="text-xs text-slate-400">
              These two skills are marked by an examiner. The figures below are automatic and indicative only.
            </p>
            <div className="divide-y divide-slate-800/70 text-xs">
              {examResult.speaking.map((sp, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-4">
                  <span className="font-bold text-white">Speaking {idx + 1}</span>
                  <span className="font-mono text-slate-300">
                    {sp.metrics.band} · {sp.metrics.words} words
                  </span>
                </div>
              ))}
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="font-bold text-white">Writing</span>
                <span className="font-mono text-slate-300">
                  {examResult.writing.metrics.band} · {examResult.writing.words} words
                </span>
              </div>
            </div>
          </div>

          {/* Actions: Get Certificate, Print / PDF, Download JSON, Retake */}
          <div className="p-6 rounded-2xl bg-[#111624] border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {onGetCertificate && (
                <button
                  type="button"
                  onClick={() => {
                    const pre = mapAttemptToCertificatePreselection({
                      attemptId: savedAttempt?.attemptId,
                      participantName: examResult.candidate.name,
                      role: 'cefr_english',
                      completedAt: examResult.submittedAt,
                      englishExamResult: examResult,
                    });
                    onGetCertificate(pre);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-sm"
                >
                  <Award className="w-4 h-4" />
                  <span>Get Certificate</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print / Save PDF</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadJson}
                className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download result (JSON)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  isFinishedRef.current = false;
                  setStep('start');
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Take Exam Again</span>
              </button>
            </div>

            {syncMessage && (
              <div
                className={`text-xs flex items-center gap-2 ${
                  syncStatus === 'saved'
                    ? 'text-emerald-400'
                    : syncStatus === 'error'
                    ? 'text-rose-400'
                    : 'text-slate-400'
                }`}
              >
                {syncStatus === 'saved' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                {syncStatus === 'error' && <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{syncMessage}</span>
              </div>
            )}
          </div>

          {/* Review of Incorrect Answers */}
          {examResult.incorrectAnswers && examResult.incorrectAnswers.length > 0 && (
            <div className="p-6 rounded-2xl bg-[#111624] border border-slate-800 space-y-3">
              <h4 className="text-sm font-bold text-white">
                Review of incorrect answers ({examResult.incorrectAnswers.length})
              </h4>
              <div className="divide-y divide-slate-800/70">
                {examResult.incorrectAnswers.map(item => (
                  <div key={item.n} className="py-3 text-xs space-y-1">
                    <div className="text-slate-400 font-mono">
                      Q{item.n} · {item.type}
                    </div>
                    <div className="text-white font-medium">{item.q}</div>
                    <div className="text-rose-400">Your answer: {item.yours}</div>
                    <div className="text-emerald-400 font-semibold">Correct: {item.correct}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

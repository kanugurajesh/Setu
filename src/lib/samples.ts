import type { LangCode } from "./schemas";

/**
 * Synthetic cases (no real patients). Each one is chosen to exercise a
 * different part of the system:
 *  1. Telugu: low SpO2 the model must not downplay, a phone number spoken
 *     aloud, the patient's name spoken in Telugu script, and an old
 *     prescription that disagrees with what she says she takes.
 *  2. English: negations ("no chest pain") that a naive keyword match would
 *     flag, and an Aadhaar number to redact.
 *  3. Hindi: a pregnancy where three individually "soon" signs combine into
 *     an emergency.
 */

export interface SampleCase {
  id: string;
  label: string;
  language: string;
  sttLanguage: "te" | "hi" | "en";
  patient: { name: string; ageYears: string; sex: "female" | "male"; pregnant: boolean; knownConditions: string };
  vitals: { systolic: string; diastolic: string; pulse: string; temp: string; spo2: string; glucose: string; weightKg: string };
  transcript: string;
  doctorAdvice: string;
  planLanguage: LangCode;
  withDocument?: boolean;
  /** A synthetic day-N follow-up call, for the check-in step. */
  checkIn: { daysSinceVisit: number; sttLanguage: "te" | "hi" | "en"; transcript: string };
}

export const SAMPLES: SampleCase[] = [
  {
    id: "lakshmamma",
    label: "Fever & cough",
    language: "తెలుగు",
    sttLanguage: "te",
    patient: { name: "Lakshmamma, లక్ష్మమ్మ", ageYears: "62", sex: "female", pregnant: false, knownConditions: "Type 2 diabetes for 5 years" },
    vitals: { systolic: "138", diastolic: "86", pulse: "108", temp: "101.5", spo2: "91", glucose: "286", weightKg: "52" },
    transcript: `సమన్వయకర్త: అమ్మా, ఏమైంది చెప్పండి.
రోగి: నాలుగు రోజుల నుంచి జ్వరం వస్తోంది. దగ్గు కూడా ఉంది, కఫం పసుపు రంగులో వస్తోంది.
రోగి: బావి దగ్గరికి నడిచినా ఆయాసం వస్తోంది. రాత్రి సరిగ్గా నిద్ర పట్టడం లేదు.
సమన్వయకర్త: షుగర్ మాత్రలు వేసుకుంటున్నారా?
రోగి: Metformin వేసుకునేదాన్ని. రెండు వారాల నుంచి మాత్రలు అయిపోయాయి, ఇంకా కొనలేదు.
రోగి: దగ్గినప్పుడు ఛాతీలో కుడి వైపు నొప్పి వస్తుంది.
రోగి: ఇంట్లో ఒక్కదాన్నే ఉంటాను. కొడుకు హైదరాబాదులో ఉంటాడు, అతని నంబర్ 98765 43210.
రోగి: ఊర్లో అందరూ లక్ష్మమ్మ అని పిలుస్తారు. మందుల షాపు మా ఊరికి 6 కిలోమీటర్లు దూరం.`,
    doctorAdvice: `Impression: Right-sided community-acquired pneumonia with uncontrolled diabetes.
1. Tab Amoxicillin-Clavulanate 625 mg, one tablet twice daily after food, for 7 days.
2. Tab Paracetamol 650 mg, one tablet when fever is above 100°F, up to 3 times a day.
3. Restart Tab Metformin 500 mg, one tablet twice daily after food. Continue.
Chest X-ray at CHC today. Drink plenty of boiled water. Coordinator to arrange 1 month of metformin from the centre stock.
Review at this centre in 3 days, or immediately if breathing becomes harder, lips turn bluish, or she becomes drowsy.`,
    planLanguage: "te",
    withDocument: true,
    // Day 3: better, but stopped the antibiotic on day 2 (loose motions). Breathlessness is denied, not reported.
    checkIn: {
      daysSinceVisit: 3,
      sttLanguage: "te",
      transcript: `సమన్వయకర్త: అమ్మా, నేను ఆరోగ్య కేంద్రం నుంచి మాట్లాడుతున్నాను. ఇప్పుడు ఎలా ఉంది?
రోగి: జ్వరం తగ్గింది. దగ్గు కూడా కొంచెం తగ్గింది.
సమన్వయకర్త: ఆయాసం ఉందా?
రోగి: ఆయాసం ఇప్పుడు లేదు, బావి దగ్గరికి నడవగలుగుతున్నాను.
సమన్వయకర్త: పెద్ద మాత్ర రోజుకు రెండు సార్లు వేసుకుంటున్నారా?
రోగి: రెండు రోజులు వేసుకున్నాను. విరేచనాలు అయ్యాయి, అందుకే నిన్నటి నుంచి ఆపేశాను.
సమన్వయకర్త: షుగర్ మాత్రలు?
రోగి: కేంద్రంలో ఇచ్చిన Metformin ఉదయం, రాత్రి భోజనం తర్వాత వేసుకుంటున్నాను.
రోగి: జ్వరం లేదు కాబట్టి Paracetamol వేసుకోలేదు.`,
    },
  },
  {
    id: "ravi",
    label: "Headache, first BP check",
    language: "English",
    sttLanguage: "en",
    patient: { name: "Ravi Kumar", ageYears: "34", sex: "male", pregnant: false, knownConditions: "" },
    vitals: { systolic: "172", diastolic: "104", pulse: "84", temp: "36.8", spo2: "98", glucose: "132", weightKg: "68" },
    transcript: `Ravi says he has had a headache at the back of the head for 10 days, worse in the morning when he wakes up.
He works in the cotton fields from 6 am and smokes about 15 beedis a day. Eats pickle and dry fish with every meal.
He has never checked his BP before. His father had a stroke at 55.
No chest pain, no breathlessness. No weakness in the arm or leg.
Sleep is poor, he is worried about the crop loan.
He gave Aadhaar 4321 5678 9012 for the record. Wants to know if he can keep working.`,
    doctorAdvice: `Newly detected stage 2 hypertension.
Tab Amlodipine 5 mg once daily in the morning. Continue, do not stop on your own.
Reduce salt: no extra pickle or dry fish. Stop smoking; coordinator to share quit-line number.
He can keep working; take breaks in the shade and drink water.
BP check at this centre every week for 4 weeks.
Return immediately if severe headache, chest pain, weakness of one side of the body, or blurred vision.`,
    planLanguage: "te",
    // Day 7: missed two days when the strip ran out (shop is in town). Negations must not raise an alarm.
    checkIn: {
      daysSinceVisit: 7,
      sttLanguage: "en",
      transcript: `Coordinator: Ravi garu, this is the health centre. How is the headache?
Ravi: Much less now, only a little in the morning.
Coordinator: Are you taking the BP tablet?
Ravi: I took the Amlodipine every morning for four days. Then the strip finished and the medical shop is in town, so I missed two days.
Ravi: I will go to town only on Saturday for the market.
Ravi: No chest pain, no blurred vision. I have stopped eating pickle with every meal.
Ravi: Smoking I have cut to about ten beedis a day. Ankles are a little swollen in the evening.`,
    },
  },
  {
    id: "shabana",
    label: "Pregnancy, headache",
    language: "हिन्दी",
    sttLanguage: "hi",
    patient: { name: "Shabana Begum", ageYears: "26", sex: "female", pregnant: true, knownConditions: "Second pregnancy, about 30 weeks" },
    vitals: { systolic: "150", diastolic: "98", pulse: "92", temp: "36.9", spo2: "98", glucose: "", weightKg: "64" },
    transcript: `समन्वयक: क्या तकलीफ़ है?
मरीज़: सातवाँ महीना चल रहा है। दो दिन से सिर में बहुत दर्द है, और आँखों के सामने धुंधला दिखता है।
मरीज़: पैरों और हाथों में सूजन है, चूड़ियाँ टाइट हो गई हैं।
समन्वयक: बच्चा हिल रहा है?
मरीज़: हाँ, हिल रहा है। पेट में दर्द नहीं है।
मरीज़: आयरन की गोली कभी-कभी लेती हूँ, उससे उल्टी जैसा लगता है।
मरीज़: पति काम पर गए हैं। अस्पताल 30 किलोमीटर दूर है, बस से जाना पड़ेगा।`,
    doctorAdvice: `Suspected pre-eclampsia at about 30 weeks.
Refer today to the District Hospital labour ward. 108 ambulance arranged, do not wait for the bus.
Tab Labetalol 100 mg, one tablet now before transfer.
Continue Tab Iron-Folic Acid, one tablet daily at night after food.
Call 108 immediately if fits, severe headache, bleeding, or the baby stops moving.`,
    planLanguage: "hi",
    // Day 1: the referral never happened, and the danger signs are still there. The most common way patients are lost.
    checkIn: {
      daysSinceVisit: 1,
      sttLanguage: "hi",
      transcript: `समन्वयक: नमस्ते, मैं स्वास्थ्य केंद्र से बोल रही हूँ। आप ज़िला अस्पताल पहुँच गईं?
मरीज़: नहीं, अस्पताल नहीं गई। पति रात को देर से आए, सास ने कहा सुबह चलेंगे।
मरीज़: सिर में अभी भी बहुत दर्द है। आँखों के सामने अभी भी धुंधला दिखता है।
समन्वयक: बच्चा हिल रहा है?
मरीज़: हाँ, हिल रहा है। खून नहीं आया।
मरीज़: आयरन की गोली रात को खाना खाने के बाद ली।
मरीज़: केंद्र में जो BP की गोली दी थी, वो एक बार ली थी।`,
    },
  },
];

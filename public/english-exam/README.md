# English Level Exam (CEFR A1 to C2)

Standalone web module: Grammar, Vocabulary, Reading, Listening (real audio files), Speaking (microphone recording + live transcript), Writing.
No build step, no dependencies. Works in Chrome, Edge and Safari (live transcript needs Chrome/Edge).

## Install in your software (e.g. Laravel)
1. Copy this folder to `public/english-exam/` (any web folder works).
2. Open `https://your-site/english-exam/index.html?name=Rahim&email=r@x.com&ref=APPLICANT_ID`
   (name/email/ref are optional and prefill the form).
3. Or embed: `<iframe src="/english-exam/index.html?ref=123" allow="microphone" style="width:100%;height:90vh;border:0"></iframe>`
   The result is also sent to the parent page: `window.addEventListener('message', e => { if (e.data.type==='english-exam-result') console.log(e.data.data) })`

## Save results on your server
Set `endpoint` in `js/config.js` (and `csrfToken` if needed). The exam POSTs `multipart/form-data`:
`result` (JSON string) and `speaking_1`, `speaking_2`, `speaking_3` (audio/webm files).

Laravel example:
```php
Route::post('/api/english-exam/submit', function (Request $r) {
    $data = json_decode($r->input('result'), true);
    $files = [];
    foreach ([1,2,3] as $i) if ($r->hasFile("speaking_$i")) $files[] = $r->file("speaking_$i")->store('english-exam');
    // save $data + $files in your DB (examinerReview = 'pending')
    return response()->json(['ok' => true]);
});
```
## Customise
- `js/config.js`: brand name, time limit, show/hide correct answers, endpoint.
- `js/questions.js`: question bank (level 0=A1 ... 5=C2). First option is the correct one; options are shuffled at runtime.
- `assets/audio/q4.wav, q9, q14, q24`: listening clips (file name = question index).
- Speaking/writing prompts: top of `js/app.js` (`SP`, `WP`).

## Scoring
Objective level = highest CEFR level (climbing from A1) where the candidate got at least 3 of 5 right.
Speaking and Writing are saved for an examiner; automatic metrics (word count, speed, vocabulary variety) are indicative only.

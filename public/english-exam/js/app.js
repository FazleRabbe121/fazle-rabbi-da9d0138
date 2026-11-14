(function(){'use strict';
var C=window.EXAM_CONFIG,Q=window.QUESTIONS,N=Q.length,L=['A1','A2','B1','B2','C1','C2'];
var $=function(i){return document.getElementById(i)},P=new URLSearchParams(location.search);
var S={ans:[],o:[],i:0,sp:[],wr:'',t0:0,tick:null,done:false,name:'',email:''},cur=null;
var SP=['Introduce yourself: your name, your job and where you work.','Describe a typical day at work, from start to finish.','Some people prefer working alone, others prefer a team. Which do you prefer, and why?'];
var WP='Write 100 to 150 words: Describe your job and your goals for the next five years.';
var DESC={'Below A1':'Starter: begin with basic words and simple sentences.',A1:'Beginner: you understand very basic phrases.',A2:'Elementary: you can handle simple everyday conversations.',B1:'Intermediate: you can discuss familiar topics and write simply.',B2:'Upper-Intermediate: confident, effective English for work.',C1:'Advanced: fluent and precise on complex topics.',C2:'Proficient: near-native command of English.'};
function show(id){['s-start','s-q','s-sp','s-wr','s-res'].forEach(function(x){$(x).classList.toggle('hide',x!==id)});window.scrollTo(0,0)}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function shuf(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function prog(k){$('pb').style.width=(k/(N+2)*100)+'%'}
function wc(t){return (t.trim().match(/\S+/g)||[]).length}
$('brand').textContent=C.brand;$('nm').value=P.get('name')||'';$('em').value=P.get('email')||'';
$('go').onclick=function(){var n=$('nm').value.trim();if(!n){$('nm').focus();return}
 S.name=n;S.email=$('em').value.trim();
 S.o=Q.map(function(q){return shuf(q[3].map(function(t,k){return{t:t,c:k===0}}))});
 S.t0=Date.now();$('tm').classList.remove('hide');$('bar').classList.remove('hide');
 S.tick=setInterval(tick,1000);tick();rq()};
function tick(){var l=C.timeLimitMin*60-Math.floor((Date.now()-S.t0)/1000);
 if(l<=0){alert('Time is up. Your exam will be submitted now.');finish(true);return}
 $('tm').textContent='Time left '+Math.floor(l/60)+':'+('0'+l%60).slice(-2)}
function rq(){var q=Q[S.i],e=q[4]||{},h='<div class="mu">Question '+(S.i+1)+' of '+N+' · '+q[1]+'</div>';
 if(e.p)h+='<blockquote>'+esc(e.p)+'</blockquote>';
 if(e.say)h+='<audio controls preload="auto" src="assets/audio/q'+S.i+'.wav"></audio><div class="mu">You can play the audio as many times as you need.</div>';
 h+='<h2>'+esc(q[2])+'</h2>';
 S.o[S.i].forEach(function(x,k){h+='<label class="opt"><input type="radio" name="o" value="'+k+'"'+(S.ans[S.i]===k?' checked':'')+'><span>'+esc(x.t)+'</span></label>'});
 h+='<div class="nav"><button class="ghost" id="pv"'+(S.i?'':' disabled')+'>Back</button><button id="nx">'+(S.i===N-1?'Continue to Speaking':'Next')+'</button></div>';
 $('s-q').innerHTML=h;show('s-q');prog(S.i);
 $('s-q').onchange=function(e){if(e.target.name==='o')S.ans[S.i]=+e.target.value};
 $('pv').onclick=function(){S.i--;rq()};
 $('nx').onclick=function(){if(S.ans[S.i]===undefined&&!confirm('Skip this question?'))return;if(S.i<N-1){S.i++;rq()}else rsp()}}
function rsp(){var h='<h2>Speaking</h2><p class="mu">Press Record, speak for at least 30 seconds, then press Stop. Allow microphone access when asked. You can re-record any task.</p>';
 SP.forEach(function(p,k){h+='<div class="sp"><b>Task '+(k+1)+'.</b> '+esc(p)+'<div class="nav"><button class="rec" data-k="'+k+'">● Record</button><span class="mu" id="rs'+k+'"></span></div><audio controls class="hide" id="pl'+k+'"></audio><div class="mu" id="tx'+k+'"></div></div>'});
 h+='<div class="nav"><span></span><button id="nx2">Continue to Writing</button></div>';
 $('s-sp').innerHTML=h;show('s-sp');prog(N);
 $('s-sp').onclick=function(e){var k=e.target.getAttribute&&e.target.getAttribute('data-k');if(k!==null&&k!==undefined)tg(+k)};
 $('nx2').onclick=rwr}
function tg(k){if(cur&&cur.k===k){stopRec();return}if(cur)stopRec();startRec(k)}
function stopRec(){if(!cur)return;var c=cur;cur=null;c.stopped=true;clearInterval(c.iv);try{c.sr&&c.sr.stop()}catch(e){}try{c.mr.stop()}catch(e){}}
function startRec(k){var st=$('rs'+k),btn=document.querySelector('[data-k="'+k+'"]');
 if(!navigator.mediaDevices||!window.MediaRecorder){st.textContent='Recording is not supported in this browser. Use Chrome, Edge or Safari.';return}
 navigator.mediaDevices.getUserMedia({audio:true}).then(function(stm){
  var ch=[],mr=new MediaRecorder(stm),sr=null,txt='',t0=Date.now(),SR=window.SpeechRecognition||window.webkitSpeechRecognition,c;
  if(SR){try{sr=new SR();sr.lang='en-US';sr.continuous=true;sr.interimResults=false;
   sr.onresult=function(ev){for(var j=ev.resultIndex;j<ev.results.length;j++)if(ev.results[j].isFinal)txt+=ev.results[j][0].transcript+' '};
   sr.onend=function(){if(c&&!c.stopped){try{sr.start()}catch(e){}}};sr.start()}catch(e){sr=null}}
  mr.ondataavailable=function(e){if(e.data&&e.data.size)ch.push(e.data)};
  mr.onstop=function(){stm.getTracks().forEach(function(t){t.stop()});var d=Math.round((Date.now()-t0)/1000);
   setTimeout(function(){var b=new Blob(ch,{type:mr.mimeType||'audio/webm'});S.sp[k]={blob:b,dur:d,text:txt.trim(),prompt:SP[k]};
    var a=$('pl'+k);a.src=URL.createObjectURL(b);a.classList.remove('hide');st.textContent='Saved ('+d+'s)';
    $('tx'+k).textContent=SR?(txt.trim()?'Transcript: '+txt.trim():'No speech was recognised. Speak closer to the microphone.'):'Live transcript is not available in this browser; your recording is saved for the examiner.';
    btn.textContent='● Re-record'},700)};
  c=cur={k:k,mr:mr,sr:sr,stopped:false,iv:setInterval(function(){st.textContent='Recording… '+Math.round((Date.now()-t0)/1000)+'s'},500)};
  btn.textContent='■ Stop';mr.start()
 }).catch(function(){st.textContent='Microphone blocked. Allow microphone access in the browser and try again.'})}
function rwr(){stopRec();
 $('s-wr').innerHTML='<h2>Writing</h2><p>'+WP+'</p><textarea id="wt" rows="10" placeholder="Type your answer here"></textarea><div class="mu" id="wc">0 words</div><div class="nav"><span></span><button id="fin">Submit exam</button></div>';
 show('s-wr');prog(N+1);var t=$('wt');t.value=S.wr;
 t.oninput=function(){S.wr=t.value;$('wc').textContent=wc(t.value)+' words'};
 $('fin').onclick=function(){if(wc(t.value)<40&&!confirm('Your text is very short. Submit anyway?'))return;finish(false)}}
function met(t,d,sn){var w=(t.toLowerCase().match(/[a-z']+/g)||[]),n=w.length;
 if(n<15)return{words:n,band:n?'Insufficient':'No data'};
 var u=new Set(w).size/n,al=w.join('').length/n,wpm=d?Math.round(n/d*60):null,
 p=(u>.65?2:u>.5?1:0)+(al>4.7?2:al>4.1?1:0)+(d?(wpm>=100?2:wpm>=65?1:0):(n/sn>16?2:n/sn>9?1:0));
 return{words:n,wpm:wpm,lexicalVariety:+u.toFixed(2),avgWordLength:+al.toFixed(1),band:p<=1?'A2 or below':p<=3?'B1':p<=5?'B2':'C1+'}}
function finish(to){if(S.done)return;S.done=true;clearInterval(S.tick);stopRec();$('tm').classList.add('hide');setTimeout(function(){build(to)},900)}
function build(to){var s=[0,0,0,0,0,0],sk={},wr=[];
 Q.forEach(function(q,n){var a=S.ans[n],ok=a!==undefined&&S.o[n][a].c;sk[q[1]]=sk[q[1]]||[0,0];sk[q[1]][1]++;
  if(ok){s[q[0]]++;sk[q[1]][0]++}else wr.push({n:n+1,type:q[1],q:q[2],yours:a===undefined?'No answer':S.o[n][a].t,correct:q[3][0]})});
 var lv=-1;for(var i=0;i<6;i++){if(s[i]>=3)lv=i;else break}
 var tot=s.reduce(function(a,b){return a+b},0),lvl=lv<0?'Below A1':L[lv],byLevel={};L.forEach(function(l,i){byLevel[l]=s[i]+'/5'});
 var sp=SP.map(function(p,k){var x=S.sp[k];return x?{prompt:p,seconds:x.dur,transcript:x.text,metrics:met(x.text,x.dur,1)}:{prompt:p,seconds:0,transcript:'',metrics:{words:0,band:'Not attempted'}}});
 var wm=met(S.wr,0,(S.wr.match(/[.!?]+/g)||[]).length||1);
 var R={candidate:{name:S.name,email:S.email,ref:P.get('ref')||''},submittedAt:new Date().toISOString(),timedOut:!!to,durationSec:Math.round((Date.now()-S.t0)/1000),
  objective:{level:lvl,score:tot,total:N,byLevel:byLevel,bySkill:Object.keys(sk).reduce(function(o,k){o[k]=sk[k][0]+'/'+sk[k][1];return o},{})},
  speaking:sp,writing:{text:S.wr,words:wc(S.wr),metrics:wm},examinerReview:'pending'};
 var h='<div class="card"><div class="mu" style="text-align:center">'+esc(S.name)+' · '+new Date().toLocaleDateString()+'</div><div class="big">'+lvl+'</div><p style="text-align:center">'+DESC[lvl]+'</p><p class="mu" style="text-align:center">Objective score: '+tot+' / '+N+(to?' (submitted automatically, time is up)':'')+'</p></div>';
 h+='<div class="card"><b>By CEFR level</b>';L.forEach(function(l,i){h+='<div class="row"><b>'+l+'</b><div><i style="width:'+s[i]/5*100+'%"></i></div><span>'+s[i]+'/5</span></div>'});
 h+='<br><b>By skill</b>';Object.keys(sk).forEach(function(k){h+='<div class="row"><b>'+k+'</b><div><i style="width:'+sk[k][0]/sk[k][1]*100+'%"></i></div><span>'+sk[k][0]+'/'+sk[k][1]+'</span></div>'});h+='</div>';
 h+='<div class="card"><b>Speaking and Writing</b><p class="mu">These two skills are marked by an examiner. The figures below are automatic and indicative only.</p>';
 sp.forEach(function(x,k){h+='<div class="row"><b>Speaking '+(k+1)+'</b><span>'+x.metrics.band+' · '+x.metrics.words+' words</span></div>'});
 h+='<div class="row"><b>Writing</b><span>'+wm.band+' · '+R.writing.words+' words</span></div></div>';
 h+='<div class="card noprint"><div class="nav" style="justify-content:flex-start;flex-wrap:wrap"><button id="pr">Print / Save PDF</button><button class="ghost" id="dj">Download result (JSON)</button></div><p class="mu" id="sd"></p></div>';
 if(C.showAnswers&&wr.length){h+='<div class="card"><b>Review of incorrect answers</b>';wr.forEach(function(w){h+='<div class="wrong"><span class="mu">Q'+w.n+' · '+w.type+'</span><br>'+esc(w.q)+'<br><span class="bad">Your answer: '+esc(w.yours)+'</span><br><span class="ok">Correct: '+esc(w.correct)+'</span></div>'});h+='</div>'}
 $('s-res').innerHTML=h;show('s-res');$('pb').style.width='100%';
 $('pr').onclick=function(){window.print()};
 $('dj').onclick=function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(R,null,2)],{type:'application/json'}));a.download='english-exam-'+S.name.replace(/\W+/g,'-')+'.json';a.click()};
 try{window.parent.postMessage({type:'english-exam-result',data:R},'*')}catch(e){}
 if(C.endpoint){var fd=new FormData(),hd={'Accept':'application/json'};fd.append('result',JSON.stringify(R));
  S.sp.forEach(function(x,k){if(x)fd.append('speaking_'+(k+1),x.blob,'speaking_'+(k+1)+'.webm')});
  if(C.csrfToken)hd['X-CSRF-TOKEN']=C.csrfToken;$('sd').textContent='Sending result to server…';
  fetch(C.endpoint,{method:'POST',body:fd,headers:hd,credentials:'same-origin'}).then(function(r){if(!r.ok)throw 0;$('sd').textContent='Result sent to the server.'}).catch(function(){$('sd').textContent='Could not send to the server. Please download the JSON and send it manually.'})}}
})();

const { Telegraf } = require("telegraf");
const axios = require("axios");
const express = require("express");

const { initializeApp, getApps, getApp } = require("firebase/app");
const {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  deleteDoc
} = require("firebase/firestore");

// ---------------- CONFIG ----------------

const BOT_TOKEN = "8605262250:AAFxTlXrO4-To9n17KxRxLhnVf4z3gXTsu0";
const CHANNEL_ID = "-1003758755416";
const RENDER_URL = "https://yourapp.onrender.com/";
const APP_ID = "PREDICTION-BOT";

const MAX_HISTORY = 50000;

// -------- MULTI API --------

const API_LIST = [

"https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=10",

"https://api.codetabs.com/v1/proxy?quest=https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=10",

"https://api.allorigins.win/raw?url=https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=10",

"https://thingproxy.freeboard.io/fetch/https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=10"

];

// ---------------- FIREBASE ----------------

const firebaseConfig = {
  apiKey: "AIzaSyCBamhZOPPWhI-SSoVfMKzek9rlt8P1DFQ",
  authDomain: "prediction-90e5a.firebaseapp.com",
  projectId: "prediction-90e5a",
  storageBucket: "prediction-90e5a.firebasestorage.app",
  messagingSenderId: "158403078327",
  appId: "1:158403078327:web:f4622c060be4799e900532",
  measurementId: "G-02VY72T464"
};

const firebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

const db = getFirestore(firebaseApp);

// ---------------- BOT ----------------

const bot = new Telegraf(BOT_TOKEN);

// ---------------- FETCH DATA ----------------

async function fetchData(){

for(const url of API_LIST){

try{

const res = await axios.get(url,{timeout:10000});

if(res.data?.data?.list){

return res.data.data.list;

}

}catch(e){

console.log("API FAILED");

}

}

return null;

}

// ---------------- HISTORY SYNC ----------------

async function syncHistory(){

const list = await fetchData();

if(!list) return null;

for(const item of list){

const id = item.issueNumber;
const num = item.number;

if(!id) continue;

const ref = doc(
db,"artifacts",APP_ID,"public","data","history",id
);

await setDoc(ref,{
issueNumber:id,
number:parseInt(num),
time:Date.now()
},{merge:true});

}

await cleanHistory();

return list;

}

// ---------------- CLEAN HISTORY ----------------

async function cleanHistory(){

const snap = await getDocs(
collection(db,"artifacts",APP_ID,"public","data","history")
);

if(snap.size <= MAX_HISTORY) return;

let docs=[];

snap.forEach(d=>docs.push(d));

docs.sort((a,b)=>Number(a.id)-Number(b.id));

const remove = docs.slice(0,docs.length-MAX_HISTORY);

for(const d of remove){

await deleteDoc(d.ref);

}

console.log("OLD HISTORY DELETED");

}

// ---------------- AI ENGINE ----------------

function scanPattern(nums){

for(let L=9;L>=3;L--){

const p = nums.slice(0,L);

for(let i=1;i<nums.length-L;i++){

let match=true;

for(let j=0;j<L;j++){

if(nums[i+j]!==p[j]){
match=false;
break;
}

}

if(match){

return nums[i-1]>=5?"BIG":"SMALL";

}

}

}

return null;

}

function frequencyAI(nums){

let big=0;
let small=0;

nums.slice(0,20).forEach(n=>{
if(n>=5) big++;
else small++;
});

return big>small?"BIG":"SMALL";

}

function trendAI(nums){

const last = nums.slice(0,5);

const big = last.filter(n=>n>=5).length;
const small = last.filter(n=>n<5).length;

if(big>=4) return "SMALL";
if(small>=4) return "BIG";

return null;

}

function quantumPredict(nums){

const p1 = scanPattern(nums);
const p2 = frequencyAI(nums);
const p3 = trendAI(nums);

const votes=[p1,p2,p3].filter(Boolean);

const big = votes.filter(v=>v==="BIG").length;
const small = votes.filter(v=>v==="SMALL").length;

return big>=small?"BIG":"SMALL";

}

// ---------------- STATS ----------------

async function updateStats(isWin){

const ref = doc(
db,"artifacts",APP_ID,"public","data","stats","main"
);

const snap = await getDoc(ref);

let win=0;
let loss=0;

if(snap.exists()){

win=snap.data().win||0;
loss=snap.data().loss||0;

}

if(isWin) win++;
else loss++;

await setDoc(ref,{win,loss},{merge:true});

}

// ---------------- LOOP ----------------

let lastPeriod="";

async function loop(){

const list = await syncHistory();

if(!list) return;

const top = list[0];

const cur = top.issueNumber;
const next = (BigInt(cur)+1n).toString();

const stateRef = doc(
db,"artifacts",APP_ID,"public","data","last_pred","state"
);

const stateSnap = await getDoc(stateRef);

if(stateSnap.exists()){

const d = stateSnap.data();

if(d.issueNumber===cur && !d.done){

const num = parseInt(top.number);

const res = num>=5?"BIG":"SMALL";

const win = d.prediction===res;

await updateStats(win);

const msg =

`🤖 QUANTUM AI RESULT

🆔 Period : #${cur.slice(-4)}

🎯 Prediction : ${d.prediction}
🎲 Result : ${res} (${num})

📊 Status : ${win?"✅ WIN":"❌ LOSS"}

━━━━━━━━━━━━━━
⚡ Quantum AI Engine`;

try{

await bot.telegram.editMessageText(
CHANNEL_ID,
d.msgId,
null,
msg
);

await setDoc(stateRef,{done:true},{merge:true});

}catch(e){}

}

}

if(lastPeriod!==cur){

lastPeriod=cur;

const snap = await getDocs(
collection(db,"artifacts",APP_ID,"public","data","history")
);

let hist=[];
snap.forEach(d=>hist.push(d.data()));

hist.sort((a,b)=>Number(b.issueNumber)-Number(a.issueNumber));

const nums = hist.map(h=>h.number);

if(nums.length<20) return;

const pred = quantumPredict(nums);

const text =

`🤖 QUANTUM AI PREDICTION

━━━━━━━━━━━━━━

🆔 Period : #${next.slice(-4)}

🎯 Signal : ${pred}

🧠 Engine : Pattern + Trend + Frequency

📂 Database : ${nums.length}

━━━━━━━━━━━━━━
⚡ Live Result Tracking`;

try{

const sent = await bot.telegram.sendMessage(
CHANNEL_ID,
text
);

await setDoc(stateRef,{
issueNumber:next,
prediction:pred,
msgId:sent.message_id,
done:false
});

}catch(e){}

}

}

// ---------------- SERVER ----------------

const app = express();

app.get("/",(req,res)=>{

res.send("Quantum AI Bot Running");

});

app.listen(process.env.PORT||3000,()=>{

setInterval(()=>{
axios.get(RENDER_URL).catch(()=>{})
},600000);

});

// ---------------- START ----------------

setInterval(loop,30000);

loop();

bot.launch({dropPendingUpdates:true});

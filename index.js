const { Telegraf } = require("telegraf");
const axios = require("axios");
const express = require("express");

const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection
} = require("firebase/firestore");


// ===== CONFIG =====

const BOT_TOKEN = "8605262250:AAFxTlXrO4-To9n17KxRxLhnVf4z3gXTsu0";
const CHANNEL_ID = "-1003758755416";

const APP_ID = "pattern-ai";

const API_URL =
"https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=10";


// ===== FIREBASE =====

const firebaseConfig = {
  apiKey: "AIzaSyCBamhZOPPWhI-SSoVfMKzek9rlt8P1DFQ",
  authDomain: "prediction-90e5a.firebaseapp.com",
  projectId: "prediction-90e5a",
  storageBucket: "prediction-90e5a.firebasestorage.app",
  messagingSenderId: "158403078327",
  appId: "1:158403078327:web:f4622c060be4799e900532",
  measurementId: "G-02VY72T464"
};

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);


// ===== BOT =====

const bot = new Telegraf(BOT_TOKEN);


// ===== SAFE FETCH =====

async function fetchSafeData(){

try{

const proxy = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(API_URL)}`;

const res = await axios.get(proxy,{timeout:10000});

if(res.data?.data?.list){
return res.data.data.list;
}

}catch(e){
console.log("Proxy Failed");
}

return null;

}


// ===== SAVE HISTORY =====

async function saveHistory(list){

for(const item of list){

const id = item.issueNumber;
const num = parseInt(item.number);

const ref = doc(
db,
"artifacts",
APP_ID,
"history",
id
);

await setDoc(ref,{
period:id,
number:num
},{merge:true});

}

}


// ===== GET HISTORY =====

async function getHistory(){

const snap = await getDocs(
collection(db,"artifacts",APP_ID,"history")
);

let hist=[];

snap.forEach(d=>hist.push(d.data()));

hist.sort((a,b)=>Number(b.period)-Number(a.period));

return hist;

}


// ===== PATTERN AI =====

function patternPredict(nums){

for(let L=9;L>=2;L--){

const pattern = nums.slice(0,L);

for(let i=1;i<nums.length-L;i++){

let match=true;

for(let j=0;j<L;j++){

if(nums[i+j]!==pattern[j]){
match=false;
break;
}

}

if(match){

const next = nums[i-1];

return {
number:next,
type: next>=5?"BIG":"SMALL",
level:L
};

}

}

}

return null;

}


// ===== MAIN LOOP =====

let lastPeriod="";

async function loop(){

const list = await fetchSafeData();

if(!list) return;

await saveHistory(list);

const hist = await getHistory();

if(hist.length<20) return;

const nums = hist.map(x=>x.number);

const cur = hist[0].period;

const next = (BigInt(cur)+1n).toString();

if(lastPeriod===cur) return;

lastPeriod=cur;

const ai = patternPredict(nums);

if(!ai) return;

const text =

`🤖 Pattern AI Prediction

Period : ${next}

Prediction : ${ai.type} (${ai.number})

Pattern Match : ${ai.level}

Status : Waiting Result`;

try{

const msg = await bot.telegram.sendMessage(
CHANNEL_ID,
text
);

await setDoc(
doc(db,"artifacts",APP_ID,"last"),
{
period:next,
prediction:ai.type,
number:ai.number,
level:ai.level,
msgId:msg.message_id,
done:false
}
);

}catch(e){
console.log("Telegram Send Error");
}

}


// ===== RESULT CHECK =====

async function checkResult(){

const ref = doc(db,"artifacts",APP_ID,"last");

const snap = await getDoc(ref);

if(!snap.exists()) return;

const data = snap.data();

if(data.done) return;

const hist = await getHistory();

const cur = hist[0];

if(cur.period!==data.period) return;

const resultType = cur.number>=5?"BIG":"SMALL";

const win = resultType===data.prediction;

const msg =

`🤖 Pattern AI Result

Prediction : ${data.prediction} (${data.number})

Result : ${resultType} (${cur.number})

Status : ${win?"✅ WIN":"❌ LOSS"}

Pattern Match : ${data.level}`;

try{

await bot.telegram.editMessageText(
CHANNEL_ID,
data.msgId,
null,
msg
);

await setDoc(ref,{done:true},{merge:true});

}catch(e){}

}


// ===== SERVER =====

const app = express();

app.get("/",(req,res)=>{
res.send("Pattern AI Bot Running");
});

app.listen(process.env.PORT||3000);


// ===== START =====

setInterval(loop,30000);
setInterval(checkResult,15000);

bot.launch({dropPendingUpdates:true});

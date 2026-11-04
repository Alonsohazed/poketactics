// Coste 5 a 3★ (con 3 objetos de su rol) + 6 fichas de apoyo a 2★ contra tableros fuertes de nivel 9 (2★ de coste 4 con objetos)
const fs=require('fs'),path=require('path'),vm=require('vm');
// Uso: node leg3.js [raíz=.] [partidas=40] [solo=clave] [hard] [alone] [noitems] [vs5]
//   hard: 6 costes 4 y 2 costes 5 a 2★, todos con objetos · alone: el coste 5 a 3★ sin compañeros · noitems: sin sus objetos
//   vs5: contra cada uno de los otros costes 5 a 3★ (con sus objetos), también solos
//   max: 2 costes 4 a 3★, 2 costes 5 a 2★ y 4 costes 4 a 2★ · reroll: 8 fichas de coste 1-3 a 3★ (todas con objetos)
// Para comparar con otra versión, pasa como raíz una carpeta con public/augments.js y public/game.js de esa versión
const ROOT=process.argv[2]||'.';
const ctx={__SERVER__:true,module:{exports:{}},console,setTimeout,clearTimeout,setInterval,clearInterval}; vm.createContext(ctx);
vm.runInContext(['augments.js','game.js'].map(f=>fs.readFileSync(path.join(ROOT,'public',f),'utf8')).join('\n'),ctx);
const E=ctx.module.exports;
const ITEMS_BY={a:['claw+claw','lens+claw','club+club'],b:['claw+claw','lens+claw','club+club'],r:['wing+claw','wing+wing','lens+claw'],m:['spoon+spoon','spoon+water','lens+spoon'],t:['coat+coat','goggles+coat','club+club'],h:['spoon+water','water+water','spoon+spoon']};
const it=k=>(ITEMS_BY[E.DEF[k].role]||ITEMS_BY.m).map(r=>{ const [a,b]=r.split('+'); return E.RECIPE[[a,b].sort().join('+')]||E.RECIPE[a+'+'+b]||E.RECIPE[b+'+'+a]; }).filter(Boolean);
const front=['3,0','2,0','4,0','1,0','5,0','0,0','6,0','3,1','2,1','4,1'], rear=['3,3','2,3','4,3','1,3','5,3','0,3','6,3','3,2','2,2','4,2'];
function snap(list){ const used=new Set(); return {m:{},u:list.map(([k,s,items])=>{ const back=['r','m','h'].includes(E.DEF[k].role); const c=(back?rear:front).find(x=>!used.has(x)); used.add(c); return [c,k,s,items||[],0,0,0]; })}; }
const c4=E.UNIT_LIST.filter(u=>u.cost===4).map(u=>u.key), c3=E.UNIT_LIST.filter(u=>u.cost===3).map(u=>u.key);
let seed=1; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
const pickN=(a,n)=>{ const c=a.slice(), o=[]; while(o.length<n&&c.length) o.push(c.splice(Math.floor(rnd()*c.length),1)[0]); return o; };
const N=+process.argv[3]||40, only=process.argv[4]&&process.argv[4]!=='-'?process.argv[4]:null, alone=process.argv.includes('alone'), noit=process.argv.includes('noitems'), vs5=process.argv.includes('vs5'), max=process.argv.includes('max'), reroll=process.argv.includes('reroll');
const c13=E.UNIT_LIST.filter(u=>u.cost<=3&&!E.DEF[u.key].evoOf).map(u=>u.key);
for(const L of E.UNIT_LIST.filter(u=>u.cost===5&&(!only||u.key===only))){
 let w=0;
 for(let i=0;i<N;i++){
  const sup=alone?[]:pickN(c3.concat(c4),6).map(k=>[k,2,[]]);
  const A=snap([[L.key,3,noit?[]:it(L.key)],...sup]);
  const hard=process.argv[5]==='hard'; const foe=pickN(c4,hard?6:7).map((k,j)=>[k,2,hard||j<3?it(k):[]]); for(const k5 of pickN(E.UNIT_LIST.filter(u=>u.cost===5&&u.key!==L.key).map(u=>u.key),hard?2:1)) foe.push([k5,2,hard?it(k5):[]]);
  const o5=E.UNIT_LIST.filter(u=>u.cost===5&&u.key!==L.key)[i%9].key, B=vs5?snap([[o5,3,it(o5)]]):max?snap([...pickN(c4,2).map(k=>[k,3,it(k)]),...pickN(E.UNIT_LIST.filter(u=>u.cost===5&&u.key!==L.key).map(u=>u.key),2).map(k=>[k,2,it(k)]),...pickN(c4,4).map(k=>[k,2,it(k)])]):reroll?snap(pickN(c13,8).map(k=>[k,3,it(k)])):snap(foe);
  const cb=E.createCombatSnap(A,B,{s:6,n:2},{seed:1000+i}); E.simulate(cb); if(cb.winner===0) w++;
 }
 console.log(L.key.padEnd(10),(100*w/N).toFixed(0)+'%');
}

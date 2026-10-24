// Biblioteca de piezas para los iconos de aumento al estilo TFT (propios): cada pieza devuelve [piezas, cortes].
// Las piezas van en grises (OSC = sombra, MED = tono medio, CLA = luz) y el filtro de iconos-aumentos-tft.js las tiñe con
// el color de la rareza; los cortes (en negro) son huecos finos que dejan ver el fondo y marcan los detalles, sin contornos.
// Coordenadas del lienzo de 512 px; luz siempre arriba a la izquierda y sombra en la mitad derecha.
let N=0; const uid=p=>p+(N++); const f=v=>+(+v).toFixed(2);
const OSC='#1a1a1a', MED='#7a7a7a', CLA='#ffffff';
const E=(cx,cy,rx,ry)=>`M${f(cx-rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2*rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2*rx)} 0Z`;
const RR=(x,y,w,h,r)=>{ r=Math.min(r,w/2,h/2); return `M${f(x+r)} ${f(y)}h${f(w-2*r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h-2*r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w-2*r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(-(h-2*r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}Z`; };
const P=pts=>'M'+pts.map(([x,y])=>`${f(x)} ${f(y)}`).join('L')+'Z';
const poli=(cx,cy,n,r,giro=0)=>Array.from({length:n},(_,i)=>{const a=giro+2*Math.PI*i/n; return [cx+r*Math.cos(a),cy+r*Math.sin(a)];});
const est=(x,y,r,n=4,k=.22)=>P(Array.from({length:2*n},(_,i)=>{const a=-Math.PI/2+Math.PI*i/n, rr=i%2?r*k:r; return [x+rr*Math.cos(a),y+rr*Math.sin(a)];}));
const rel=(d,c,extra='')=>`<path d="${d}" fill="${c}"${extra}/>`;
const corte=(d,w)=>`<path d="${d}" fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const hueco=d=>`<path d="${d}" fill="#000"/>`;
const anillo=(cx,cy,r,w)=>`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="#000" stroke-width="${w}"/>`;
const txt=(x,y,s,t)=>`<text x="${f(x)}" y="${f(y)}" font-family="Arial Black,Arial" font-weight="900" font-size="${s}" fill="#000" text-anchor="middle">${t}</text>`;
const g=(tr,[p,c])=>[`<g transform="${tr}">${p}</g>`,`<g transform="${tr}">${c}</g>`];
const J=(...partes)=>[partes.map(x=>x[0]||'').join(''),partes.map(x=>x[1]||'').join('')];
const solo=(p)=>[p,''];
const cortes=(c)=>['',c];
// pieza con sombra plana en la mitad derecha (corte en x = cx) y un brillo (luz: trazado)
function pz(d,cx,luz=null,{base=MED,fr='nonzero'}={}){
 const c=uid('c');
 return `<clipPath id="${c}"><path d="${d}" clip-rule="${fr}"/></clipPath>${rel(d,base,fr!=='nonzero'?` fill-rule="${fr}"`:'')}<g clip-path="url(#${c})"><rect x="${f(cx)}" y="-60" width="900" height="900" fill="${OSC}" opacity=".55"/>${luz?rel(luz,CLA,' opacity=".9"'):''}</g>`;
}
const T=(x,y,k,rot=0)=>`translate(${f(x)} ${f(y)})${rot?` rotate(${f(rot)})`:''}${k!==1?` scale(${f(k)})`:''}`;

// ---------- acentos ----------
const estela=(cx=256,cy=410,rx=190,ry=50,t=30)=>solo(rel(`${E(cx,cy,rx,ry)} ${E(cx,cy-t*.7,rx-t*.4,ry-t*.45)}`,MED,' fill-rule="evenodd"'));
const aro=(cx,cy,rx,ry,t,rot,mitad)=>{ const c=uid('a'), yc=mitad==='atras'?-900:0;
 return solo(`<clipPath id="${c}"><rect x="-900" y="${yc}" width="1800" height="900" transform="translate(${f(cx)} ${f(cy)}) rotate(${rot})"/></clipPath><g clip-path="url(#${c})">${rel(`${E(cx,cy,rx,ry)} ${E(cx,cy,rx-t,ry-t*.55)}`,mitad==='atras'?OSC:MED,` fill-rule="evenodd" transform="rotate(${rot} ${f(cx)} ${f(cy)})"`)}</g>`); };
const aroDe=(cx,cy,rx,ry,t,rot)=>[aro(cx,cy,rx,ry,t,rot,'atras'),aro(cx,cy,rx,ry,t,rot,'delante')];
const destello=(x,y,r)=>solo(rel(est(x,y,r),CLA));
const destellos=(...l)=>J(...l.map(([x,y,r])=>destello(x,y,r)));
const chevron=(x,y,s,t,tono=CLA)=>solo(rel(P([[x-s,y+s*.55],[x,y-s*.45],[x+s,y+s*.55],[x+s,y+s*.55+t],[x,y-s*.45+t],[x-s,y+s*.55+t]]),tono));
const subir=(x,y,s=34,t=16)=>J(chevron(x,y,s,t),chevron(x,y+s*1.05,s,t));
const bajar=(x,y,s=34,t=16)=>g(`rotate(180 ${x} ${y})`,J(chevron(x,y,s,t),chevron(x,y+s*1.05,s,t)));
// estela curva (media luna) a un lado, como un barrido de movimiento
const barrido=(cx,cy,r,a0,a1,grosor,tono=MED)=>{ const pt=(a,rr)=>[cx+rr*Math.cos(a*Math.PI/180),cy+rr*Math.sin(a*Math.PI/180)], [x0,y0]=pt(a0,r), [x1,y1]=pt(a1,r), [x2,y2]=pt((a0+a1)/2,r-grosor);
 return solo(rel(`M${f(x0)} ${f(y0)}A${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}Q${f(x2+(x2-cx)*.02)} ${f(y2+(y2-cy)*.02)} ${f(x0)} ${f(y0)}Z`,tono)); };
const mas=(x,y,s,t,tono=CLA)=>solo(rel(`M${f(x-t/2)} ${f(y-s/2)}h${t}v${f(s/2-t/2)}h${f(s/2-t/2)}v${t}h${f(-(s/2-t/2))}v${f(s/2-t/2)}h${-t}v${f(-(s/2-t/2))}h${f(-(s/2-t/2))}v${-t}h${f(s/2-t/2)}Z`,tono));
const barra=(x0,y0,x1,y1,w=22)=>solo(`<path d="M${x0} ${y0}L${x1} ${y1}" stroke="${CLA}" stroke-width="${w}" stroke-linecap="round"/>`);
const tacha=(x0,y0,x1,y1,w=22)=>J(cortes(corte(`M${x0} ${y0}L${x1} ${y1}`,w+18)),barra(x0,y0,x1,y1,w));

// ---------- piezas ----------
const moneda=(x,y,r,{simb='₽'}={})=>{ const s=r/100;
 const c=simb==='₽'?corte(`M${f(x-22*s)} ${f(y+44*s)}V${f(y-44*s)}H${f(x+12*s)}A${f(26*s)} ${f(26*s)} 0 0 1 ${f(x+12*s)} ${f(y+8*s)}H${f(x-22*s)}M${f(x-40*s)} ${f(y+24*s)}H${f(x+28*s)}`,Math.max(6,16*s)):simb?txt(x,y+r*.34,r*.95,simb):'';
 return [pz(E(x,y,r,r),x,E(x-r*.42,y-r*.42,r*.3,r*.13)),anillo(x,y,r*.76,Math.max(4,r*.08))+c]; };
const monedaPlana=(x,y,k=1)=>{ const rx=62*k, ry=22*k, t=16*k; return [rel(`M${f(x-rx)} ${f(y)}V${f(y+t)}A${f(rx)} ${f(ry)} 0 0 0 ${f(x+rx)} ${f(y+t)}V${f(y)}Z`,OSC)+rel(E(x,y,rx,ry),MED)+rel(E(x-rx*.3,y-ry*.3,rx*.3,ry*.25),CLA,' opacity=".8"'),`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx*.62)}" ry="${f(ry*.6)}" fill="none" stroke="#000" stroke-width="${f(4*k)}"/>`]; };
const pila=(x,y,n,k=1,sep=26)=>J(...Array.from({length:n},(_,i)=>monedaPlana(x,y-i*sep*k,k)));
const monedaCanto=(x,y,rot,k=1)=>g(`rotate(${rot} ${x} ${y})`,[rel(E(x+12*k,y,58*k,128*k),OSC)+rel(E(x,y,58*k,128*k),MED)+rel(E(x-22*k,y-40*k,12*k,40*k),CLA,' opacity=".85"'),`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(38*k)}" ry="${f(92*k)}" fill="none" stroke="#000" stroke-width="${f(8*k)}"/>`]);
const pokeball=(x,y,d,{boton=true,extra=''}={})=>{ const r=d/2; return [pz(E(x,y,r,r),x,E(x-r*.4,y-r*.5,r*.32,r*.15))+rel(`M${f(x-r)} ${f(y)}A${f(r)} ${f(r)} 0 0 0 ${f(x+r)} ${f(y)}Z`,OSC,' opacity=".25"'),
 corte(`M${f(x-r)} ${f(y)}H${f(x-r*.42)}M${f(x+r*.42)} ${f(y)}H${f(x+r)}`,Math.max(6,d*.07))+(boton?anillo(x,y,r*.3,Math.max(5,d*.06))+hueco(E(x,y,r*.1,r*.1)):'')+extra]; };
const cubo=(x,y,s,{izq='',der='',arr=''}={})=>{ const top=[[x,y-s],[x+s*.9,y-s*.5],[x,y],[x-s*.9,y-s*.5]], iz=[[x-s*.9,y-s*.5],[x,y],[x,y+s],[x-s*.9,y+s*.5]], de=[[x,y],[x+s*.9,y-s*.5],[x+s*.9,y+s*.5],[x,y+s]];
 return [rel(P(top),CLA)+rel(P(iz),MED)+rel(P(de),OSC),corte(`M${f(x)} ${f(y)}V${f(y+s)}M${f(x-s*.9)} ${f(y-s*.5)}L${f(x)} ${f(y)}L${f(x+s*.9)} ${f(y-s*.5)}`,Math.max(5,s*.07))+izq+der+arr]; };
const dado=(x,y,s,{q=false}={})=>{ const k=s/100; return cubo(x,y,s,{arr:hueco(E(x,y-s*.5,12*k,7*k)),izq:q?txt(x-s*.45,y+s*.48,s*.88,'?'):hueco(E(x-s*.45,y+s*.25,9*k,12*k))+hueco(E(x-s*.66,y-s*.02,8*k,11*k))+hueco(E(x-s*.24,y+s*.52,8*k,11*k)),der:hueco(E(x+s*.3,y+s*.08,9*k,12*k))+hueco(E(x+s*.62,y+s*.42,9*k,12*k))}); };
const regalo=(x,y,s)=>{ const k=s/220; return g(T(x,y,k),J(solo(pz(RR(-102,-14,204,160,16),0,RR(-88,0,60,10,5))+rel(P([[102,2],[134,-18],[134,122],[102,146]]),OSC)+pz(RR(-120,-54,240,56,14),0,RR(-104,-44,80,10,5))+rel(P([[120,-44],[148,-60],[148,-16],[120,2]]),OSC)+rel(E(-36,-80,40,26),MED)+rel(E(38,-80,40,26),MED)+rel(E(1,-64,18,18),CLA)),
 cortes(corte('M-18 -52V146M20 -52V146',8)+hueco(E(-36,-80,18,10))+hueco(E(38,-80,18,10))))); };
const saco=(x,y,s)=>{ const k=s/260; return g(T(x,y,k),J(solo(pz('M-44 -100C-100 -74 -124 -8 -118 46C-112 110 -60 138 0 138C60 138 112 110 118 46C124 -8 100 -74 44 -100Z',0,E(-64,-8,22,38))+rel('M-44 -100L-60 -142C-26 -128 26 -128 60 -142L44 -100Z',MED)+rel(RR(-54,-110,108,22,11),CLA)),cortes(corte('M-40 -98C-14 -90 14 -90 40 -98',6)))); };
const cofre=(x,y,s,{abierto=false}={})=>{ const k=s/260; return g(T(x,y,k),J(solo(pz(RR(-130,-10,260,130,14),0,RR(-114,4,60,10,5))+(abierto?rel('M-130 -10L-110 -100C-60 -120 60 -120 110 -100L130 -10Z',OSC)+rel(E(0,-14,90,26),CLA):pz('M-130 -10V-40C-130 -100 130 -100 130 -40V-10Z',0,E(-60,-60,40,12)))),
 cortes(corte('M-70 -80V120M70 -80V120',10)+(abierto?'':corte('M-130 -10H130',8))+hueco(RR(-18,6,36,44,8))))); };
const hucha=(x,y,s)=>{ const k=s/260; return g(T(x,y,k),J(solo(rel(RR(-80,64,34,46,8),MED)+rel(RR(28,64,34,46,8),OSC)+rel(P([[-66,-86],[-40,-128],[-14,-84]]),MED)+pz(E(0,0,118,100),0,E(-52,-46,30,14))+pz(RR(96,-30,48,58,16),120)),
 cortes(corte('M-40 -102H40',14)+hueco(E(46,-26,8,8))+corte('M110 -14V12',6)))); };
const copa=(x,y,s)=>{ const k=s/240; return g(T(x,y,k),J(solo(`<path d="M-92 -76C-130 -76 -130 -12 -76 -6M92 -76C130 -76 130 -12 76 -6" fill="none" stroke="${MED}" stroke-width="16"/>`+pz('M-96 -100H96C96 -4 52 36 0 40C-52 36 -96 -4 -96 -100Z',0,E(-52,-70,20,12))+rel(RR(-14,36,28,48,6),MED)+pz(RR(-64,80,128,26,8),0)),
 cortes(corte('M-60 -80H60',8)))); };
const corona=(x,y,w,{grieta=false}={})=>{ const k=w/280; return g(T(x,y,k),J(solo(pz(P([[-140,60],[-140,-50],[-90,6],[-46,-86],[0,4],[46,-86],[90,6],[140,-50],[140,60]]),0,E(-100,30,16,8))),
 cortes(corte('M-140 32H140',10)+hueco(E(-46,-38,10,10))+hueco(E(46,-38,10,10))+(grieta?corte('M-20 -60L10 -10L-14 20L18 70',12):'')))); };
const escudo=(x,y,h,{dentro=''}={})=>{ const k=h/240; return g(T(x,y,k),J(solo(pz('M-100 -112H100V0C100 68 52 104 0 124C-52 104 -100 68 -100 0Z',0,E(-56,-76,24,12))),cortes(`<path d="M-76 -88H76V0C76 52 40 80 0 96C-40 80 -76 52 -76 0Z" fill="none" stroke="#000" stroke-width="9"/>`+dentro))); };
const escudoHex=(x,y,d)=>{ const pts=poli(x,y,6,d/2,Math.PI/6); return [pz(P(pts),x,E(x-d*.2,y-d*.25,d*.12,d*.06)),`<path d="${P(poli(x,y,6,d*.38,Math.PI/6))}" fill="none" stroke="#000" stroke-width="${f(d*.04)}"/>`]; };
const espada=(x,y,len,rot=0)=>{ const k=len/300; return g(T(x,y,k,rot),J(solo(pz(P([[0,-150],[18,-122],[18,50],[-18,50],[-18,-122]]),0)+rel(RR(-62,46,124,22,10),CLA)+rel(RR(-12,68,24,56,8),MED)+rel(E(0,132,14,14),CLA)),cortes(corte('M0 -120V40',6)))); };
const garra=(x,y,h,rot=0)=>{ const k=h/260; return g(T(x,y,k,rot),J(solo(pz('M-30 130C-76 26 -50 -76 36 -140C0 -50 -6 38 36 130Z',0)),cortes(''))); };
const hueso=(x,y,len,rot=0)=>{ const k=len/240; return g(T(x,y,k,rot),J(solo([[-88,-20],[-88,20],[88,-20],[88,20]].map(([a,b])=>rel(E(a,b,26,26),a<0?MED:OSC)).join('')+pz(RR(-88,-20,176,40,20),0,RR(-60,-14,60,8,4))),cortes(''))); };
const pluma=(x,y,h,rot=0)=>{ const k=h/280; return g(T(x,y,k,rot),J(solo(pz('M0 -140C54 -70 54 70 0 124C-54 70 -54 -70 0 -140Z',0,E(-18,-60,8,30))),cortes(corte('M0 -110V150',8)+corte('M0 -40L-30 -66M0 10L-34 -16M0 60L-30 34M0 -40L30 -66M0 10L34 -16',5)))); };
const cuchara=(x,y,h,rot=0)=>{ const k=h/300; return g(T(x,y,k,rot),J(solo(pz(E(0,-80,52,68),0,E(-20,-108,12,22))+rel(RR(-13,-14,26,164,13),MED)),cortes(corte('M-26 -96C-14 -112 14 -112 26 -96',6)))); };
const gota=(x,y,h)=>{ const k=h/240; return g(T(x,y,k),J(solo(pz('M0 -120C46 -60 84 -10 84 40C84 92 46 122 0 122C-46 122 -84 92 -84 40C-84 -10 -46 -60 0 -120Z',0,E(-36,30,14,28))),cortes(''))); };
const corazon=(x,y,w,{partido=false}={})=>{ const k=w/240; return g(T(x,y,k),J(solo(pz('M0 100C-140 6 -128 -104 -58 -104C-24 -104 0 -82 0 -58C0 -82 24 -104 58 -104C128 -104 140 6 0 100Z',0,E(-62,-60,28,14))),cortes(partido?corte('M0 -56L-16 -16L14 14L-10 46L0 100',12):''))); };
const estrella=(x,y,r,{hue=0}={})=>[pz(est(x,y,r,5,.45),x,E(x-r*.3,y-r*.25,r*.14,r*.08)),hue?hueco(est(x,y,r*hue,5,.45)):''];
const hoja=(x,y,h,rot=0)=>{ const k=h/260; return g(T(x,y,k,rot),J(solo(pz('M0 -130C80 -76 88 48 0 130C-88 48 -80 -76 0 -130Z',0)),cortes(corte('M0 -100V120M0 -30L-36 -60M0 20L-40 -10M0 -30L36 -60M0 20L40 -10',7)))); };
const llama=(x,y,h,{nucleo=true}={})=>{ const k=h/300; const d='M0 150C-86 150 -126 92 -120 22C-116 -26 -94 -52 -84 -100C-60 -66 -54 -42 -40 -28C-46 -92 -14 -140 22 -186C18 -128 48 -100 72 -70C82 -94 82 -118 72 -140C116 -92 134 -14 126 52C118 114 70 150 0 150Z';
 return g(T(x,y,k),J(solo(pz(d,0)+(nucleo?`<g transform="translate(6 62) scale(.46)">${rel(d,CLA)}</g>`:'')),cortes(''))); };
const rayo=(x,y,h,rot=0)=>{ const k=h/300; return g(T(x,y,k,rot),J(solo(pz('M34 -150L-76 16H-4L-34 150L78 -24H6Z',4)),cortes(''))); };
const luna=(x,y,d,rot=0)=>{ const k=d/260; return g(T(x,y,k,rot),J(solo(pz('M24 -124A130 130 0 1 0 24 124A150 150 0 0 1 24 -124Z',-400,E(-70,-50,20,30))),cortes(''))); };
const ojo=(x,y,w)=>{ const k=w/320; return g(T(x,y,k),J(solo(pz('M-160 0C-80 -100 80 -100 160 0C80 100 -80 100 -160 0Z',0)+rel(E(0,0,58,58),CLA)),cortes(anillo(0,0,58,10)+hueco(E(0,0,24,24))))); };
const engranaje=(x,y,d,n=12)=>{ const r=d/2, pts=[]; for(let i=0;i<n*4;i++){ const a=2*Math.PI*i/(n*4)-Math.PI/2, rr=(i%4<2)?r:r*.82; pts.push([x+rr*Math.cos(a),y+rr*Math.sin(a)]); } return [pz(P(pts),x,E(x-r*.4,y-r*.5,r*.18,r*.08)),hueco(E(x,y,r*.36,r*.36))]; };
const cronometro=(x,y,r,{aguja=60}={})=>{ const a=(aguja-90)*Math.PI/180;
 return [rel(`${E(x,y,r,r)} ${E(x,y,r*.76,r*.76)}`,MED,' fill-rule="evenodd"')+rel(`M${x} ${f(y-r)}A${r} ${r} 0 0 1 ${x} ${f(y+r)}V${f(y+r*.76)}A${f(r*.76)} ${f(r*.76)} 0 0 0 ${x} ${f(y-r*.76)}Z`,OSC,' opacity=".55"')+rel(RR(x-r*.17,y-r*1.24,r*.34,r*.26,6),MED)+rel(RR(x-r*.29,y-r*1.34,r*.58,r*.16,6),CLA)+
  `<path d="M${x} ${y}L${f(x+Math.cos(a)*r*.62)} ${f(y+Math.sin(a)*r*.62)}" stroke="${CLA}" stroke-width="${f(r*.12)}" stroke-linecap="round"/>`+rel(E(x,y,r*.13,r*.13),CLA),
  corte(`M${x} ${f(y-r*.64)}V${f(y-r*.5)}M${f(x+r*.64)} ${y}H${f(x+r*.5)}M${x} ${f(y+r*.64)}V${f(y+r*.5)}M${f(x-r*.64)} ${y}H${f(x-r*.5)}`,6)]; };
const relojArena=(x,y,h)=>{ const k=h/300; return g(T(x,y,k),J(solo(rel(P([[-86,-114],[86,-114],[0,0]]),MED)+rel(P([[0,0],[86,114],[-86,114]]),MED)+rel(P([[0,0],[86,-114],[86,-90]]),OSC,' opacity=".5"')+rel(P([[-46,-58],[46,-58],[0,-6]]),CLA)+rel(P([[0,60],[60,108],[-60,108]]),CLA)+pz(RR(-110,-150,220,36,12),0)+pz(RR(-110,114,220,36,12),0)),cortes(''))); };
const calendario=(x,y,w,h,dentro=['',''])=>J([pz(RR(x-w/2,y-h/2,w,h,w*.08),x)+rel(RR(x-w/2,y-h/2,w,h*.24,w*.08),CLA)+rel(RR(x-w*.28,y-h/2-20,22,46,11),MED)+rel(RR(x+w*.28-22,y-h/2-20,22,46,11),MED),corte(`M${f(x-w/2)} ${f(y-h/2+h*.24)}H${f(x+w/2)}`,8)],dentro);
const carta=(x,y,w,h,rot=0,dentro='')=>g(`rotate(${rot} ${x} ${y})`,[pz(RR(x-w/2,y-h/2,w,h,w*.12),x,RR(x-w/2+10,y-h/2+10,w*.3,8,4)),`<path d="${RR(x-w/2+w*.1,y-h/2+h*.1,w*.8,h*.8,w*.07)}" fill="none" stroke="#000" stroke-width="${f(Math.max(4,w*.05))}"/>`+dentro]);
const libro=(x,y,w,{abierto=true}={})=>{ const k=w/300; return g(T(x,y,k),abierto?J(solo(pz('M0 -80C-50 -104 -104 -104 -150 -88V80C-104 64 -50 64 0 88Z',-400,E(-100,-50,24,8))+rel('M0 -80C50 -104 104 -104 150 -88V80C104 64 50 64 0 88Z',OSC)),cortes(corte('M0 -80V88',8)+corte('M-120 -50C-90 -60 -50 -60 -24 -48M-120 -10C-90 -20 -50 -20 -24 -8M24 -48C50 -60 90 -60 120 -50M24 -8C50 -20 90 -20 120 -10',6))):
 J(solo(pz(RR(-104,-140,208,268,16),0,RR(-84,-120,40,12,6))+rel(RR(-110,-140,30,268,12),CLA)),cortes(corte('M-70 -140V128',6)+hueco(P([[40,-150],[74,-150],[74,-60],[57,-76],[40,-60]]))))); };
const matraz=(x,y,h)=>{ const k=h/300; const d='M-30 -150H30V-58L106 84C120 112 102 140 72 140H-72C-102 140 -120 112 -106 84L-30 -58Z';
 return g(T(x,y,k),J(solo(pz(d,0,E(-14,-100,8,24))+`<clipPath id="mt${N}"><path d="${d}"/></clipPath><rect x="-130" y="40" width="260" height="110" fill="${CLA}" clip-path="url(#mt${N++})"/>`),cortes(corte('M-44 -150H44',10)+corte('M-80 40H80',8)))); };
const yunque=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(pz(P([[-100,-20],[100,-20],[60,40],[-60,40]]),0)+rel(P([[-100,-58],[-170,-50],[-100,-20]]),MED)+pz(RR(-70,36,140,44,8),0)+pz(RR(-114,-62,228,44,10),0,RR(-100,-54,90,10,5))),cortes(corte('M-114 -20H114',8)))); };
const martillo=(x,y,h,rot=0)=>{ const k=h/300; return g(T(x,y,k,rot),J(solo(rel(RR(-14,-60,28,210,14),MED)+pz(RR(-80,-130,160,76,14),0,RR(-66,-120,60,10,5))),cortes(corte('M-30 -130V-54M30 -130V-54',6)))); };
const iman=(x,y,h,rot=0)=>{ const k=h/260; return g(T(x,y,k,rot),J(solo(`<path d="M-62 -60V20A62 62 0 0 0 62 20V-60" fill="none" stroke="${MED}" stroke-width="56"/><path d="M62 -60V20A62 62 0 0 1 20 79" fill="none" stroke="${OSC}" stroke-width="56" opacity=".45"/>`+rel(RR(-90,-120,56,50,8),CLA)+rel(RR(34,-120,56,50,8),CLA)),cortes(corte('M-90 -66H-34M34 -66H90',10)))); };
const guante=(x,y,h,rot=0)=>{ const k=h/280; return g(T(x,y,k,rot),J(solo(pz('M-90 40C-110 -40 -90 -130 -4 -140C80 -148 116 -84 108 -10C104 26 94 44 82 50Z',10,E(-40,-96,30,12))+rel('M-88 34C-130 24 -132 -40 -96 -48C-78 -50 -68 -36 -70 -18Z',MED)+pz(RR(-82,46,164,80,16),10)),
 cortes(corte('M-70 -18C-62 8 -64 24 -78 42',8)+corte('M-82 74H82',12)))); };
const mancuerna=(x,y,w,rot=0)=>{ const k=w/300; return g(T(x,y,k,rot),J(solo(rel(RR(-100,-12,200,24,12),MED)+[[-130,1],[94,0]].map(([a])=>pz(RR(a,-66,36,132,10),a+18)).join('')+[[-150],[132]].map(([a])=>pz(RR(a,-42,20,84,8),a+10)).join('')),cortes(''))); };
const diana=(x,y,d)=>[pz(E(x,y,d/2,d/2),x,E(x-d*.2,y-d*.24,d*.1,d*.05)),anillo(x,y,d*.34,d*.06)+anillo(x,y,d*.17,d*.06)];
const lupa=(x,y,d,rot=0,dentro=['',''])=>J(g(T(x,y,d/200,rot),[rel(`${E(0,0,82,82)} ${E(0,0,62,62)}`,MED,' fill-rule="evenodd"')+rel(RR(56,50,28,110,14),MED,' transform="rotate(-45 70 105)"'),'']),dentro);
const candado=(x,y,h)=>{ const k=h/280; return g(T(x,y,k),J(solo(`<path d="M-62 -10V-60C-62 -140 62 -140 62 -60V-10" fill="none" stroke="${MED}" stroke-width="30"/>`+pz(RR(-100,-20,200,150,24),0,RR(-84,-6,60,12,6))),cortes(hueco(E(0,38,18,18))+hueco(RR(-8,40,16,46,6))))); };
const maletin=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(`<path d="M-50 -90V-112C-50 -130 50 -130 50 -112V-90" fill="none" stroke="${MED}" stroke-width="22"/>`+pz(RR(-150,-92,300,190,22),0,RR(-134,-78,70,12,6))),cortes(corte('M-150 -30H150',8)+txt(0,74,120,'R')))); };
const nube=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(pz('M-120 60H120C152 60 160 12 128 -4C132 -48 92 -72 56 -52C40 -96 -28 -104 -52 -60C-92 -72 -132 -36 -120 4C-152 16 -148 60 -120 60Z',0,E(-60,-30,26,10))),cortes(''))); };
const montana=(x,y,w,h)=>[rel(P([[x-w/2,y+h/2],[x,y-h/2],[x+w/2,y+h/2]]),MED)+rel(P([[x,y-h/2],[x+w/2,y+h/2],[x+w*.1,y+h/2]]),OSC,' opacity=".55"')+rel(P([[x,y-h/2],[x+w*.12,y-h/2+h*.26],[x-w*.12,y-h/2+h*.26]]),CLA),''];
const bandera=(x,y,h)=>[rel(RR(x-8,y-h/2,16,h,8),MED)+rel(P([[x+8,y-h/2+6],[x+8+h*.55,y-h/2+h*.2],[x+8,y-h/2+h*.4]]),CLA),''];
const flecha=(x,y,h,rot=0)=>{ const k=h/300; return g(T(x,y,k,rot),J(solo(pz(P([[0,-150],[110,-30],[44,-30],[44,150],[-44,150],[-44,-30],[-110,-30]]),0,RR(-34,-60,14,120,7))),cortes(''))); };
const velocimetro=(x,y,w,ang=-40)=>{ const k=w/300, a=ang*Math.PI/180; return g(T(x,y,k),J(solo(rel('M-140 0A140 140 0 0 1 140 0H104A104 104 0 0 0 -104 0Z',MED)+rel('M0 -140A140 140 0 0 1 140 0H104A104 104 0 0 0 0 -104Z',OSC,' opacity=".5"')+`<path d="M0 0L${f(Math.cos(a)*110)} ${f(Math.sin(a)*110)}" stroke="${CLA}" stroke-width="16" stroke-linecap="round"/>`+rel(E(0,0,20,20),CLA)),cortes(corte('M-122 -2L-92 -2M-86 -86L-66 -66M0 -122V-92M86 -86L66 -66',8)))); };
const ticket=(x,y,w,rot=0,dentro='')=>{ const k=w/320; return g(T(x,y,k,rot),J(solo(pz(RR(-160,-90,320,180,22),0,RR(-144,-76,120,12,6))),cortes(hueco(E(-160,0,30,30))+hueco(E(160,0,30,30))+corte('M-76 -76V76',6)+dentro))); };
const emblemaHex=(x,y,d,simb='')=>{ const pts=poli(x,y,6,d/2,Math.PI/6); return [pz(P(pts),x,E(x-d*.2,y-d*.26,d*.12,d*.06))+rel(E(x,y,d*.22,d*.22),CLA),`<path d="${P(poli(x,y,6,d*.4,Math.PI/6))}" fill="none" stroke="#000" stroke-width="${f(d*.035)}"/>`+anillo(x,y,d*.22,d*.035)+simb]; };
const simboloTipo=(t,x,y,s)=>({fuego:hueco(`M${x} ${y-s}C${x+s*.8} ${y-s*.2} ${x+s*.7} ${y+s} ${x} ${y+s}C${x-s*.7} ${y+s} ${x-s*.8} ${y-s*.2} ${x} ${y-s}Z`),
 agua:hueco(`M${x} ${y-s}C${x+s*.5} ${y-s*.3} ${x+s*.75} ${y+s*.1} ${x+s*.75} ${y+s*.35}C${x+s*.75} ${y+s*.8} ${x+s*.4} ${y+s} ${x} ${y+s}C${x-s*.4} ${y+s} ${x-s*.75} ${y+s*.8} ${x-s*.75} ${y+s*.35}C${x-s*.75} ${y+s*.1} ${x-s*.5} ${y-s*.3} ${x} ${y-s}Z`),
 planta:hueco(`M${x} ${y-s}C${x+s*.8} ${y-s*.4} ${x+s*.8} ${y+s*.5} ${x} ${y+s}C${x-s*.8} ${y+s*.5} ${x-s*.8} ${y-s*.4} ${x} ${y-s}Z`),
 rayo:hueco(`M${x+s*.2} ${y-s}L${x-s*.5} ${y+s*.1}H${x}L${x-s*.2} ${y+s}L${x+s*.5} ${y-s*.15}H${x}Z`),
 estrella:hueco(est(x,y,s,5,.45)), escudo:hueco(`M${x-s*.7} ${y-s*.8}H${x+s*.7}V${y}C${x+s*.7} ${y+s*.5} ${x+s*.35} ${y+s*.8} ${x} ${y+s}C${x-s*.35} ${y+s*.8} ${x-s*.7} ${y+s*.5} ${x-s*.7} ${y}Z`),
 '1':txt(x,y+s*.6,s*1.7,'1'),'3':txt(x,y+s*.6,s*1.7,'3')})[t]||'';
const pokeHueco=(x,y,r)=>anillo(x,y,r,r*.18)+corte(`M${f(x-r)} ${f(y)}H${f(x+r)}`,r*.18)+hueco(E(x,y,r*.32,r*.32));
const remolino=(cx,cy,R)=>J(...[0,180].map(a=>solo(`<g transform="rotate(${a} ${cx} ${cy}) translate(${cx-256} ${cy-256}) scale(1)">${rel(`M256 ${256-R}C${256+R*.64} ${256-R} ${256+R*1.0} ${256-R*.5} ${256+R*.96} 256C${256+R*.88} ${256-R*.4} ${256+R*.54} ${256-R*.74} ${256+R*.07} ${256-R*.76}C${256-R*.24} ${256-R*.77} ${256-R*.44} ${256-R*.67} ${256-R*.6} ${256-R*.55}C${256-R*.44} ${256-R*.82} ${256-R*.24} ${256-R} 256 ${256-R}Z`,MED)}</g>`)));
const mano=(x,y,s,espejo=false)=>{ const k=s/200; return g(`translate(${x} ${y}) scale(${espejo?-k:k} ${k})`,J(solo(pz('M-10 60C-60 60 -120 30 -126 -20C-128 -36 -112 -42 -102 -30L-74 0C-78 -26 -74 -50 -58 -50C-44 -50 -40 -36 -40 -20V8H-10Z',-400,E(-90,-10,10,6))),cortes(''))); };
const fantasma=(x,y,h)=>{ const k=h/280; return g(T(x,y,k),J(solo(pz('M-110 140V-20C-110 -96 -60 -140 0 -140C60 -140 110 -96 110 -20V140L72 104L36 140L0 104L-36 140L-72 104Z',0,E(-60,-80,20,28))),cortes(hueco(E(-36,-30,18,28))+hueco(E(36,-30,18,28))))); };
const casilla=(x,y,d,tono=MED)=>[rel(P(poli(x,y,6,d/2,Math.PI/6)),tono),''];

// ---------- más piezas ----------
const caramelo=(x,y,w,rot=0)=>{ const k=w/300; return g(T(x,y,k,rot),J(solo(rel(P([[-88,-10],[-150,-58],[-138,0],[-150,58],[-88,10]]),MED)+rel(P([[88,-10],[150,-58],[138,0],[150,58],[88,10]]),OSC)+pz(E(0,0,96,68),0,E(-36,-34,30,10))),cortes(corte('M-56 -50L-8 58M-6 -64L46 50M42 -60L80 14',10)))); };
const huevo=(x,y,h,{grieta=false,q=false,manchas=false}={})=>{ const k=h/300; return g(T(x,y,k),J(solo(pz('M0 -150C72 -150 116 -40 116 36C116 108 64 150 0 150C-64 150 -116 108 -116 36C-116 -40 -72 -150 0 -150Z',0,E(-50,-64,24,40))),
 cortes((grieta?corte('M-88 -40L-52 -16L-28 -50L6 -18L34 -52L64 -22L90 -44',9):'')+(q?txt(0,100,120,'?'):'')+(manchas?hueco(E(-40,40,16,16))+hueco(E(44,6,20,20))+hueco(E(18,84,13,13))+hueco(E(-14,-60,11,11)):'')))); };
const carrito=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(`<path d="M-150 -96H-114L-90 64H96" fill="none" stroke="${MED}" stroke-width="18" stroke-linejoin="round" stroke-linecap="round"/>`+pz(P([[-106,-66],[130,-66],[106,40],[-88,40]]),10,RR(-92,-56,80,10,5))+rel(E(-62,96,22,22),MED)+rel(E(74,96,22,22),OSC)),cortes(corte('M-50 -50V26M10 -50V26M70 -50V26',10)+hueco(E(-62,96,8,8))+hueco(E(74,96,8,8))))); };
const antifaz=(x,y,w)=>{ const k=w/360; return g(T(x,y,k),J(solo(pz('M-180 0C-180 -60 -106 -76 -50 -56C-26 -48 -10 -34 0 -20C10 -34 26 -48 50 -56C106 -76 180 -60 180 0C180 60 114 80 58 62C34 54 14 42 0 30C-14 42 -34 54 -58 62C-114 80 -180 60 -180 0Z',0,E(-110,-40,30,8))),cortes(hueco(E(-86,2,46,28))+hueco(E(86,2,46,28))))); };
const gorro=(x,y,w)=>{ const k=w/300; return g(T(x,y,k),J(solo(pz(P([[-80,-10],[80,-10],[80,56],[-80,56]]),0)+pz(P([[0,-92],[152,-28],[0,36],[-152,-28]]),0,E(-60,-34,30,8))+`<path d="M100 -28V60" stroke="${CLA}" stroke-width="8"/>`+rel(E(100,72,16,16),CLA)),cortes(corte('M-80 -10Q0 20 80 -10',8)))); };
const gema=(x,y,h)=>{ const s=h/260, pts=[[0,-130],[100,-50],[100,50],[0,130],[-100,50],[-100,-50]].map(([a,b])=>[x+a*s,y+b*s]);
 return [pts.map((p,i)=>rel(P([[x,y],p,pts[(i+1)%6]]),[MED,CLA,OSC,MED,CLA,OSC][i])).join(''),pts.map(p=>corte(`M${x} ${y}L${f(p[0])} ${f(p[1])}`,5)).join('')]; };
const ala=(x,y,s,dir=1)=>{ const k=s/300; return g(`translate(${x} ${y}) scale(${dir*k} ${k})`,J(...[0,1,2].map(i=>solo(`<g transform="rotate(${-55+i*24})">${pz(RR(0,-22,190-i*34,44,22),-900)}</g>`)))); };
const lista=(x,y,h,marcadas=2)=>{ const k=h/300; return g(T(x,y,k),J(solo(pz(RR(-110,-150,220,300,18),0,RR(-94,-136,50,10,5))),cortes([-80,0,80].map((b,i)=>`<rect x="-80" y="${b-20}" width="40" height="40" rx="8" fill="none" stroke="#000" stroke-width="8"/>`+corte(`M-10 ${b}H80`,10)+(i<marcadas?corte(`M-70 ${b}L-60 ${b+10}L-44 ${b-10}`,8):'')).join('')))); };
const escalera=(x,y,n,w,h)=>{ const bw=w/n; return [Array.from({length:n},(_,i)=>pz(RR(x-w/2+i*bw,y+h/2-(i+1)*h/n,bw-6,(i+1)*h/n,8),x-w/2+i*bw+bw/2)).join(''),'']; };
const rombo=(x,y,s,tono=MED)=>[rel(P([[x,y-s/2],[x+s*.4,y],[x,y+s/2],[x-s*.4,y]]),tono)+rel(P([[x,y-s/2],[x+s*.4,y],[x,y+s/2]]),OSC,' opacity=".5"'),''];
const lazo=(x,y,s)=>{ const k=s/100; return [rel(E(x-26*k,y,26*k,16*k),MED)+rel(E(x+26*k,y,26*k,16*k),MED)+rel(E(x,y,10*k,10*k),CLA),hueco(E(x-26*k,y,11*k,6*k))+hueco(E(x+26*k,y,11*k,6*k))]; };

module.exports={caramelo,huevo,carrito,antifaz,gorro,gema,ala,lista,escalera,rombo,lazo,OSC,MED,CLA,E,RR,P,poli,est,rel,corte,hueco,anillo,txt,g,J,solo,cortes,pz,T,f,uid,
 estela,aro,aroDe,destello,destellos,chevron,subir,bajar,barrido,mas,barra,tacha,
 moneda,monedaPlana,pila,monedaCanto,pokeball,cubo,dado,regalo,saco,cofre,hucha,copa,corona,escudo,escudoHex,espada,garra,hueso,pluma,cuchara,gota,corazon,estrella,hoja,llama,rayo,luna,ojo,engranaje,cronometro,relojArena,calendario,carta,libro,matraz,yunque,martillo,iman,guante,mancuerna,diana,lupa,candado,maletin,nube,montana,bandera,flecha,velocimetro,ticket,emblemaHex,simboloTipo,pokeHueco,remolino,mano,fantasma,casilla};

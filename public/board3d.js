/* =====================================================================
   POKÉ TACTICS · Tablero 3D (solo navegador)
   Pinta el tablero, las arenas, los Pokémon (modelos 3D de Pokemon-3D-api) y los
   efectos con three.js. No toca la lógica: game.js le pasa en cada fotograma qué hay
   en pantalla (posiciones en "píxeles de tablero") y dibuja encima la capa 2D (barras, textos).
   ===================================================================== */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// d: número de la Pokédex (carpeta regular) o 'carpeta/número' para formas especiales (mega/3, x/6, y/9…)
const MODEL_URL=d=>`https://cdn.jsdelivr.net/gh/Pokemon-3D-api/assets@main/models/opt/${String(d).includes('/')?d:'regular/'+d}.glb`;
// Segundo intento directamente desde GitHub (jsDelivr rechaza algunos archivos grandes)
const MODEL_RAW=d=>`https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/${String(d).includes('/')?d:'regular/'+d}.glb`;
const SPRITE_URL=d=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${d}.png`;
const TAU=Math.PI*2, clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,k)=>a+(b-a)*k;
const col=c=>new THREE.Color(c);

let renderer, scene, camera, clock=new THREE.Clock(), ready=false, camDist=30;
// Mapa de píxeles de tablero (los de game.js) a mundo: 1 unidad = radio de una casilla
const M={cx:0,cz:0,R:30,W:600,H:600,rect:{x:0,y:0,w:600,h:600}};
const W3=(x,y,h=0)=>new THREE.Vector3((x-M.cx)/M.R,h,(y-M.cz)/M.R);
const TOP=.2; // altura de la cara superior de las casillas
const ccache={}, ccol=c=>ccache[c]||(ccache[c]=new THREE.Color(c)); // colores de solo lectura (sin crear uno por fotograma)

/* ---------- calidad ---------- */
// 2 = alta, 1 = media, 0 = baja (sin sombras, 1 píxel por píxel CSS, menos partículas y público quieto).
// Móviles y equipos modestos empiezan en media; si los FPS no llegan, baja sola (nunca sube, para no ir a tirones).
const QL=[{pr:1,shadow:0,part:.35,crowd:false},{pr:1.5,shadow:1024,part:.6,crowd:true},{pr:2,shadow:2048,part:1,crowd:true}];
let qLevel=2, Q=QL[2], dpr0=1;
function guessQuality(){
 const mob=(window.matchMedia&&matchMedia('(pointer:coarse)').matches)||/Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
 return mob||(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4?1:2;
}

/* ---------- utilidades de dibujo ---------- */
function canvasTex(w,h,paint,nearest=true){
 const c=document.createElement('canvas'); c.width=w; c.height=h; paint(c.getContext('2d'),w,h);
 // De cerca, píxeles nítidos (aire pixel art); de lejos, mipmaps y filtrado anisótropo para que el suelo no tiemble ni se vea borroso
 const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; if(nearest){ t.magFilter=THREE.NearestFilter; t.minFilter=THREE.LinearMipmapLinearFilter; t.generateMipmaps=true; t.anisotropy=8; } return t;
}
function seeded(s){ return ()=>{ s=(s*16807)%2147483647; return (s-1)/2147483646; }; }
const glowTex=canvasTex(64,64,(g,w)=>{ const r=g.createRadialGradient(32,32,0,32,32,32); r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(.35,'rgba(255,255,255,.55)'); r.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=r; g.fillRect(0,0,w,w); },false);
function roundRectShape(x0,z0,x1,z1,rad){ const s=new THREE.Shape(); s.moveTo(x0+rad,z0); s.lineTo(x1-rad,z0); s.quadraticCurveTo(x1,z0,x1,z0+rad); s.lineTo(x1,z1-rad); s.quadraticCurveTo(x1,z1,x1-rad,z1); s.lineTo(x0+rad,z1); s.quadraticCurveTo(x0,z1,x0,z1-rad); s.lineTo(x0,z0+rad); s.quadraticCurveTo(x0,z0,x0+rad,z0); return s; }
// Losa con la cara de arriba en y=top (la forma se dibuja en XZ)
function slab(shape,depth,top,sideCol,topTex,topCol){
 const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.08,bevelThickness:.08,bevelSegments:2,curveSegments:8});
 g.rotateX(Math.PI/2); g.translate(0,top,0);
 const side=new THREE.MeshStandardMaterial({color:sideCol,roughness:.9,flatShading:true});
 const m=new THREE.Mesh(g,side); m.receiveShadow=true; m.castShadow=true;
 const sg=new THREE.ShapeGeometry(shape,12); sg.rotateX(Math.PI/2);
 // UV de la cara de arriba en [0,1] según su caja
 sg.computeBoundingBox(); const bb=sg.boundingBox, uv=sg.attributes.uv, pos=sg.attributes.position;
 for(let i=0;i<pos.count;i++) uv.setXY(i,(pos.getX(i)-bb.min.x)/(bb.max.x-bb.min.x),1-(pos.getZ(i)-bb.min.z)/(bb.max.z-bb.min.z));
 const t=new THREE.Mesh(sg,new THREE.MeshStandardMaterial({map:topTex||null,color:topCol||0xffffff,roughness:.95,side:THREE.DoubleSide}));
 t.position.y=top+.085; t.receiveShadow=true; m.add(t); return m;
}

/* ---------- partículas ---------- */
const PART_MAX=3200;
function makeParticles(additive){
 const geo=new THREE.BufferGeometry();
 const pos=new Float32Array(PART_MAX*3), pc=new Float32Array(PART_MAX*3), sz=new Float32Array(PART_MAX), al=new Float32Array(PART_MAX);
 geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('pcol',new THREE.BufferAttribute(pc,3));
 geo.setAttribute('size',new THREE.BufferAttribute(sz,1)); geo.setAttribute('alpha',new THREE.BufferAttribute(al,1));
 const mat=new THREE.ShaderMaterial({uniforms:{uScale:{value:400}},transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
  vertexShader:`attribute vec3 pcol;attribute float size;attribute float alpha;varying vec3 vC;varying float vA;uniform float uScale;
   void main(){vC=pcol;vA=alpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`varying vec3 vC;varying float vA;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=${additive?'pow(1.-d*2.,1.6)':'smoothstep(.5,.35,d)'};gl_FragColor=vec4(vC,a*vA);}`});
 const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; pts.renderOrder=10;
 const P={pts,n:0,list:[],geo,mat,pos,pc,sz,al};
 return P;
}
let PA,PN; // aditivas (luz) y normales (humo, rocas, hojas)
function emit(o){
 if(Q.part<1&&Math.random()>Q.part) return; // en calidad media o baja se emite solo una parte
 const P=o.add===false?PN:PA; if(P.list.length>=PART_MAX) return;
 const c=o.col instanceof THREE.Color?o.col:col(o.col||'#fff');
 P.list.push({x:o.p.x,y:o.p.y,z:o.p.z,vx:o.v?o.v[0]:0,vy:o.v?o.v[1]:0,vz:o.v?o.v[2]:0,r:c.r,g:c.g,b:c.b,s:o.size||.25,s1:o.size1!=null?o.size1:(o.size||.25)*.3,life:o.life||.6,t:0,gr:o.g||0,dr:o.drag||0,a:o.alpha==null?1:o.alpha});
}
function stepParticles(P,dt){
 const L=P.list; let j=0;
 for(let i=0;i<L.length;i++){ const q=L[i]; q.t+=dt; if(q.t>=q.life) continue;
   q.vy-=q.gr*dt; const k=1-Math.min(1,q.dr*dt); q.vx*=k; q.vy*=k; q.vz*=k; q.x+=q.vx*dt; q.y+=q.vy*dt; q.z+=q.vz*dt;
   if(q.y<TOP&&q.gr>0){ q.y=TOP; q.vy*=-.3; q.vx*=.6; q.vz*=.6; }
   L[j++]=q; }
 L.length=j;
 for(let i=0;i<j;i++){ const q=L[i], f=q.t/q.life;
   P.pos[i*3]=q.x; P.pos[i*3+1]=q.y; P.pos[i*3+2]=q.z; P.pc[i*3]=q.r; P.pc[i*3+1]=q.g; P.pc[i*3+2]=q.b;
   P.sz[i]=lerp(q.s,q.s1,f); P.al[i]=q.a*(f<.15?f/.15:1-(f-.15)/.85); }
 P.geo.setDrawRange(0,j); for(const k of ['position','pcol','size','alpha']) P.geo.attributes[k].needsUpdate=true;
}
const rnd=(a=1)=>(Math.random()*2-1)*a;
function burst(p,c,n,speed,o={}){ for(let i=0;i<n;i++){ const a=Math.random()*TAU, s=speed*(.4+Math.random()*.6), up=o.up!=null?o.up:speed*.6; emit({p:p.clone().add(new THREE.Vector3(rnd(o.spread||.1),rnd(o.spread||.1)*.5,rnd(o.spread||.1))),v:[Math.cos(a)*s,up*(.3+Math.random()),Math.sin(a)*s],col:Array.isArray(c)?c[i%c.length]:c,size:o.size||.25,size1:o.size1,life:(o.life||.5)*(.6+Math.random()*.6),g:o.g||0,drag:o.drag||2,add:o.add}); } }

/* ---------- estilo de cada elemento ---------- */
// colores [oscuro, medio, claro] y comportamiento de sus partículas
const EL={
 'Fuego':{c:['#ff3d14','#ff9a1f','#ffe066'],g:-2.5,drag:2,life:.55},
 'Agua':{c:['#1565ff','#4fc3ff','#e0f7ff'],g:7,drag:1,life:.6},
 'Planta':{c:['#1f8a34','#6ccf4e','#e0ff9e'],g:.6,drag:2.5,life:.9,add:false},
 'Eléctrico':{c:['#ffc400','#fff27a','#ffffff'],g:0,drag:5,life:.3},
 'Psíquico':{c:['#c2338c','#ff6fd0','#ffd6f2'],g:-.6,drag:3,life:.7},
 'Roca':{c:['#6b4f2a','#a3824f','#d9c39a'],g:9,drag:.6,life:.8,add:false},
 'Dragón':{c:['#3d2bbf','#7a68ff','#d0c9ff'],g:-.8,drag:2.5,life:.6},
 'Fantasma':{c:['#2c1a4d','#7b52c7','#d2b8ff'],g:-1.2,drag:3,life:.9},
 'Hada':{c:['#ff5fae','#ffb0da','#ffffff'],g:-.6,drag:3,life:.8},
 'Normal':{c:['#a8a48a','#e8e4d0','#ffffff'],g:0,drag:3,life:.45},
 'Acero':{c:['#6f7f96','#c4d0e0','#ffffff'],g:3,drag:2,life:.45},
 'Siniestro':{c:['#1a1028','#4c2f6e','#a07cc9'],g:-.6,drag:2.5,life:.8,add:false},
 'Lucha':{c:['#a8321c','#ff7043','#ffd2a8'],g:0,drag:4,life:.4},
 'Hielo':{c:['#5fb8ff','#bff0ff','#ffffff'],g:2,drag:2,life:.7},
 'Veneno':{c:['#6a1b9a','#b25bd6','#e9b8ff'],g:-.4,drag:2,life:.8},
};
const elOf=f=>EL[f.el]||{c:[f.color||'#ffffff',f.color||'#ffffff','#ffffff'],g:0,drag:3,life:.5};
function elBurst(el,p,n,speed,o={}){ burst(p,el.c,n,speed,{g:el.g,drag:el.drag,life:el.life,add:el.add,...o}); }

/* ---------- arenas ---------- */
const arenas={}; let board={}, hexMesh=null, hexRing=null, benchPads=null, curArena='';
function buildBoard(G){
 if(board.group){ scene.remove(board.group); board.group.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); }
 const grp=new THREE.Group(); board={group:grp,G};
 // casillas: prismas hexagonales con colores por instancia (tu mitad azul, la rival roja)
 const hg=new THREE.CylinderGeometry(.9,.94,.16,6,1); hg.translate(0,TOP-.08,0);
 hexMesh=new THREE.InstancedMesh(hg,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85,transparent:true,opacity:.4,flatShading:true}),56);
 // el anillo de 6 lados empieza con un vértice en +X; girado 90° coincide con el prisma (vértice hacia +Z)
 const rg=new THREE.RingGeometry(.84,.93,6,1); rg.rotateX(-Math.PI/2); rg.rotateY(Math.PI/2);
 hexRing=new THREE.InstancedMesh(rg,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.75,depthWrite:false}),56);
 const m4=new THREE.Matrix4();
 G.cells.forEach(([x,y],i)=>{ const p=W3(x,y); m4.makeTranslation(p.x,0,p.z); hexMesh.setMatrixAt(i,m4); m4.makeTranslation(p.x,TOP+.012,p.z); hexRing.setMatrixAt(i,m4); hexMesh.setColorAt(i,col(i>=28?'#cfe2ff':'#ffd9cf')); });
 hexMesh.receiveShadow=true; grp.add(hexMesh,hexRing);
 // ranuras del banquillo
 const bg=new THREE.BoxGeometry(1,.1,1); benchPads=new THREE.InstancedMesh(bg,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8}),9);
 const s=G.bs/M.R*.82;
 G.bench.forEach(([x,y],i)=>{ const p=W3(x,y); m4.makeScale(s,1,s).setPosition(p.x,TOP-.02,p.z); benchPads.setMatrixAt(i,m4); benchPads.setColorAt(i,col('#3a2a20')); });
 benchPads.receiveShadow=true; grp.add(benchPads);
 scene.add(grp);
 for(const k in arenas){ scene.remove(arenas[k]); } for(const k in arenas) delete arenas[k];
 curArena='';
}
// Rectángulos (en mundo) de la plataforma del tablero y del banquillo
function boardRects(){
 const G=board.G, R=M.R;
 const a=W3(G.ox-R*.5,G.pad*.4), b=W3(G.ox+G.bw+R*.5,G.pad+G.bh+R*.05);
 const c=W3(G.ox-R*.2,G.pad+G.bh+18-R*.1), d=W3(G.ox+G.bw+R*.2,G.pad+G.bh+18+G.bs+R*.1);
 return {bx0:a.x,bz0:a.z,bx1:b.x,bz1:b.z,cx0:c.x,cz0:c.z,cx1:d.x,cz1:d.z};
}
function fieldTex(kind){
 return canvasTex(160,180,(g,w,h)=>{
  const r=seeded(kind==='route'?7:3);
  if(kind==='route'){
   g.fillStyle='#58a838'; g.fillRect(0,0,w,h);
   for(let k=-h;k<w;k+=14){ g.fillStyle='rgba(152,216,96,.35)'; for(let j=0;j<h;j++) g.fillRect(k+j*.5,j,7,1); }
   for(let j=0;j<h;j++){ const x=w/2+Math.sin(j/h*Math.PI*1.4+.5)*22; g.fillStyle='#c8a060'; g.fillRect(x-17,j,34,1); g.fillStyle='#e0c088'; g.fillRect(x-15,j,30,1); if(r()<.3){ g.fillStyle='#a07840'; g.fillRect(x-15+r()*30,j,1,1); } }
   for(let i=0;i<260;i++){ g.fillStyle=r()<.5?'#387820':'#b8f080'; g.fillRect(r()*w|0,r()*h|0,1,1); }
   for(let i=0;i<40;i++){ const x=r()*w|0, y=r()*h|0; g.fillStyle=['#f05878','#f8f8f8','#f8a8c8'][i%3]; g.fillRect(x,y-1,1,3); g.fillRect(x-1,y,3,1); g.fillStyle='#f8e070'; g.fillRect(x,y,1,1); }
  } else {
   const mid=h*.47;
   g.fillStyle='#f09878'; g.fillRect(0,0,w,mid); g.fillStyle='#88b0f0'; g.fillRect(0,mid,w,h-mid);
   for(let y=0;y<h;y+=12){ g.fillStyle=y<mid?'#f4a488':'#98bcf4'; g.fillRect(0,y,w,6); }
   g.fillStyle='#f8f8f8'; g.fillRect(6,6,w-12,2); g.fillRect(6,h-8,w-12,2); g.fillRect(6,6,2,h-12); g.fillRect(w-8,6,2,h-12); g.fillRect(6,mid-1,w-12,3);
   const bx=w/2, br=20; g.beginPath(); g.arc(bx,mid,br+2,0,TAU); g.fillStyle='#283040'; g.fill(); g.beginPath(); g.arc(bx,mid,br,Math.PI,TAU); g.fillStyle='#f04830'; g.fill(); g.beginPath(); g.arc(bx,mid,br,0,Math.PI); g.fillStyle='#f8f8f8'; g.fill();
   g.fillStyle='#283040'; g.fillRect(bx-br,mid-2,br*2,4); g.beginPath(); g.arc(bx,mid,7,0,TAU); g.fill(); g.beginPath(); g.arc(bx,mid,4,0,TAU); g.fillStyle='#f8f8f8'; g.fill();
  }
 });
}
function tree(x,z,s,r,leaf){
 const t=new THREE.Group();
 const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12*s,.18*s,.9*s,6),new THREE.MeshStandardMaterial({color:'#805028',flatShading:true})); trunk.position.y=.45*s; t.add(trunk);
 const cols=leaf||['#286828','#409840','#60b858'];
 for(let i=0;i<3;i++){ const c=new THREE.Mesh(new THREE.IcosahedronGeometry((.75-i*.15)*s,0),new THREE.MeshStandardMaterial({color:cols[i],flatShading:true})); c.position.set(rnd(.15)*s,(1.1+i*.42)*s,rnd(.15)*s); c.rotation.y=r()*TAU; t.add(c); }
 t.position.set(x,0,z); t.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } }); t.userData.sway=r()*TAU; return t;
}
const TEMPLE={
 fire:{ground:'#4f6a34',field:['#7a8a3e','#5f7230','#a8844a'],stone:'#9a8f80',dark:'#5e564b',leaf:['#7a3a1a','#c0602a','#e8a03a'],flame:['#ff5a1a','#ffb02e','#fff0a0'],sky:['#ff9f7a','#ffe3c0']},
 grass:{ground:'#3f7a34',field:['#5f9e3a','#47802c','#8aa050'],stone:'#8f9a88',dark:'#56604f',leaf:['#2f6a2a','#3f8a34','#6ab84a'],flame:['#4adf6a','#b8ff7a','#f0ffd0'],sky:['#9fd8ff','#eaf8ff']},
 water:{ground:'#3a7a6a',field:['#4e9a72','#3a7a5a','#6aa890'],stone:'#8fa0b0',dark:'#56677a',leaf:['#2a6a5a','#3a8a7a','#5ab8a0'],flame:['#3aa8ff','#8fe0ff','#e0f8ff'],sky:['#7fc8ff','#e0f4ff']},
};
// Suelo del tablero: hierba y tierra pintadas con manchas suaves (sin rayas ni píxeles)
function templeTex(T){
 return canvasTex(512,576,(g,w,h)=>{ const rr=seeded(91); g.fillStyle=T.field[0]; g.fillRect(0,0,w,h);
   for(let i=0;i<260;i++){ const x=rr()*w, y=rr()*h, s=20+rr()*90, c=T.field[rr()<.5?1:2]; const gr=g.createRadialGradient(x,y,0,x,y,s); gr.addColorStop(0,c+'55'); gr.addColorStop(1,c+'00'); g.fillStyle=gr; g.fillRect(x-s,y-s,s*2,s*2); }
   for(let i=0;i<1800;i++){ g.fillStyle=rr()<.5?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)'; g.fillRect(rr()*w,rr()*h,2,2); }
   const v=g.createRadialGradient(w/2,h/2,w*.3,w/2,h/2,w*.75); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,.28)'); g.fillStyle=v; g.fillRect(0,0,w,h);
 },false);
}
function buildTemple(g,theme,rc,r,anim){
 const T=TEMPLE[theme]||TEMPLE.grass, X0=rc.bx0, X1=rc.bx1, Z0=rc.bz0, Z1=rc.cz1, cx=(X0+X1)/2, cz=(Z0+Z1)/2;
 const sh=roundRectShape(rc.bx0,rc.bz0,rc.bx1,rc.bz1,.6); g.add(slab(sh,.8,0,T.dark,templeTex(T)));
 // Muro de bloques de piedra alrededor (con huecos en los laterales)
 const blocks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.9,flatShading:true}),220); const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), sc=new THREE.Vector3(); let n=0;
 const put=(x,z,w,d,hh)=>{ if(n>=220) return; m4.compose(new THREE.Vector3(x,hh/2-.1,z),q.setFromAxisAngle(new THREE.Vector3(0,1,0),(r()-.5)*.06),sc.set(w,hh,d)); blocks.setMatrixAt(n,m4); blocks.setColorAt(n,col(r()<.5?T.stone:T.dark).lerp(col('#ffffff'),r()*.15)); n++; };
 const pad=.45;
 for(let x=X0-pad;x<=X1+pad;x+=1.15){ put(x,Z0-pad-.2,1.05,.7,.55+r()*.25); put(x,Z1+pad+.2,1.05,.7,.4+r()*.2); }
 for(let z=Z0;z<=Z1;z+=1.15){ const mid=Math.abs(z-cz)<1.3; if(mid) continue; put(X0-pad-.25,z,.7,1.05,.5+r()*.3); put(X1+pad+.25,z,.7,1.05,.5+r()*.3); }
 blocks.count=n; blocks.castShadow=true; blocks.receiveShadow=true; g.add(blocks);
 // Columnas en las esquinas con braseros encendidos
 for(const [x,z] of [[X0-pad-.3,Z0-pad-.3],[X1+pad+.3,Z0-pad-.3],[X0-pad-.3,Z1+pad+.3],[X1+pad+.3,Z1+pad+.3]]){
   const col1=new THREE.Mesh(new THREE.CylinderGeometry(.42,.52,1.7,6),new THREE.MeshStandardMaterial({color:T.stone,roughness:.85,flatShading:true})); col1.position.set(x,.75,z); col1.castShadow=true; g.add(col1);
   const cap=new THREE.Mesh(new THREE.CylinderGeometry(.55,.45,.25,6),new THREE.MeshStandardMaterial({color:T.dark,flatShading:true})); cap.position.set(x,1.72,z); g.add(cap);
   const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.42,.22,.3,10,1,true),new THREE.MeshStandardMaterial({color:'#4a3a2a',side:THREE.DoubleSide,metalness:.4,roughness:.5})); bowl.position.set(x,1.98,z); g.add(bowl);
   const glow=glowSprite(T.flame[1],2.2); glow.position.set(x,2.3,z); g.add(glow);
   anim.push(t=>{ glow.material.opacity=.7+.3*Math.sin(t*9+x); if(Math.random()<.7) emit({p:new THREE.Vector3(x+rnd(.18),2.05,z+rnd(.18)),v:[rnd(.2),1.4+Math.random(),rnd(.2)],col:T.flame[Math.random()*3|0],size:.34,size1:.05,life:.55,g:-1}); });
 }
 // Árboles y rocas alrededor
 const outside=(x,z,m)=>x<X0-m||x>X1+m||z<Z0-m||z>Z1+m;
 for(let i=0;i<60;i++){ const a=r()*TAU, d=Math.max(X1-X0,Z1-Z0)*.62+2.5+r()*13, x=cx+Math.cos(a)*d*1.15, z=cz+Math.sin(a)*d*.9; if(!outside(x,z,2.4)) continue; const t=tree(x,z,.9+r()*.8,r,T.leaf); t.position.y=-.9; g.add(t); anim.push(tt=>{ t.rotation.z=Math.sin(tt*1.2+t.userData.sway)*.03; }); }
 for(let i=0;i<40;i++){ const a=r()*TAU, d=Math.max(X1-X0,Z1-Z0)*.6+1.8+r()*9, x=cx+Math.cos(a)*d, z=cz+Math.sin(a)*d*.85; if(!outside(x,z,1.6)) continue; const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.25+r()*.45,0),new THREE.MeshStandardMaterial({color:r()<.5?T.stone:T.dark,flatShading:true})); rock.position.set(x,-.75,z); rock.rotation.set(r()*3,r()*3,0); rock.castShadow=true; g.add(rock); }
 // Agua: un foso que rodea el templo (variante de agua)
 if(theme==='water'){ const moat=new THREE.Mesh(new THREE.RingGeometry(Math.max(X1-X0,Z1-Z0)*.75,Math.max(X1-X0,Z1-Z0)*.75+2.2,64),new THREE.MeshStandardMaterial({color:'#3a9ad8',emissive:'#0a3a6a',roughness:.15,metalness:.2,transparent:true,opacity:.9})); moat.rotation.x=-Math.PI/2; moat.position.set(cx,-.86,cz); g.add(moat); anim.push(t=>{ moat.material.emissive.setHSL(.58,.7,.14+.04*Math.sin(t*2)); }); }
 // Hojas o pavesas en el aire
 anim.push(t=>{ if(Math.random()<.1) emit({p:new THREE.Vector3(cx+rnd(10),6,cz+rnd(8)),v:[rnd(.6)+.4,-.6,rnd(.4)],col:T.leaf[Math.random()*3|0],size:.18,size1:.18,life:7,add:false,drag:0}); });
}
function buildArena(kind){
 const g=new THREE.Group(), rc=boardRects(), r=seeded(kind.length*17+3);
 if(kind.startsWith('temple')){ const anim=[]; g.userData.anim=anim; const T=TEMPLE[kind.split('-')[1]]||TEMPLE.grass;
   const ground=new THREE.Mesh(new THREE.CircleGeometry(60,48),new THREE.MeshStandardMaterial({color:T.ground,roughness:1})); ground.rotation.x=-Math.PI/2; ground.position.y=-.9; ground.receiveShadow=true; g.add(ground);
   buildTemple(g,kind.split('-')[1],rc,r,anim);
   g.add(slab(roundRectShape(rc.cx0,rc.cz0,rc.cx1,rc.cz1,.3),.5,0,T.dark,null,T.stone));
   g.traverse(o=>{ if(o.isMesh&&o!==ground) o.receiveShadow=true; }); return g; }
 const anim=[]; g.userData.anim=anim;
 const groundCol={route:'#4f9a34',stadium:'#2a3360',plaza:'#78c850'}[kind];
 const ground=new THREE.Mesh(new THREE.CircleGeometry(60,48),new THREE.MeshStandardMaterial({color:groundCol,roughness:1}));
 ground.rotation.x=-Math.PI/2; ground.position.y=-.9; ground.receiveShadow=true; g.add(ground);
 const bw=rc.bx1-rc.bx0, bd=rc.bz1-rc.bz0;
 if(kind!=='plaza'){
   const sh=roundRectShape(rc.bx0,rc.bz0,rc.bx1,rc.bz1,.6);
   g.add(slab(sh,.8,0,kind==='route'?'#805028':'#404060',fieldTex(kind)));
 } else {
   const cp=M.car?W3(M.car.cx,M.car.cy):null, cx=cp?cp.x:(rc.bx0+rc.bx1)/2, cz=cp?cp.z:(rc.bz0+rc.bz1)/2, rad=M.car?M.car.rr*1.36/M.R:Math.max(bw,bd)*.56;
   const plaza=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad+.1,.8,48),new THREE.MeshStandardMaterial({color:'#a08860',roughness:.9}));
   plaza.position.set(cx,-.4+.0,cz); plaza.receiveShadow=true; g.add(plaza);
   const tiles=canvasTex(128,128,(c,w)=>{ c.fillStyle='#e8d8b0'; c.fillRect(0,0,w,w); for(let y=0;y<w;y+=8){ c.fillStyle='#d0c098'; c.fillRect(0,y,w,1); for(let x=(y/8)%2?4:0;x<w;x+=16) c.fillRect(x,y,1,8); } });
   tiles.wrapS=tiles.wrapT=THREE.RepeatWrapping; tiles.repeat.set(4,4);
   const top=new THREE.Mesh(new THREE.CircleGeometry(rad-.05,48),new THREE.MeshStandardMaterial({map:tiles,roughness:.95})); top.rotation.x=-Math.PI/2; top.position.set(cx,.01,cz); top.receiveShadow=true; g.add(top);
   // fuente central
   const basin=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.6,.45,24,1,true),new THREE.MeshStandardMaterial({color:'#d8d0c0',side:THREE.DoubleSide})); basin.position.set(cx,.22,cz); g.add(basin);
   const water=new THREE.Mesh(new THREE.CircleGeometry(1.45,24),new THREE.MeshStandardMaterial({color:'#3890f8',emissive:'#103060',roughness:.2,metalness:.1})); water.rotation.x=-Math.PI/2; water.position.set(cx,.36,cz); g.add(water);
   const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.18,.25,1.1,10),new THREE.MeshStandardMaterial({color:'#e8e0d8'})); pillar.position.set(cx,.55,cz); pillar.castShadow=true; g.add(pillar);
   anim.push(t=>{ water.material.emissive.setHSL(.6,.7,.18+.05*Math.sin(t*3)); if(Math.random()<.5) emit({p:new THREE.Vector3(cx,1.15,cz),v:[rnd(.9),2.4+Math.random(),rnd(.9)],col:'#bfe8ff',size:.14,life:.9,g:5,add:true}); });
   for(let i=0;i<20;i++){ const a=i/20*TAU, b=new THREE.Mesh(new THREE.IcosahedronGeometry(.42,0),new THREE.MeshStandardMaterial({color:'#409840',flatShading:true})); b.position.set(cx+Math.cos(a)*(rad+.5),-.1,cz+Math.sin(a)*(rad+.5)); b.castShadow=true; g.add(b);
     const fl=new THREE.Mesh(new THREE.SphereGeometry(.09,6,4),new THREE.MeshBasicMaterial({color:['#f05878','#f8d038','#f8f8f8','#68b8f8'][i%4]})); fl.position.copy(b.position).add(new THREE.Vector3(0,.38,0)); g.add(fl); }
 }
  // banquillo (no en la plaza del carrusel)
 if(kind!=='plaza') g.add(slab(roundRectShape(rc.cx0,rc.cz0,rc.cx1,rc.cz1,.3),.5,0,kind==='stadium'?'#303048':'#603818',null,kind==='stadium'?'#585878':'#a87040'));
 const X0=rc.bx0, X1=rc.bx1, Z0=rc.bz0, Z1=rc.cz1;
 const outside=(x,z,m=1.2)=>x<X0-m||x>X1+m||z<Z0-m||z>Z1+m;
 if(kind==='route'){
   for(let i=0;i<46;i++){ const a=r()*TAU, d=Math.max(bw,bd)*.6+2+r()*14, x=(X0+X1)/2+Math.cos(a)*d*1.1, z=(Z0+Z1)/2+Math.sin(a)*d*.9; if(!outside(x,z,1.6)) continue; const t=tree(x,z,.8+r()*.7,r); t.position.y=-.9; g.add(t); anim.push(tt=>{ t.rotation.z=Math.sin(tt*1.3+t.userData.sway)*.03; }); }
   for(let i=0;i<30;i++){ const x=X0-1-r()*8, z=Z0+r()*(Z1-Z0); const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.2+r()*.3,0),new THREE.MeshStandardMaterial({color:'#8a8a7a',flatShading:true})); rock.position.set(r()<.5?x:X1+1+r()*8,-.8,z); rock.castShadow=true; g.add(rock); }
   const grass=new THREE.InstancedMesh(new THREE.ConeGeometry(.08,.45,4),new THREE.MeshStandardMaterial({color:'#2f7a22',flatShading:true}),500); const m4=new THREE.Matrix4(); let n=0;
   for(let i=0;i<1500&&n<500;i++){ const x=X0-7+r()*(X1-X0+14), z=Z0-7+r()*(Z1-Z0+14); if(!outside(x,z,.4)) continue; m4.makeRotationY(r()*TAU).setPosition(x,-.7,z); grass.setMatrixAt(n++,m4); } grass.count=n; g.add(grass);
   anim.push(t=>{ if(Math.random()<.12) emit({p:new THREE.Vector3((X0+X1)/2+rnd(10),6,(Z0+Z1)/2+rnd(8)),v:[rnd(.6)+.5,-.7,rnd(.4)],col:['#78c850','#f0a040','#58a838'][Math.random()*3|0],size:.18,size1:.18,life:7,add:false,drag:0}); });
 } else if(kind==='stadium'){
   // gradas escalonadas con público
   const tiers=4, crowd=new THREE.InstancedMesh(new THREE.BoxGeometry(.32,.42,.28),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8}),900); const m4=new THREE.Matrix4(); let n=0; const shirts=['#f05838','#f8c030','#4890f0','#a868f0','#f8f8f8','#48c878','#f878b0'];
   const sides=[[X0-2.2,-1],[X1+2.2,1]];
   for(const [sx,dir] of sides) for(let k=0;k<tiers;k++){
     const step=new THREE.Mesh(new THREE.BoxGeometry(1.1,.5+k*.55,Z1-Z0+3),new THREE.MeshStandardMaterial({color:k%2?'#3a4478':'#30386a'})); step.position.set(sx+dir*k*1.1,-.9+(.5+k*.55)/2,(Z0+Z1)/2); step.receiveShadow=true; g.add(step);
     for(let z=Z0-1.2;z<Z1+1.2&&n<900;z+=.45){ if(r()<.25) continue; m4.makeTranslation(sx+dir*k*1.1+rnd(.1),-.9+.5+k*.55+.2,z); crowd.setMatrixAt(n,m4); crowd.setColorAt(n,col(shirts[r()*shirts.length|0])); n++; }
   }
   const back=Z0-2.2; for(let k=0;k<tiers;k++){ const step=new THREE.Mesh(new THREE.BoxGeometry(X1-X0+4+k*2.2,.5+k*.55,1.1),new THREE.MeshStandardMaterial({color:k%2?'#3a4478':'#30386a'})); step.position.set((X0+X1)/2,-.9+(.5+k*.55)/2,back-k*1.1); g.add(step);
     for(let x=X0-1.5-k;x<X1+1.5+k&&n<900;x+=.45){ if(r()<.25) continue; m4.makeTranslation(x,-.9+.5+k*.55+.2,back-k*1.1+rnd(.1)); crowd.setMatrixAt(n,m4); crowd.setColorAt(n,col(shirts[r()*shirts.length|0])); n++; } }
   crowd.count=n; g.add(crowd);
   const base=[]; for(let i=0;i<n;i++){ const mm=new THREE.Matrix4(); crowd.getMatrixAt(i,mm); base.push(mm); }
   anim.push(t=>{ if(!Q.crowd) return; const mm=new THREE.Matrix4(); for(let i=0;i<n;i+=1){ mm.copy(base[i]); mm.elements[13]+=Math.max(0,Math.sin(t*6+i*1.7))*.08; crowd.setMatrixAt(i,mm); } crowd.instanceMatrix.needsUpdate=true;
     if(Math.random()<.25){ const i=Math.random()*n|0, p=new THREE.Vector3().setFromMatrixPosition(base[i]); emit({p:p.add(new THREE.Vector3(0,.4,0)),col:'#ffffff',size:.5,size1:.1,life:.18}); } });
   // torres de focos
   for(const [x,z] of [[X0-5,Z0-3],[X1+5,Z0-3],[X0-5,Z1+1],[X1+5,Z1+1]]){
     const pole=new THREE.Mesh(new THREE.CylinderGeometry(.1,.14,6,6),new THREE.MeshStandardMaterial({color:'#585868'})); pole.position.set(x,2,z); g.add(pole);
     const lamp=new THREE.Mesh(new THREE.BoxGeometry(1,.6,.3),new THREE.MeshStandardMaterial({color:'#fff8d0',emissive:'#fff2a0',emissiveIntensity:1.5})); lamp.position.set(x,5,z); lamp.lookAt((X0+X1)/2,0,(Z0+Z1)/2); g.add(lamp);
   }
   for(const [x,z,c] of [[X0-1.1,Z0+1,'#f05838'],[X1+1.1,Z1-3,'#4890f0']]){ const pole=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1.6,5),new THREE.MeshStandardMaterial({color:'#888'})); pole.position.set(x,.5,z); g.add(pole);
     const flag=new THREE.Mesh(new THREE.PlaneGeometry(.7,.42,6,1),new THREE.MeshStandardMaterial({color:c,side:THREE.DoubleSide})); flag.position.set(x+.36,1.1,z); g.add(flag); const pa=flag.geometry.attributes.position, bx=pa.array.slice();
     anim.push(t=>{ for(let i=0;i<pa.count;i++){ const xx=bx[i*3]; pa.setZ(i,Math.sin(t*5+xx*6)*.08*(xx+.35)); } pa.needsUpdate=true; }); }
 }
 g.traverse(o=>{ if(o.isMesh&&o!==ground) o.receiveShadow=true; });
 return g;
}
const SKY={route:['#8fd3ff','#e8f7ff'],stadium:['#141a3a','#3a4a8a'],plaza:['#ffc89a','#fff2d8'],'temple-fire':TEMPLE.fire.sky,'temple-grass':TEMPLE.grass.sky,'temple-water':TEMPLE.water.sky};
function setArena(kind){
 if(kind===curArena) return; const prev=curArena; curArena=kind;
 if(benchPads) benchPads.visible=kind!=='plaza';
 // La cámara encuadra la plaza entera en el carrusel y el tablero en el resto
 if(board.G&&(kind==='plaza')!==(prev==='plaza')) fitCamera(board.G);
 if(!arenas[kind]){ arenas[kind]=buildArena(kind); scene.add(arenas[kind]); }
 for(const k in arenas) arenas[k].visible=k===kind;
 const [a,b]=SKY[kind]; scene.background=canvasTex(2,64,(g)=>{ const gr=g.createLinearGradient(0,0,0,64); gr.addColorStop(0,a); gr.addColorStop(1,b); g.fillStyle=gr; g.fillRect(0,0,2,64); },false);
 scene.fog=new THREE.Fog(b,camDist+12,camDist+55);
 hemi.intensity=kind==='stadium'?1.1:1.5; sun.intensity=kind==='stadium'?1.6:2.4; sun.color.set(kind==='plaza'?'#fff0d8':'#ffffff');
}

/* ---------- modelos ---------- */
const loader=new GLTFLoader(); const draco=new DRACOLoader(); draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
const models={}; const queue=[]; let loading=0;
function wantModel(dex){
 let m=models[dex]; if(m) return m;
 m=models[dex]={status:'queued'}; queue.push(dex); pump(); return m;
}
function pump(){
 while(loading<4&&queue.length){
   const dex=queue.shift(), m=models[dex]; loading++; m.status='loading';
   loader.load(m.retry?MODEL_RAW(dex):MODEL_URL(dex),gl=>{ loading--; try{ prepModel(m,gl,dex); m.status='ok'; }catch(e){ m.status='fail'; } if(pWait[dex]) makePortrait(dex); pump(); },undefined,()=>{ loading--; if(!m.retry){ m.retry=1; m.status='queued'; queue.push(dex); pump(); return; } m.status='fail'; portraits[dex]=''; if(pWait[dex]){ for(const f of pWait[dex]) f(''); delete pWait[dex]; } pump(); });
 }
}
const RX={
 idle:[/battlewait/i,/defaultwait/i,/idle/i,/wait/i,/stand/i],
 walk:[/run/i,/walk/i,/move/i],
 attack:[/attack0?1/i,/attack/i,/fight_?a/i,/fight/i,/atk/i,/bite|punch|tackle|scratch/i],
 cast:[/attack0?2|special|tokushu/i,/fight_?d/i,/fight_?b/i,/attack/i,/fight/i],
 ko:[/down|faint|\bko\b|_ko|dead|die|lose/i],
};
const BAD_IDLE=/dizzy|faint|down|\bko\b|_ko|sleep|dead|die|lose|damage|hurt/i;
function prepModel(m,gl,dex){
 const root=gl.scene; root.updateMatrixWorld(true);
 root.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=false; o.frustumCulled=false; const ms=Array.isArray(o.material)?o.material:[o.material]; for(const mt of ms){ if(mt.map) mt.map.colorSpace=THREE.SRGBColorSpace; if(mt.transparent&&mt.opacity>=1) mt.alphaTest=.5; } } });
 const clips=gl.animations||[], pick=res=>{ for(const re of res){ const c=clips.find(k=>re.test(k.name)); if(c) return c; } return null; };
 m.clips={idle:pick(RX.idle),walk:pick(RX.walk),attack:pick(RX.attack),cast:pick(RX.cast),ko:pick(RX.ko)};
 if(!m.clips.idle){ const c2=clips.find(k=>!BAD_IDLE.test(k.name)&&k!==m.clips.attack&&k!==m.clips.ko); m.clips.idle=c2||null; }
 // Sin desplazamiento de la raíz: algunas animaciones mueven el modelo hacia un lado y al repetirse vuelve de golpe (un "tic")
 const roots=new Set(); root.traverse(o=>{ if(o.isBone&&!(o.parent&&o.parent.isBone)) roots.add(o.name); });
 for(const c of clips) for(const tr of c.tracks){ const i=tr.name.lastIndexOf('.'); if(tr.name.slice(i+1)!=='position'||!roots.has(tr.name.slice(0,i))) continue; const v=tr.values; for(let k=3;k<v.length;k+=3){ v[k]=v[0]; v[k+2]=v[2]; } }
 // Se mide en la pose de reposo real: la animación de espera o, si no hay, la pose que le damos por código
 if(m.clips.idle){ const mx=new THREE.AnimationMixer(root); mx.clipAction(m.clips.idle).play(); mx.update(.4); root.updateMatrixWorld(true); }
 else { m.proc=rigPose(root,dex); root.updateMatrixWorld(true); }
 const box=new THREE.Box3().setFromObject(root,true), size=box.getSize(new THREE.Vector3()), c=box.getCenter(new THREE.Vector3());
 // Todos del mismo alto (como las piezas de TFT), salvo los muy anchos o largos, que se encogen para no salirse de su casilla
 const h=Math.max(size.y,1e-3), L=Math.max(size.x,size.z,1e-3);
 // Las serpientes enroscadas (COIL) ocupan más ancho que alto: se les deja algo más de margen
 m.kh=1.05/h; m.k=COIL.has(dex)?Math.min(1.2/h,1.8/L):Math.min(1.05/h,1.3/L); m.off=new THREE.Vector3(-c.x,-box.min.y,-c.z); m.scene=root;
}

/* ---------- pose y movimiento por código (modelos sin animaciones) ---------- */
// Muchos modelos llegan sin animaciones, en la pose de montaje (a veces en T). Por el nombre de los huesos
// (Hips, Spine, Head, LArm, Tail…) se bajan los brazos, se enrosca la cola de las serpientes y se les da un
// vaivén suave (respirar, cabecear, mover la cola) para que no parezcan estatuas.
const boneName=o=>o.name.replace(/^\d+\s+/,'').replace(/_\d+$/,'');
const COIL=new Set([147,148,384]); // Dratini, Dragonair y Rayquaza: cuerpo enroscado como una serpiente
const _q=new THREE.Quaternion(), _v=new THREE.Vector3();
function bonesOf(root){ const B={}; root.traverse(o=>{ if(o.isBone){ const n=boneName(o); if(!B[n]) B[n]=o; } }); return B; }
function chainOf(B,re){ return Object.keys(B).filter(n=>re.test(n)).sort((a,b)=>(+(a.match(/\d+$/)||[0])[0])-(+(b.match(/\d+$/)||[0])[0])).map(n=>B[n]); }
// Gira un hueso con una rotación dada en el espacio del modelo
function rotModel(b,q){ const pw=b.parent.getWorldQuaternion(new THREE.Quaternion()), bw=b.getWorldQuaternion(new THREE.Quaternion()); b.quaternion.copy(pw.invert().multiply(q.clone().multiply(bw))); b.updateMatrixWorld(true); }
// Dirección (en el modelo) del hueso hacia su primer hijo
function dirOf(b){ const kid=b.children.find(o=>o.isBone), a=b.getWorldPosition(new THREE.Vector3()); if(kid) return kid.getWorldPosition(new THREE.Vector3()).sub(a).normalize(); return new THREE.Vector3(1,0,0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())); }
// Eje del modelo expresado en el espacio local del hueso (para girarlo después respecto a su reposo)
function localAxis(b,ax){ return ax.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize(); }
// Apunta un hueso hacia una dirección del modelo, con una fracción k del giro
function aimBone(b,dir,k=1){ const d=dirOf(b); const q=new THREE.Quaternion().setFromUnitVectors(d,dir.clone().normalize()); if(k<1) q.slerp(new THREE.Quaternion(),1-k); rotModel(b,q); }
function rigPose(root,dex){
 const B=bonesOf(root); if(!Object.keys(B).length) return null; root.updateMatrixWorld(true);
 const proc=[], X=new THREE.Vector3(1,0,0), Y=new THREE.Vector3(0,1,0), Z=new THREE.Vector3(0,0,1);
 const add=(b,ax,amp,f,ph,w=0)=>{ if(b) proc.push({n:b.name,ax:localAxis(b,ax).toArray(),amp,f,ph,w}); };
 // Brazos en T: se bajan hacia los lados (solo si están casi horizontales; las patas de los cuadrúpedos ya miran abajo)
 // (Machamp tiene dos pares: LArm y LArm2)
 for(const n of Object.keys(B).filter(n=>/^[LR](Upper)?Arm\d*$/.test(n))){ const arm=B[n], d=dirOf(arm);
   if(Math.abs(d.y)<.7){ const out=new THREE.Vector3(Math.sign(d.x)||1,0,0); aimBone(arm,out.multiplyScalar(.45).add(new THREE.Vector3(0,-1,.15)),.85); }
   add(arm,X,.12,1.4,n[0]==='L'?0:Math.PI); add(arm,Z,.06,1.1,n[0]==='L'?0:Math.PI); }
 const tail=chainOf(B,/^Tail\d*$/), spine=chainOf(B,/^Spine\d*$/), head=B.Head, neck=B.Neck||B.Neck1;
 if(COIL.has(dex)&&tail.length>=4){
   // Serpiente: desde la cadera, la cola se tumba en el suelo y da algo más de una vuelta en espiral
   // hacia dentro; el tronco se yergue en S y la cabeza mira al frente
   const segs=[B.Hips||tail[0],...tail].filter(Boolean), lens=segs.map(b=>{ const k=b.children.find(o=>o.isBone); return k?b.getWorldPosition(new THREE.Vector3()).distanceTo(k.getWorldPosition(new THREE.Vector3())):0; });
   // Colas largas (Rayquaza): más vueltas, apiladas hacia arriba como un muelle
   const Lt=lens.reduce((a,b)=>a+b,0)||1, turns=segs.length>10?2.2:1.1, r0=Lt/(Math.PI*2*turns), up=segs.length>10?.07:-.04; let a=0, s=0;
   segs.forEach((b,i)=>{ if(!lens[i]) return; const r=r0*(1-.35*s/Lt); a+=lens[i]/r*.5; aimBone(b,new THREE.Vector3(Math.sin(a),i?-up:-.5,-Math.cos(a))); a+=lens[i]/r*.5; s+=lens[i]; });
   const rise=[...spine,...chainOf(B,/^Neck\d*$/)], ns=rise.length; rise.forEach((b,i)=>{ const th=-.2+1.25*(i/Math.max(1,ns-1))**1.4; aimBone(b,new THREE.Vector3(0,Math.cos(th),Math.sin(th))); });
   tail.forEach((b,i)=>add(b,Y,.03,1.2,i*.5)); spine.forEach((b,i)=>add(b,X,.04,1.1,i*.4));
 } else tail.forEach((b,i)=>add(b,Y,.18+i*.03,2,i*.55));
 spine.forEach((b,i)=>{ add(b,X,.05,1.3,i*.3); add(b,Z,.03,.7,i*.4); });
 add(neck,X,.06,1.3,.6); add(head,X,.09,1.3,.9); add(head,Y,.14,.45,0);
 // Al andar: piernas y brazos en vaivén alterno (en los cuadrúpedos, en diagonal)
 for(const [n,ph] of [['LThigh',0],['RThigh',Math.PI],['LArm',Math.PI],['RArm',0],['LArm2',0],['RArm2',Math.PI]]) add(B[n],X,.55,4.2,ph,1);
 for(const [n,ph] of [['LLeg',.6],['RLeg',Math.PI+.6]]) add(B[n],X,.35,4.2,ph,1);
 // Alas y apéndices (huesos Feeler): con 4 o más segmentos son alas y aletean en espejo; los cortos se mecen
 for(const side of ['L','R']){ const ch=chainOf(B,new RegExp('^'+side+'Feeler\\d+$')); if(ch.length<2) continue; const wing=ch.length>=4, ax=side==='L'?Z:Z.clone().negate();
   ch.forEach((bn,i)=>{ add(bn,ax,(wing?.32:.12)*(i?.45:1),wing?1.3:1.6,i*.5); if(wing) add(bn,ax,(i?.25:.5),4.6,i*.5,1); }); }
 add(B.Jaw,X,.06,1.4,1.2); for(const n of ['LThigh','RThigh']) add(B[n],X,.04,1.3,n[0]==='L'?0:Math.PI); add(B.LEar,Z,.08,2.4,0); add(B.REar,Z,.08,2.4,1);
 return proc.length?proc:null;
}
const spriteTex={};
function getSpriteTex(dex){ if(!spriteTex[dex]){ const t=new THREE.TextureLoader().setCrossOrigin('anonymous').load(SPRITE_URL(dex)); t.colorSpace=THREE.SRGBColorSpace; t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestFilter; spriteTex[dex]=t; } return spriteTex[dex]; }

/* ---------- actores (un Pokémon en escena) ---------- */
const actors=new Map();
const ringGeo=new THREE.RingGeometry(.52,.64,32); ringGeo.rotateX(-Math.PI/2);
const blobGeo=new THREE.CircleGeometry(.55,24); blobGeo.rotateX(-Math.PI/2);
const blobMat=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.25,depthWrite:false});
const shieldGeo=new THREE.SphereGeometry(1,20,14);
const starGeo=new THREE.OctahedronGeometry(.08,0);
// Estrella dorada con halo (sprite) para el efecto de subir de estrellas
const starTex=canvasTex(64,64,g=>{ const r=g.createRadialGradient(32,32,0,32,32,32); r.addColorStop(0,'rgba(255,240,170,.9)'); r.addColorStop(.45,'rgba(255,200,60,.28)'); r.addColorStop(1,'rgba(255,200,60,0)'); g.fillStyle=r; g.fillRect(0,0,64,64);
 g.beginPath(); for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, rr=i%2?9:23; g.lineTo(32+Math.cos(a)*rr,32+Math.sin(a)*rr); } g.closePath(); g.shadowColor='#ffcf33'; g.shadowBlur=8; g.fillStyle='#fff6c8'; g.fill(); },false);
// Poké Ball que se ve mientras llega el modelo 3D
const ballMats=[new THREE.MeshStandardMaterial({color:'#e8402e',roughness:.35}),new THREE.MeshStandardMaterial({color:'#f4f4f4',roughness:.35}),new THREE.MeshStandardMaterial({color:'#1a1a22',roughness:.5})];
const ballTop=new THREE.SphereGeometry(.24,24,12,0,TAU,0,Math.PI/2), ballBot=new THREE.SphereGeometry(.24,24,12,0,TAU,Math.PI/2,Math.PI/2), ballBand=new THREE.CylinderGeometry(.245,.245,.04,24), ballBtn=new THREE.CylinderGeometry(.07,.07,.05,16);
function pokeBall(){ const g=new THREE.Group(), a=new THREE.Mesh(ballTop,ballMats[0]), b=new THREE.Mesh(ballBot,ballMats[1]), c=new THREE.Mesh(ballBand,ballMats[2]), d=new THREE.Mesh(ballBtn,ballMats[1]); d.rotation.x=Math.PI/2; d.position.z=.24; g.add(a,b,c,d); g.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); g.position.y=.25; return g; }
class Actor{
 constructor(spec){
   this.root=new THREE.Group(); this.body=new THREE.Group(); this.root.add(this.body);
   this.ring=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.9,depthWrite:false})); this.ring.position.y=TOP+.015; this.root.add(this.ring);
   this.blob=new THREE.Mesh(blobGeo,blobMat); this.blob.position.y=TOP+.01; this.root.add(this.blob);
   this.dex=0; this.model=null; this.sprite=null; this.mixer=null; this.cur=null; this.face=spec.face||0; this.h=1.2;
   this.lastAtk=spec.atk||0; this.lastCast=spec.cast||0; this.atkT=9; this.castT=9; this.deadT=-1; this.flash=0; this.lastPos=null; this.moveT=0;
   scene.add(this.root);
 }
 setDex(dex){
   if(dex===this.dex) return; this.dex=dex; this.clearModel(); this.m=wantModel(dex);
 }
 clearModel(){ if(this.ball){ this.body.remove(this.ball); this.ball=null; } if(this.model){ this.body.remove(this.model); this.model=null; this.mixer=null; this.cur=null; } if(this.sprite){ this.body.remove(this.sprite); this.sprite=null; } }
 ensure(){
   const m=this.m; if(!m) return;
   if(m.status==='ok'&&!this.model){
     if(this.sprite){ this.body.remove(this.sprite); this.sprite=null; }
     if(this.ball){ this.body.remove(this.ball); this.ball=null; }
     const inst=SkeletonUtils.clone(m.scene); const holder=new THREE.Group(); inst.position.copy(m.off); holder.add(inst); const kk=this.fitH&&m.kh?Math.min(m.kh,m.k*1.6):m.k; holder.scale.setScalar(kk); holder.userData.k=kk;
     this.mats=[]; inst.traverse(o=>{ if(o.isMesh){ o.material=Array.isArray(o.material)?o.material.map(x=>x.clone()):o.material.clone(); for(const mt of [].concat(o.material)){ mt.userData.wasT=mt.transparent; if(mt.emissive) mt.userData.e0=mt.emissive.clone(); this.mats.push(mt); } } });
     this.model=holder; this.body.add(holder); this.mixer=new THREE.AnimationMixer(inst); this.acts={};
     // Movimiento por código: cada hueso oscila alrededor de su pose de reposo
     this.proc=m.proc?m.proc.map(p=>{ const b=inst.getObjectByName(p.n); return b&&{b,rest:b.quaternion.clone(),ax:new THREE.Vector3().fromArray(p.ax),amp:p.amp,f:p.f,ph:p.ph,w:p.w}; }).filter(Boolean):null;
     for(const k in m.clips) if(m.clips[k]) this.acts[k]=this.mixer.clipAction(m.clips[k]);
     this.play('idle',true);
   } else if(m.status!=='ok'&&!this.ball){ this.ball=pokeBall(); this.body.add(this.ball); } // cargando o sin modelo: Poké Ball, nunca un sprite 2D
 }
 play(name,loop){
   const a=this.acts&&this.acts[name]; if(!a){ return false; }
   if(this.cur===a&&loop) return true;
   a.reset(); a.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1); a.clampWhenFinished=!loop; a.enabled=true;
   const d=a.getClip().duration||1; a.timeScale=loop?1:Math.max(1,d/(name==='ko'?1.1:.75));
   if(this.cur&&this.cur!==a) a.crossFadeFrom(this.cur,.15,false); a.play(); this.cur=a; this.curName=name; return true;
 }
 update(spec,dt,t){
   this.fitH=!!spec.tac; this.ensure();
   if(spec.star){ if(this.star&&spec.star>this.star&&!spec.dead) this.evolve(spec.star,!!spec.tac); this.star=spec.star; }
   const p=W3(spec.x,spec.y,0);
   const moving=this.lastPos&&Math.hypot(p.x-this.lastPos.x,p.z-this.lastPos.z)>.004; this.moveT=moving?.15:Math.max(0,this.moveT-dt);
   if(moving&&!spec.drag){ const dx=p.x-this.lastPos.x, dz=p.z-this.lastPos.z; this.face=Math.atan2(dx,dz); }
   else if(spec.tx!=null){ const q=W3(spec.tx,spec.ty); this.face=Math.atan2(q.x-p.x,q.z-p.z); }
   else if(spec.face!=null&&!this.moveT) this.face=spec.face;
   this.lastPos=p.clone();
   const sc=spec.scale||1; this.root.position.set(p.x,0,p.z);
   // giro suave hacia donde mira
   let dr=this.face-this.body.rotation.y; dr=Math.atan2(Math.sin(dr),Math.cos(dr)); this.body.rotation.y+=dr*Math.min(1,dt*10);
   // Evolución: late (crece y vuelve) mientras brilla en blanco
   // Evolución: late (crece y vuelve) mientras brilla en blanco; la de la minileyenda además gira
   const ev=this.evoFx?this.evoT:9, evL=this.evoBig?1.6:1, evoGlow=ev<evL?Math.sin(ev/evL*Math.PI):0;
   this.body.scale.setScalar(sc*1.35*(1+(ev<.8*evL?(this.evoBig?.35:.22)*Math.sin(ev/(.8*evL)*Math.PI):0))); this.h=1.35*sc;
   if(this.evoBig&&ev<evL) this.face+=dt*14*Math.sin(ev/evL*Math.PI);
   this.ring.material.color.set(spec.ring||'#ffffff'); this.ring.visible=!spec.hideRing; this.ring.scale.setScalar(spec.sel?1.25+.06*Math.sin(t*8):1);
   // ataque y habilidad (contadores que suben en la simulación)
   if((spec.atk||0)>this.lastAtk){ this.lastAtk=spec.atk; this.atkT=0; if(!this.play('attack',false)) this.atkT=0; }
   if((spec.cast||0)>this.lastCast){ this.lastCast=spec.cast; this.castT=0; this.play('cast',false); }
   this.atkT+=dt; this.castT+=dt;
   let lift=TOP, lean=0, fwd=0, breath=0, sway=0;
   if(spec.dead){
     if(this.deadT<0){ this.deadT=0; if(!this.play('ko',false)) this.noKo=true; }
     this.deadT+=dt; const k=clamp(this.deadT/1.1,0,1);
     if(this.noKo) lean=k*1.35; lift-=Math.max(0,this.deadT-.6)*.6;
     this.setAlpha(1-clamp((this.deadT-.5)/.7,0,1)); this.root.visible=this.deadT<1.3;
   } else {
     if(this.cur&&!this.cur.isRunning()&&this.curName!=='idle'&&this.curName!=='walk'){ this.cur.stop(); this.cur=null; }
     if(!this.cur||this.curName==='idle'||this.curName==='walk'){ if(this.moveT>0&&this.acts&&this.acts.walk) this.play('walk',true); else this.play('idle',true); }
     if(this.atkT<.3) fwd=Math.sin(this.atkT/.3*Math.PI)*.35;
     if(this.castT<.5){ lift+=Math.sin(this.castT/.5*Math.PI)*.35; }
     if(!this.acts||!this.acts.idle){ const ph=t+this.root.id; lift+=(Math.sin(ph*2.2)*.5+.5)*(this.proc?.04:.07); breath=Math.sin(ph*2.6)*(this.proc?.03:.05); sway=Math.sin(ph*.9)*(this.proc?.08:.16); lean=Math.sin(ph*1.3)*(this.proc?.02:.05); }
     if(this.moveT>0&&!(this.acts&&this.acts.walk)) lift+=Math.abs(Math.sin(t*13.2))*(this.proc?.07:.12);
     if(spec.drag) lift+=.5;
     this.setAlpha(spec.alpha!=null?spec.alpha:1);
   }
   this.body.position.set(Math.sin(this.face)*fwd,lift,Math.cos(this.face)*fwd); this.body.rotation.x=0; this.body.rotation.z=lean; if(this.model) this.model.rotation.y=sway;
   if(this.sprite){ this.sprite.material.rotation=-lean; }
   if(this.ball){ this.ball.rotation.y=t*3; this.ball.position.y=.25+Math.abs(Math.sin(t*4))*.12; }
   // destello al recibir daño y brillo al lanzar
   const fl=clamp((spec.flash||0)/.12,0,1), gl=spec.glow||0;
   if(this.mats) for(const mt of this.mats) if(mt.emissive){ const e=Math.max(fl*.12,gl*.3,evoGlow*.9), w=fl*.12>gl*.3||evoGlow*.9>gl*.3, e0=mt.userData.e0; mt.emissive.setRGB(e0.r+e*(w?1:spec.glowCol.r),e0.g+e*(w?1:spec.glowCol.g),e0.b+e*(w?1:spec.glowCol.b)); }
   if(this.mixer) this.mixer.update(dt*(spec.stun>0&&!spec.dead?.15:1));
   // Peso de la animación de andar: sube al moverse y baja al pararse, sin saltos
   this.wf=lerp(this.wf||0,this.moveT>0&&!spec.dead?1:0,Math.min(1,dt*8));
   if(this.proc&&!spec.dead){ const k=spec.stun>0?.2:1, wf=this.wf; for(const p of this.proc){ const a=p.w?p.amp*wf*Math.sin(t*p.f*Math.PI+p.ph):p.amp*k*(1-wf*.6)*Math.sin(t*p.f*Math.PI+p.ph+this.root.id); p.b.quaternion.copy(p.rest).multiply(_q.setFromAxisAngle(p.ax,a)); } }
   if(this.model) this.model.scale.set(this.model.userData.k,this.model.userData.k*(1+breath),this.model.userData.k);
   // escudo, aturdimiento
   if(spec.shield>0&&!spec.dead){ if(!this.shieldM){ this.shieldM=new THREE.Mesh(shieldGeo,new THREE.MeshStandardMaterial({color:'#bfe6ff',emissive:'#3a7bd5',emissiveIntensity:.4,transparent:true,opacity:.22,depthWrite:false})); this.root.add(this.shieldM); }
     this.shieldM.visible=true; this.shieldM.scale.set(.85*sc*1.1,.9*sc*1.1,.85*sc*1.1); this.shieldM.position.y=TOP+.55*sc; this.shieldM.material.opacity=.18+.06*Math.sin(t*5); }
   else if(this.shieldM) this.shieldM.visible=false;
   if(spec.stun>0&&!spec.dead){ if(!this.stars){ this.stars=new THREE.Group(); for(let i=0;i<3;i++){ const s=new THREE.Mesh(starGeo,new THREE.MeshBasicMaterial({color:'#ffe066'})); s.position.set(Math.cos(i/3*TAU)*.35,0,Math.sin(i/3*TAU)*.35); this.stars.add(s); } this.root.add(this.stars); }
     this.stars.visible=true; this.stars.position.y=TOP+this.h*1.05; this.stars.rotation.y=t*4; for(const s of this.stars.children) s.material.color.set(spec.sleep>0?'#c9a7ff':'#ffe066'); }
   else if(this.stars) this.stars.visible=false;
   if(this.evoFx) this.stepEvo(dt);
   this.blob.visible=!spec.dead&&(!this.model||!sun.castShadow); if(!spec.dead) this.root.visible=true;
 }
 // Subida de estrellas: pilar de luz dorada, estallido de chispas y estrellas que suben girando (más cuantas más estrellas)
 evolve(star,big){
   if(this.evoFx) this.endEvo(); this.evoT=0; this.evoBig=!!big;
   const g=new THREE.Group(), n=big?34:6*star+2; this.root.add(g); this.evoFx=g;
   for(let i=0;i<n;i++){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:starTex,color:star>=3?'#ffe58a':'#ffd24a',transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})); sp.userData={a:i/n*TAU,r:.3+Math.random()*.35,v:1+Math.random()*1.3,s:.26+Math.random()*.2+star*.05,d:Math.random()*.3}; sp.scale.setScalar(.01); g.add(sp); }
   const pil=new THREE.Mesh(new THREE.CylinderGeometry(.5,.75,5,24,1,true),addMat('#ffd24a')); pil.position.y=2.5; g.add(pil); g.userData.pil=pil;
   const ring=new THREE.Mesh(new THREE.RingGeometry(.4,.62,40),addMat('#fff3b0')); ring.rotation.x=-Math.PI/2; ring.position.y=TOP+.03; g.add(ring); g.userData.ring=ring;
   burst(this.root.position.clone().setY(TOP+.7),['#fff3b0','#ffd24a','#ffffff'],big?60:12+star*10,big?4.2:3.2,{up:3,size:.3});
   if(big){ shake=Math.max(shake,.12); const sph=new THREE.Mesh(new THREE.SphereGeometry(.9,24,16),addMat('#ffffff')); sph.position.y=.8; g.add(sph); g.userData.sph=sph; }
 }
 stepEvo(dt){
   const g=this.evoFx, T=this.evoT+=dt;
   for(const sp of g.children){ const u=sp.userData; if(u.a===undefined) continue; const t=Math.max(0,T-u.d), a=u.a+t*2.4, r=u.r*(1+t*.9);
     sp.position.set(Math.cos(a)*r,TOP+.25+t*u.v,Math.sin(a)*r); sp.material.opacity=clamp(1-(t-.6)/.9,0,1); sp.scale.setScalar(u.s*clamp(t/.15,0,1)); sp.material.rotation=t*3; }
   const pil=g.userData.pil, ring=g.userData.ring; pil.material.opacity=.55*clamp(1-T/.9,0,1); pil.scale.set(1+T*.4,1,1+T*.4);
   ring.scale.setScalar(1+T*2.2); ring.material.opacity=clamp(1-T/.8,0,1);
   if(g.userData.sph){ const k=T/1.6; g.userData.sph.scale.setScalar(.3+Math.sin(Math.min(1,k)*Math.PI)*1.1); g.userData.sph.material.opacity=.7*Math.sin(Math.min(1,k)*Math.PI); }
   if(T>(this.evoBig?2.2:1.7)) this.endEvo();
 }
 endEvo(){ const g=this.evoFx; if(!g) return; this.root.remove(g); g.traverse(o=>{ if(o.material) o.material.dispose(); if(o.isMesh) o.geometry.dispose(); }); this.evoFx=null; }
 setAlpha(a){
   if(this.alpha===a) return; this.alpha=a;
   if(this.mats) for(const mt of this.mats){ mt.transparent=a<1||mt.userData.wasT; mt.opacity=a; mt.depthWrite=a>=1; }
   if(this.sprite) this.sprite.material.opacity=a;
   this.ring.material.opacity=.9*a;
 }
 head(){ return new THREE.Vector3(this.root.position.x,this.body.position.y+this.h*1.0,this.root.position.z); }
 dispose(){ scene.remove(this.root); if(this.mixer) this.mixer.stopAllAction(); if(this.mats) for(const m of this.mats) m.dispose(); }
}

/* ---------- efectos ---------- */
const fxVis=new Map();
const addMat=c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
// Para marcas en el suelo: mezcla normal, que se lee bien también sobre la hierba clara
const flatMat=c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:1,depthWrite:false,side:THREE.DoubleSide});
const glowSprite=(c,s)=>{ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:c,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})); sp.scale.set(s,s,1); return sp; };
let shake=0;
function fxPos(cellPx,c,r,h=.6){ const [x,y]=cellPx(c,r); return W3(x,y,TOP+h); }
// Rayo quebrado entre dos puntos hecho con tramos de cilindro (se rehace cada fotograma)
function boltMesh(n,c,w){ const g=new THREE.Group(); for(let i=0;i<n;i++){ const m=new THREE.Mesh(new THREE.CylinderGeometry(w,w,1,4,1,true),addMat(c)); g.add(m); } g.userData.core=[]; for(let i=0;i<n;i++){ const m=new THREE.Mesh(new THREE.CylinderGeometry(w*.35,w*.35,1,4,1,true),addMat('#ffffff')); g.add(m); g.userData.core.push(m); } return g; }
const UPV=new THREE.Vector3(0,1,0);
function placeSeg(m,a,b){ const d=b.clone().sub(a), L=d.length(); m.position.copy(a).addScaledVector(d,.5); m.scale.set(1,Math.max(L,1e-3),1); m.quaternion.setFromUnitVectors(UPV,d.normalize()); }
function layBolt(g,a,b,jit){
 const n=g.children.length/2, pts=[a.clone()];
 for(let i=1;i<n;i++){ const p=a.clone().lerp(b,i/n); p.x+=rnd(jit); p.y+=rnd(jit); p.z+=rnd(jit); pts.push(p); } pts.push(b.clone());
 for(let i=0;i<n;i++){ placeSeg(g.children[i],pts[i],pts[i+1]); placeSeg(g.children[n+i],pts[i],pts[i+1]); }
}
function makeFx(f,F){
 const el=elOf(f), C=el.c, v={obj:null,done:false};
 const cp=F.cellPx;
 switch(f.type){
  case 'proj': { const g=new THREE.Group(); const core=glowSprite(C[2],f.big?.9:.5), halo=glowSprite(C[1],f.big?1.6:.9); g.add(halo,core); v.obj=g; v.a=fxPos(cp,f.fc,f.fr,.6); v.b=fxPos(cp,f.tc,f.tr,.55); break; }
  case 'beam': { const g=new THREE.Group(); const a=fxPos(cp,f.fc,f.fr,.6), b=fxPos(cp,f.tc,f.tr,.6); const d=b.clone().sub(a); d.y=0; d.normalize(); const e=a.clone().addScaledVector(d,16);
    const outer=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,1,12,1,true),addMat(C[1])), inner=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,1,8,1,true),addMat('#ffffff'));
    placeSeg(outer,a,e); placeSeg(inner,a,e); g.add(outer,inner); v.obj=g; v.a=a; v.d=d; break; }
  case 'zap': { v.obj=boltMesh(7,C[1],.07); v.a=fxPos(cp,f.fc,f.fr,.6); v.b=fxPos(cp,f.tc,f.tr,.55); break; }
  case 'area': { const g=new THREE.Group(), [x,y]=cp(f.c,f.r), p=W3(x,y,TOP+.03); const disc=new THREE.Mesh(new THREE.CircleGeometry(1,40),addMat(C[1])); disc.rotation.x=-Math.PI/2; const ring=new THREE.Mesh(new THREE.RingGeometry(.9,1,48),addMat(C[2])); ring.rotation.x=-Math.PI/2; g.add(disc,ring); g.position.copy(p); v.obj=g; v.p=p; v.rad=f.rad*1.73; if(f.thin) disc.visible=false;
    elBurst(el,p.clone().add(new THREE.Vector3(0,.2,0)),Math.min(60,14+f.rad*14),2.2+f.rad*1.4,{up:1.5,spread:f.rad*.5}); break; }
  case 'meteor': { const g=new THREE.Group(); g.add(glowSprite(C[1],1.4),glowSprite(C[2],.7)); v.obj=g; v.b=fxPos(cp,f.c,f.r,.2); v.a=v.b.clone().add(new THREE.Vector3(2.2,7,-1.5)); break; }
  case 'swing': { const a=fxPos(cp,f.c,f.r,.55), b=fxPos(cp,f.tc,f.tr,.55); const m=new THREE.Mesh(new THREE.RingGeometry(.55,.72,16,1,-.9,1.8),addMat('#ffffff')); m.position.copy(a.clone().lerp(b,.55)); m.lookAt(a); v.obj=m; break; }
  case 'hits': { const g=new THREE.Group(), p=fxPos(cp,f.c,f.r,.6); for(let i=0;i<f.n;i++){ const s=new THREE.Mesh(new THREE.PlaneGeometry(1.3,.09),addMat(i%2?C[2]:'#ffffff')); s.rotation.set(rnd(.5),0,i*1.1+.4); g.add(s); } g.position.copy(p); v.obj=g; v.p=p; elBurst(el,p,10,2.5,{size:.18}); break; }
  case 'trail': { const a=fxPos(cp,f.fc,f.fr,.5), b=fxPos(cp,f.tc,f.tr,.5); for(let i=0;i<14;i++){ const q=a.clone().lerp(b,i/13); emit({p:q,v:[rnd(.3),rnd(.3),rnd(.3)],col:C[i%3],size:.5,size1:.05,life:.4}); } v.done=true; break; }
  case 'plus': { const p=fxPos(cp,f.c,f.r,.2); for(let i=0;i<10;i++) emit({p:p.clone().add(new THREE.Vector3(rnd(.45),Math.random()*.6,rnd(.45))),v:[0,1.4+Math.random(),0],col:i%2?'#7dffa8':'#ffffff',size:.22,size1:.05,life:.8}); v.done=true; break; }
  case 'arrows': { const p=fxPos(cp,f.c,f.r,.1); for(let i=0;i<12;i++){ const a=i/12*TAU; emit({p:p.clone().add(new THREE.Vector3(Math.cos(a)*.5,0,Math.sin(a)*.5)),v:[0,2.2,0],col:i%2?'#ffd23f':'#fff3b0',size:.2,size1:.05,life:.7}); } v.done=true; break; }
  case 'coins': { const g=new THREE.Group(); for(let i=0;i<3;i++){ const c=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.04,16),new THREE.MeshStandardMaterial({color:'#ffd23f',emissive:'#a87400',metalness:.8,roughness:.3})); c.rotation.x=Math.PI/2; g.add(c); } v.obj=g; v.a=fxPos(cp,f.fc,f.fr,.6); v.b=fxPos(cp,f.tc,f.tr,.5); break; }
  case 'ring': { const p=fxPos(cp,f.c,f.r,.05); const m=new THREE.Mesh(new THREE.RingGeometry(.85,1,40),addMat(f.color||'#ffffff')); m.rotation.x=-Math.PI/2; m.position.copy(p); v.obj=m; break; }
  // ---- habilidades nuevas ----
  case 'cone': { const a=fxPos(cp,f.fc,f.fr,.05), b=fxPos(cp,f.tc,f.tr,.05); const d=b.clone().sub(a); d.y=0; d.normalize(); const L=f.len*1.73+.6;
    const m=new THREE.Mesh(new THREE.CircleGeometry(L,24,-.56,1.12),flatMat(C[0])); m.position.copy(a);
    const inner=new THREE.Mesh(new THREE.CircleGeometry(L*.8,24,-.4,.8),addMat(C[2])); inner.position.z=.01; m.add(inner);
    // la geometría del círculo va en XY: tras tumbarla, el ángulo 0 apunta a +X y la giramos hacia d
    m.rotation.set(-Math.PI/2,0,-Math.atan2(d.z,d.x)); v.obj=m; v.a=a; v.d=d; v.L=L; break; }
  case 'wave': { const a=fxPos(cp,f.fc,f.fr,0), b=fxPos(cp,f.tc,f.tr,0); const d=b.clone().sub(a); d.y=0; d.normalize(); const W=f.w*2*1.2;
    const g=new THREE.Group(); const wall=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,W,16,1,true,-Math.PI/2,Math.PI),new THREE.MeshStandardMaterial({color:C[1],emissive:C[0],emissiveIntensity:.5,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}));
    wall.rotation.z=Math.PI/2; g.add(wall);
    const sheet=new THREE.Mesh(new THREE.PlaneGeometry(W,2.6),flatMat(C[1])); sheet.rotation.x=-Math.PI/2; sheet.position.set(0,.03,-1.3); sheet.material.opacity=.45; g.add(sheet);
    const foam=new THREE.Mesh(new THREE.PlaneGeometry(W,.35),addMat('#ffffff')); foam.rotation.x=-Math.PI/2; foam.position.set(0,.05,.05); g.add(foam); g.position.copy(a); g.rotation.y=Math.atan2(d.x,d.z); v.obj=g; v.a=a; v.d=d; v.W=W; break; }
  case 'tele': { const p=fxPos(cp,f.c,f.r,.03), R=f.rad*1.73; const g=new THREE.Group();
    const ring=new THREE.Mesh(new THREE.RingGeometry(R*.9,R,48),flatMat('#ff3020')); const fill=new THREE.Mesh(new THREE.CircleGeometry(R,48),flatMat('#ff5040')); fill.material.opacity=.25;
    for(const m of [ring,fill]){ m.rotation.x=-Math.PI/2; g.add(m); } g.position.copy(p); v.obj=g; v.fill=fill; break; }
  case 'strike': { const p=fxPos(cp,f.c,f.r,0), R=f.rad*1.73; v.p=p; shake=Math.max(shake,.16);
    if(f.el==='Eléctrico'){ const g=new THREE.Group(); for(let i=0;i<3;i++){ const b=boltMesh(9,C[1],.11-i*.025); b.userData.off=new THREE.Vector3(rnd(R*.5),0,rnd(R*.5)); g.add(b); } v.obj=g; v.kind='bolt'; }
    else if(f.v==='rocks'||f.el==='Roca'){ const g=new THREE.Group(); for(let i=0;i<7;i++){ const m=new THREE.Mesh(new THREE.DodecahedronGeometry(.28+Math.random()*.25,0),new THREE.MeshStandardMaterial({color:C[Math.random()*2|0],flatShading:true})); m.userData.o=new THREE.Vector3(rnd(R*.8),6+Math.random()*3,rnd(R*.8)); m.userData.k=.15+Math.random()*.25; m.castShadow=true; g.add(m); } g.position.copy(p); v.obj=g; v.kind='rocks'; }
    else { const col2=new THREE.Mesh(new THREE.CylinderGeometry(R*.32,R*.5,7,24,1,true),addMat(C[1])); col2.material.opacity=.5; col2.position.copy(p).setY(3.5); v.obj=col2; v.kind='pillar'; elBurst(el,p.clone().setY(TOP+.2),40,3,{up:3,size:.35}); }
    const ring=new THREE.Mesh(new THREE.RingGeometry(.8,1,48),addMat(C[2])); ring.rotation.x=-Math.PI/2; ring.position.copy(p).setY(TOP+.04); scene.add(ring); v.ring=ring; v.R=R; break; }
  case 'zone': { const p=fxPos(cp,f.c,f.r,.03), R=f.rad*1.73; const g=new THREE.Group();
    const disc=new THREE.Mesh(new THREE.CircleGeometry(R,48),flatMat(f.heal?'#7dffa8':C[1])); disc.material.opacity=.3; const ring=new THREE.Mesh(new THREE.RingGeometry(R*.9,R,48),flatMat(f.heal?'#3fd27a':C[0]));
    const runes=new THREE.Mesh(new THREE.RingGeometry(R*.55,R*.6,6),addMat(f.heal?'#ffffff':C[2]));
    for(const m of [disc,ring,runes]){ m.rotation.x=-Math.PI/2; g.add(m); } g.position.copy(p); v.obj=g; v.p=p; v.R=R; v.runes=runes; break; }
  case 'tether': { const g=new THREE.Group(); for(let i=0;i<10;i++){ const m=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,1,5,1,true),new THREE.MeshStandardMaterial({color:i%2?'#3a8f2c':'#58b048',emissive:'#1f5a14',transparent:true})); g.add(m); } v.obj=g; break; }
  case 'mark': { const g=new THREE.Group(); const ring=new THREE.Mesh(new THREE.TorusGeometry(.38,.05,8,24),addMat(C[1])); ring.rotation.x=Math.PI/2; const tip=new THREE.Mesh(new THREE.ConeGeometry(.16,.32,4),addMat(C[2])); tip.rotation.x=Math.PI; tip.position.y=.35; g.add(ring,tip); v.obj=g; break; }
  case 'aura': { const ring=new THREE.Mesh(new THREE.RingGeometry(.55,.75,32),addMat(f.color||C[1])); ring.rotation.x=-Math.PI/2; v.obj=ring; break; }
  case 'spin': { const g=new THREE.Group(); for(let i=0;i<3;i++){ const m=new THREE.Mesh(new THREE.TorusGeometry(.75+i*.12,.06,6,32,4.2),addMat(C[i])); m.rotation.x=Math.PI/2; m.position.y=.2+i*.25; g.add(m); } v.obj=g; break; }
  case 'leap': { const a=fxPos(cp,f.fc,f.fr,.3), b=fxPos(cp,f.tc,f.tr,.3); for(let i=0;i<22;i++){ const q=i/21, pt=a.clone().lerp(b,q); pt.y+=Math.sin(q*Math.PI)*1.6; emit({p:pt,v:[rnd(.2),rnd(.2),rnd(.2)],col:C[i%3],size:.42,size1:.05,life:.45+q*.2}); } v.done=true; break; }
  case 'vortex': { const p=fxPos(cp,f.c,f.r,.05), R=f.rad*1.73; const m=new THREE.Mesh(new THREE.RingGeometry(.2,R,48,1,0,Math.PI*1.6),addMat(C[1])); m.rotation.x=-Math.PI/2; m.position.copy(p); v.obj=m; v.p=p; v.R=R; break; }
  default: return null;
 }
 if(f.type==='area'&&f.quake){ shake=Math.max(shake,.14); const p=fxPos(cp,f.c,f.r,.1); burst(p,['#8a7a5a','#b8a47a','#6b5a3a'],26,3.2,{up:2.5,g:8,add:false,size:.22,size1:.18,life:.8,spread:f.rad*.6}); }
 if(f.type==='area'&&f.notes){ const p=fxPos(cp,f.c,f.r,.6); for(let i=0;i<10;i++) emit({p:p.clone().add(new THREE.Vector3(rnd(f.rad),Math.random()*.4,rnd(f.rad))),v:[rnd(.3),.8+Math.random()*.6,rnd(.3)],col:i%2?'#c9a7ff':'#ffffff',size:.24,size1:.08,life:1.1}); }
 if(f.type==='proj'&&f.heal&&v.obj) v.obj.children.forEach(s=>s.material.color.set('#7dffa8'));
 if(v.obj){ v.obj.renderOrder=11; scene.add(v.obj); }
 return v;
}
function updFx(f,v,F,dt){
 const p=clamp(f.t/f.life,0,1), el=elOf(f), C=el.c;
 const fade=o=>o.traverse(m=>{ if(m.material) m.material.opacity=1-p; });
 switch(f.type){
  case 'proj': { const q=Math.min(1,p*1.15), pos=v.a.clone().lerp(v.b,q); pos.y+=Math.sin(q*Math.PI)*(f.big?.6:.35); v.obj.position.copy(pos); v.obj.children[0].material.rotation+=dt*6;
    emit({p:pos,v:[rnd(.3),rnd(.3)-el.g*.05,rnd(.3)],col:C[Math.random()*3|0],size:f.big?.38:.22,size1:.04,life:el.life*.6,add:el.add!==false?true:false,g:el.g*.3});
    if(q>=1&&!v.hit){ v.hit=true; v.obj.visible=false; elBurst(el,v.b,f.big?24:10,f.big?3:2,{size:f.big?.3:.2}); } break; }
  case 'beam': { const w=1-p; v.obj.children[0].scale.x=v.obj.children[0].scale.z=w*(1+.15*Math.sin(f.t*60)); v.obj.children[1].scale.x=v.obj.children[1].scale.z=w; fade(v.obj);
    for(let i=0;i<4;i++){ const d=Math.random()*12; emit({p:v.a.clone().addScaledVector(v.d,d).add(new THREE.Vector3(rnd(.3),rnd(.3),rnd(.3))),v:[rnd(1),rnd(1)+(-el.g*.2),rnd(1)],col:C[Math.random()*3|0],size:.3,size1:.05,life:.4}); } break; }
  case 'zap': { layBolt(v.obj,v.a,v.b,.28); fade(v.obj); if(!v.hit){ v.hit=true; elBurst(el,v.b,12,3,{size:.18}); } break; }
  case 'area': { const r=v.rad*(.35+.65*Math.min(1,p*1.6)); v.obj.scale.set(r,1,r); v.obj.children[0].material.opacity=(1-p)*.5; v.obj.children[1].material.opacity=1-p; break; }
  case 'meteor': { const q=Math.min(1,p*1.6); v.obj.position.copy(v.a.clone().lerp(v.b,q)); emit({p:v.obj.position.clone(),v:[rnd(.4),rnd(.4),rnd(.4)],col:C[Math.random()*3|0],size:.55,size1:.05,life:.45});
    if(q>=1&&!v.hit){ v.hit=true; v.obj.visible=false; elBurst(el,v.b,30,3.5,{up:2.5,size:.32}); shake=Math.max(shake,.12);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),addMat(C[1])); ring.rotation.x=-Math.PI/2; ring.position.copy(v.b).setY(TOP+.03); scene.add(ring); v.ring=ring; }
    if(v.ring){ const k=(p-.62)/.38; v.ring.scale.setScalar(.3+k*1.6); v.ring.material.opacity=1-k; } break; }
  case 'swing': { v.obj.material.opacity=1-p; v.obj.rotateZ(dt*8); break; }
  case 'hits': { v.obj.scale.setScalar(.6+p*.6); fade(v.obj); v.obj.lookAt(camera.position); break; }
  case 'coins': { v.obj.children.forEach((c,i)=>{ const q=clamp(p*1.3-i*.12,0,1); const pos=v.a.clone().lerp(v.b,q); pos.y+=Math.sin(q*Math.PI)*1.4; c.position.copy(pos); c.rotation.z+=dt*12; c.visible=q<1; if(q>=1&&!c.userData.hit){ c.userData.hit=true; burst(v.b,['#ffd23f','#fff3b0'],6,2,{size:.15}); } }); break; }
  case 'ring': { v.obj.scale.setScalar(.4+p*.9); v.obj.material.opacity=1-p; break; }
  case 'cone': { const k=Math.min(1,p*2.2); v.obj.scale.setScalar(.25+.75*k); v.obj.material.opacity=(1-p)*.5; v.obj.children[0].material.opacity=(1-p)*.8;
    if(p<.65) for(let i=0;i<5;i++){ const ang=rnd(.5), dir=new THREE.Vector3(v.d.x*Math.cos(ang)-v.d.z*Math.sin(ang),0,v.d.x*Math.sin(ang)+v.d.z*Math.cos(ang)), sp=v.L/.45*(.6+Math.random()*.5);
      emit({p:v.a.clone().add(new THREE.Vector3(0,.5,0)),v:[dir.x*sp,(-el.g*.15)+rnd(.4),dir.z*sp],col:C[Math.random()*3|0],size:.6,size1:1.2,life:.45,drag:1.5,add:el.add!==false}); } break; }
  case 'wave': { const dist=p*12; v.obj.position.copy(v.a).addScaledVector(v.d,dist); v.obj.children[0].material.opacity=.75*(1-p*p); v.obj.children[1].material.opacity=.45*(1-p); v.obj.children[2].material.opacity=1-p; const s=Math.sin(Math.min(1,p*3)*Math.PI/2); v.obj.children[0].scale.set(s+.05,1,s+.05);
    for(let i=0;i<4;i++){ const side=new THREE.Vector3(v.d.z,0,-v.d.x).multiplyScalar(rnd(v.W/2)); emit({p:v.obj.position.clone().add(side).add(new THREE.Vector3(0,.4+Math.random()*.6,0)),v:[v.d.x*4+rnd(1),2+Math.random()*2,v.d.z*4+rnd(1)],col:i%2?'#ffffff':C[2],size:.22,size1:.06,life:.6,g:el.g||6}); } break; }
  case 'tele': { v.fill.scale.setScalar(Math.max(.02,p)); v.fill.material.opacity=.2+.25*p; v.obj.children[0].material.opacity=.5+.5*Math.abs(Math.sin(f.t*14)); break; }
  case 'strike': { const R=v.R;
    if(v.kind==='bolt'){ v.obj.children.forEach(b=>{ const o=b.userData.off, base=v.p.clone().add(o); layBolt(b,base.clone().setY(10),base.setY(TOP),.45); b.traverse(m=>{ if(m.material) m.material.opacity=p<.5?1:(1-p)*2; }); }); if(!v.hit){ v.hit=true; elBurst(el,v.p.clone().setY(TOP+.2),40,4,{up:3,size:.3}); } }
    else if(v.kind==='rocks'){ v.obj.children.forEach(m=>{ const o=m.userData.o, q=clamp((p-m.userData.k*.6)/.35,0,1); m.position.set(o.x,lerp(o.y,TOP+.2,q*q),o.z); m.rotation.x+=dt*5; m.visible=p<.85; if(q>=1&&!m.userData.hit){ m.userData.hit=true; burst(v.p.clone().add(new THREE.Vector3(o.x,TOP+.2,o.z)),['#8a7a5a','#b8a47a'],8,2.5,{up:2,g:8,add:false,size:.2,size1:.15,life:.7}); shake=Math.max(shake,.1); } }); }
    else { const s=1-p; v.obj.scale.set(s,1,s); v.obj.material.opacity=.5*(1-p); }
    v.ring.scale.setScalar(R*(.4+p)); v.ring.material.opacity=1-p; break; }
  case 'zone': { const R=v.R, a=p<.08?p/.08:p>.85?(1-p)/.15:1; v.obj.children[0].material.opacity=.28*a; v.obj.children[1].material.opacity=.9*a; v.runes.material.opacity=.7*a; v.runes.rotation.z+=dt*1.2;
    const n=f.heal?2:3; for(let i=0;i<n;i++){ const ang=Math.random()*TAU, rr=Math.sqrt(Math.random())*R, pos=v.p.clone().add(new THREE.Vector3(Math.cos(ang)*rr,.1,Math.sin(ang)*rr));
      if(f.v==='sand') emit({p:pos.add(new THREE.Vector3(0,Math.random()*1.4,0)),v:[-Math.sin(ang)*3,rnd(.3),Math.cos(ang)*3],col:['#c8a060','#e0c088','#a07840'][i%3],size:.2,size1:.12,life:.7,add:false,drag:.5});
      else if(f.heal) emit({p:pos,v:[0,1.2+Math.random(),0],col:i%2?'#7dffa8':'#ffffff',size:.22,size1:.04,life:.9});
      else emit({p:pos,v:[rnd(.3),(-el.g*.25)+.8,rnd(.3)],col:C[Math.random()*3|0],size:.32,size1:.08,life:el.life,g:Math.max(0,el.g*.3),add:el.add!==false}); } break; }
  case 'tether': { if(f.u.dead||f.t.dead){ v.obj.visible=false; break; } const a=upos(F,f.u,.6), b=upos(F,f.t,.6), n=v.obj.children.length; let prev=a;
    for(let i=1;i<=n;i++){ const q=i/n, pt=a.clone().lerp(b,q); pt.y+=Math.sin(q*Math.PI)*.5+Math.sin(f.t*6+q*9)*.05; placeSeg(v.obj.children[i-1],prev,pt); prev=pt; }
    if(Math.random()<.5){ const q=Math.random(), pt=b.clone().lerp(a,q); pt.y+=Math.sin(q*Math.PI)*.5; emit({p:pt,v:[(a.x-b.x)*1.2,0,(a.z-b.z)*1.2],col:'#7dffa8',size:.2,size1:.04,life:.5}); }
    v.obj.children.forEach(m=>m.material.opacity=p>.9?(1-p)*10:1); break; }
  case 'mark': { if(f.u.dead){ v.obj.visible=false; break; } const h=upos(F,f.u,0); v.obj.position.copy(h).setY(h.y+1.9+Math.sin(f.t*4)*.08); v.obj.rotation.y+=dt*3; v.obj.children.forEach(m=>m.material.opacity=p>.9?(1-p)*10:.9); break; }
  case 'aura': { if(f.u.dead){ v.obj.visible=false; break; } const h=upos(F,f.u,.02); v.obj.position.copy(h); v.obj.scale.setScalar(1+.12*Math.sin(f.t*8)); v.obj.material.opacity=(p>.8?(1-p)*5:1)*.8;
    if(Math.random()<.6) emit({p:h.clone().add(new THREE.Vector3(rnd(.45),Math.random()*.3,rnd(.45))),v:[0,1+Math.random(),0],col:f.color||C[Math.random()*3|0],size:.18,size1:.03,life:.7}); break; }
  case 'spin': { if(f.u.dead){ v.obj.visible=false; break; } v.obj.position.copy(upos(F,f.u,0)); v.obj.rotation.y-=dt*16; v.obj.children.forEach(m=>m.material.opacity=1-p*.6);
    emit({p:v.obj.position.clone().add(new THREE.Vector3(rnd(.8),.4+Math.random()*.5,rnd(.8))),v:[rnd(2),.5,rnd(2)],col:C[Math.random()*3|0],size:.2,size1:.05,life:.4,g:el.g}); break; }
  case 'vortex': { v.obj.rotation.z+=dt*7; v.obj.material.opacity=1-p; v.obj.scale.setScalar(1-p*.5);
    for(let i=0;i<4;i++){ const ang=Math.random()*TAU, pos=v.p.clone().add(new THREE.Vector3(Math.cos(ang)*v.R,.3,Math.sin(ang)*v.R)); emit({p:pos,v:[-Math.cos(ang)*v.R*2+Math.sin(ang)*2,.2,-Math.sin(ang)*v.R*2-Math.cos(ang)*2],col:C[i%3],size:.28,size1:.04,life:.45,drag:.5}); } break; }
 }
}
const upos=(F,u,h)=>{ const [x,y]=F.unitPx(u); return W3(x,y,TOP+h); };
function killFx(v){ for(const o of [v.obj,v.ring]) if(o&&o.parent){ scene.remove(o); o.traverse(m=>{ if(m.geometry&&m.geometry!==shieldGeo) m.geometry.dispose(); if(m.material) m.material.dispose(); }); } }

/* ---------- campos de fuerza del carrusel ---------- */
// Burbuja translúcida con los colores de la ball de su turno de salida; el anillo de fuera se vacía en los 3 s antes de abrirse
const BALLS={poke:['#ff4a3a','#ffffff',null],great:['#3a8cff','#ffffff','#ff4a5a'],ultra:['#2a2a32','#ffffff','#ffd23a'],master:['#8a3cd8','#ffffff','#ff6fb0']};
const bubVis=new Map();
function makeBubble(o){
 const [top,,acc]=BALLS[o.ball]||BALLS.poke, g=new THREE.Group();
 const dome=new THREE.Mesh(new THREE.SphereGeometry(.95,32,16),new THREE.MeshStandardMaterial({color:'#cfeaff',emissive:'#3a7ab8',emissiveIntensity:.25,transparent:true,opacity:.2,depthWrite:false,roughness:.1,metalness:.1,side:THREE.DoubleSide}));
 g.add(dome);
 const halo=glowSprite('#9fd8ff',2.4); halo.material.opacity=.25; g.add(halo);
 const ring=new THREE.Mesh(new THREE.RingGeometry(1.05,1.25,64,1,0,TAU),addMat(acc||top)); ring.rotation.x=-Math.PI/2; ring.position.y=-.85; g.add(ring);
 scene.add(g); return {g,ring,k:1,col:acc||top};
}
const PAD_COL={poke:['#cf5a4e',null],great:['#4f7cc9','#cf6474'],ultra:['#3b3b45','#d9b84c'],master:['#7a52b8','#d987b4']}, padTex={}, padVis=new Map();
function padTexture(kind){
 if(padTex[kind]) return padTex[kind];
 const [top,acc]=PAD_COL[kind]||PAD_COL.poke;
 return padTex[kind]=canvasTex(256,256,(c,w)=>{ const m=w/2, R=w*.46;
   c.save(); c.beginPath(); c.arc(m,m,R,0,Math.PI*2); c.clip();
   c.fillStyle='#ece6da'; c.fillRect(0,0,w,w); c.fillStyle=top; c.fillRect(0,0,w,m);
   if(kind==='great'&&acc){ c.fillStyle=acc; for(const sx of [-1,1]){ c.beginPath(); c.ellipse(m+sx*R*.55,m-R*.42,R*.16,R*.36,sx*.5,0,Math.PI*2); c.fill(); } }
   if(kind==='ultra'&&acc){ c.fillStyle=acc; c.fillRect(m-R*.75,m-R*.62,R*.32,R*.62); c.fillRect(m+R*.43,m-R*.62,R*.32,R*.62); }
   if(kind==='master'&&acc){ c.fillStyle=acc; for(const sx of [-1,1]){ c.beginPath(); c.arc(m+sx*R*.55,m-R*.48,R*.17,0,Math.PI*2); c.fill(); }
     c.fillStyle='#f4eef8'; c.font='bold '+(R*.42|0)+'px sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('M',m,m-R*.5); }
   c.restore();
   c.lineWidth=R*.09; c.strokeStyle='#2a2a33'; c.beginPath(); c.moveTo(m-R,m); c.lineTo(m+R,m); c.stroke();
   c.beginPath(); c.arc(m,m,R,0,Math.PI*2); c.stroke();
   c.fillStyle='#ece6da'; c.beginPath(); c.arc(m,m,R*.2,0,Math.PI*2); c.fill(); c.stroke();
 },false);
}
function stepPads(list){
 const seen=new Set();
 for(const o of list||[]){ let v=padVis.get(o.id);
   if(!v||v.ball!==o.ball){ if(v) scene.remove(v.m); v={ball:o.ball,m:new THREE.Mesh(new THREE.CircleGeometry(1.15,40),new THREE.MeshBasicMaterial({map:padTexture(o.ball),transparent:true,opacity:.8,depthWrite:false}))}; v.m.rotation.x=-Math.PI/2; scene.add(v.m); padVis.set(o.id,v); }
   seen.add(o.id); const p=W3(o.x,o.y,0); v.m.position.set(p.x,.03,p.z); v.m.material.opacity=o.dim?.35:.7; }
 for(const [id,v] of padVis) if(!seen.has(id)){ scene.remove(v.m); v.m.geometry.dispose(); v.m.material.dispose(); padVis.delete(id); }
}
function stepBubbles(list,now){
 const seen=new Set();
 for(const o of list||[]){ let v=bubVis.get(o.id); if(!v){ v=makeBubble(o); bubVis.set(o.id,v); } seen.add(o.id);
   const p=W3(o.x,o.y,0); v.g.position.set(p.x,TOP+.95+Math.sin(now*2+o.id)*.04,p.z); v.g.rotation.y=now*.4;
   if(Math.abs(v.k-o.k)>.004){ v.k=o.k; v.ring.geometry.dispose(); v.ring.geometry=new THREE.RingGeometry(1.05,1.25,64,1,Math.PI/2,TAU*Math.max(.001,o.k)); } }
 for(const [id,v] of bubVis) if(!seen.has(id)){ burst(v.g.position.clone(),[v.col,'#ffffff'],30,3,{up:2,size:.28}); scene.remove(v.g); v.g.traverse(m=>{ if(m.geometry&&m!==v.g) m.geometry.dispose(); if(m.material) m.material.dispose(); }); bubVis.delete(id); }
}

/* ---------- tótem de aumentos y cristales de intereses ---------- */
// El tótem (a la izquierda del tablero) sostiene los aumentos; game.js dibuja encima sus iconos.
// Los 5 cristales (junto al banquillo) se encienden con el oro de intereses de la ronda.
let totem=null; const crystals=[];
function buildProps(){
 const g=new THREE.Group(), gold=new THREE.MeshStandardMaterial({color:'#e8b84a',metalness:.75,roughness:.3,emissive:'#4a3000',emissiveIntensity:.3});
 const stone=new THREE.MeshStandardMaterial({color:'#3a3f5c',roughness:.7}), gem=new THREE.MeshStandardMaterial({color:'#b9a6ff',emissive:'#6a4bff',emissiveIntensity:.8,roughness:.2,metalness:.2});
 const base=new THREE.Mesh(new THREE.CylinderGeometry(.42,.5,.22,8),gold); base.position.y=.11;
 const col=new THREE.Mesh(new THREE.CylinderGeometry(.16,.24,1.25,8),stone); col.position.y=.85;
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.24,.05,8,24),gold); ring.rotation.x=Math.PI/2; ring.position.y=1.2;
 // Master Ball: mitad morada con dos bultos rosas y la "M", mitad blanca, franja negra y botón
 const top=new THREE.Group(), mb=(c)=>new THREE.MeshStandardMaterial({color:c,roughness:.3,metalness:.1});
 const up=new THREE.Mesh(new THREE.SphereGeometry(.34,28,14,0,TAU,0,Math.PI/2),mb('#6a2fb8')), dn=new THREE.Mesh(new THREE.SphereGeometry(.34,28,14,0,TAU,Math.PI/2,Math.PI/2),mb('#f4f4f4'));
 const band=new THREE.Mesh(new THREE.CylinderGeometry(.345,.345,.05,28),mb('#15151c')), btn=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.06,18),mb('#f4f4f4')); btn.rotation.x=Math.PI/2; btn.position.z=.34;
 for(const sx of [-1,1]){ const bump=new THREE.Mesh(new THREE.SphereGeometry(.09,14,10),mb('#ff6fb0')); bump.position.set(sx*.17,.21,.21); bump.scale.set(1,.7,.7); top.add(bump); }
 const mTex=canvasTex(64,64,(g2)=>{ g2.fillStyle='#fff'; g2.font='900 46px system-ui'; g2.textAlign='center'; g2.textBaseline='middle'; g2.fillText('M',32,36); },false);
 const mLogo=new THREE.Mesh(new THREE.PlaneGeometry(.2,.2),new THREE.MeshBasicMaterial({map:mTex,transparent:true,depthWrite:false})); mLogo.position.set(0,.2,.29); mLogo.rotation.x=-.6;
 top.add(up,dn,band,btn,mLogo); top.position.y=1.72;
 const halo=glowSprite('#c9a2ff',1.6); halo.position.y=1.72;
 g.add(base,col,ring,top,halo); g.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); g.userData.top=top; scene.add(g); totem=g;
 const cg=new THREE.OctahedronGeometry(.26,0);
 for(let i=0;i<5;i++){ const m=new THREE.Mesh(cg,new THREE.MeshStandardMaterial({color:'#4a6c9a',emissive:'#000000',roughness:.25,metalness:.2,transparent:true,opacity:.65})); m.scale.y=1.9; const h=glowSprite('#7fe0ff',1.3); h.visible=false; const c=new THREE.Group(); c.add(m,h); c.userData={m,h}; scene.add(c); crystals.push(c); }
}
function stepProps(F,now){
 if(!totem) buildProps();
 const T=F.totem; totem.visible=!!T; if(T){ const p=W3(T.x,T.y,0); totem.position.set(p.x,TOP-.05,p.z); totem.userData.top.rotation.y=Math.sin(now*.8)*.6; totem.userData.top.position.y=1.72+Math.sin(now*2)*.05; }
 const I=F.interest; crystals.forEach((c,i)=>{ c.visible=!!I; if(!I) return; const p=W3(I.x,I.y+i*I.dy,0); c.position.set(p.x,TOP+.25+(i<I.n?Math.sin(now*2.5+i)*.05:0),p.z);
   const on=i<I.n, m=c.userData.m; m.material.color.set(on?'#9fe8ff':'#3a4a66'); m.material.emissive.set(on?'#2aa8ff':'#000000'); m.material.emissiveIntensity=on?1:.0; m.material.opacity=on?.95:.55; m.rotation.y=now*(on?1.4:.3); c.userData.h.visible=on; });
}
const totemTop=()=>totem&&totem.visible?projectV(totem.position.clone().setY(TOP+2.2)):null;

/* ---------- orbes de botín ---------- */
// Esfera brillante con halo que flota y gira; la prismática cambia de color. Al abrirla estalla en chispas de su color.
const ORB_COL={gray:['#eef2fa','#9aa6bc','#ffffff'],gold:['#ffe27a','#ffb21f','#fff3b0'],prism:['#ff9ad8','#8fd8ff','#c6ff9c']};
const orbVis=new Map(), orbGeo=new THREE.SphereGeometry(.3,28,20), orbBand=new THREE.TorusGeometry(.33,.035,8,40);
function makeOrb(o){
 const C=ORB_COL[o.tier]||ORB_COL.gray, g=new THREE.Group();
 const core=new THREE.Mesh(orbGeo,new THREE.MeshStandardMaterial({color:C[0],emissive:C[1],emissiveIntensity:.55,roughness:.12,metalness:.35}));
 const band=new THREE.Mesh(orbBand,new THREE.MeshStandardMaterial({color:C[1],emissive:C[1],emissiveIntensity:.8,roughness:.3,metalness:.6})); band.rotation.x=Math.PI/2;
 const halo=glowSprite(C[2],o.tier==='prism'?2:o.tier==='gold'?1.7:1.3); halo.material.opacity=.75;
 g.add(halo,core,band); core.castShadow=true; scene.add(g);
 return {g,core,band,halo,tier:o.tier,ph:Math.random()*TAU};
}
function updOrb(v,now){
 const t=now+v.ph; v.g.position.set(v.pos.x,TOP+.62+Math.sin(t*2.2)*.1,v.pos.z); v.core.rotation.y=t*.8; v.band.rotation.z=t*1.6; v.band.rotation.y=Math.sin(t)*.4;
 v.halo.scale.setScalar((v.tier==='prism'?2:v.tier==='gold'?1.7:1.3)*(1+.08*Math.sin(t*4)));
 if(v.tier==='prism'){ const h=(t*.15)%1; v.core.material.color.setHSL(h,.8,.75); v.core.material.emissive.setHSL((h+.1)%1,.9,.45); v.band.material.emissive.setHSL((h+.5)%1,.9,.55); v.halo.material.color.setHSL((h+.2)%1,.9,.75); }
 if(Math.random()<(v.tier==='gray'?.08:.2)) emit({p:v.g.position.clone().add(new THREE.Vector3(rnd(.35),rnd(.3),rnd(.35))),v:[0,.6,0],col:(ORB_COL[v.tier]||ORB_COL.gray)[2],size:.14,size1:.02,life:.7});
}
function stepOrbs(list,now){
 const seen=new Set();
 for(const o of list||[]){ let v=orbVis.get(o.id); if(!v){ v=makeOrb(o); orbVis.set(o.id,v); } v.pos=W3(o.x,o.y,0); updOrb(v,now); seen.add(o.id); }
 for(const [id,v] of orbVis) if(!seen.has(id)){
   const C=ORB_COL[v.tier]||ORB_COL.gray; burst(v.g.position.clone(),C,v.tier==='gray'?18:34,3.2,{up:2.6,size:.3}); if(v.tier!=='gray') shake=Math.max(shake,.06);
   scene.remove(v.g); v.core.material.dispose(); v.band.material.dispose(); v.halo.material.dispose(); orbVis.delete(id); }
}

/* ---------- escena, cámara y API ---------- */
let hemi, sun;
function init(canvas){
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
 renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 scene=new THREE.Scene();
 camera=new THREE.PerspectiveCamera(30,1,.1,200);
 hemi=new THREE.HemisphereLight('#ffffff','#5a6a40',1.5); scene.add(hemi);
 sun=new THREE.DirectionalLight('#ffffff',2.4); sun.position.set(-6,14,8); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:1,far:40}); sun.shadow.bias=-.0006; sun.shadow.normalBias=.02; scene.add(sun,sun.target);
 PA=makeParticles(true); PN=makeParticles(false); scene.add(PA.pts,PN.pts);
 setQuality(guessQuality());
 ready=true;
}
function setQuality(l){
 qLevel=clamp(l|0,0,2); Q=QL[qLevel]; if(!renderer) return;
 // Al apagar la sombra del sol, three.js recompila los materiales solo (cambia el estado de las luces)
 sun.castShadow=Q.shadow>0;
 if(Q.shadow&&sun.shadow.mapSize.x!==Q.shadow){ sun.shadow.mapSize.set(Q.shadow,Q.shadow); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; } }
 renderer.setPixelRatio(Math.min(dpr0,Q.pr)); if(board.G){ renderer.setSize(M.W,M.H,false); partScale(); }
}
// Vigila los FPS reales en tramos de 2 s; dos tramos seguidos por debajo de 32 bajan un nivel de calidad
const perf={acc:0,n:0,bad:0,fps:0};
function watchPerf(dt){
 if(document.hidden||dt<=0||dt>.25) return; // pestaña oculta o tirón suelto (al cargar un modelo): no cuenta
 perf.acc+=dt; perf.n++; if(perf.acc<2) return;
 perf.fps=perf.n/perf.acc; perf.acc=0; perf.n=0;
 if(perf.fps<32&&qLevel>0){ if(++perf.bad>=2){ perf.bad=0; setQuality(qLevel-1); } } else perf.bad=0;
}
// Ajusta la cámara para que el tablero, el banquillo y los laterales entren en el rectángulo de juego (M.rect).
// El lienzo puede ocupar toda la pantalla: el campo se ve detrás de los paneles y el tablero queda en el hueco central.
function fitCamera(G){
 const full=rc0=>rc0.w<M.W*.9, el=THREE.MathUtils.degToRad(full(M.rect)?40:47), aspect=M.W/M.H, rc=M.rect, lx=rc.w/M.W, ly=rc.h/M.H; camera.aspect=aspect; camera.clearViewOffset();
 const pts=[]; const add=(x,y,h=0)=>pts.push(W3(x,y,h));
 if(curArena==='plaza'&&M.car){ const {cx,cy,rr}=M.car; for(let i=0;i<24;i++){ const a=i/24*Math.PI*2; add(cx+Math.cos(a)*rr*1.38,cy+Math.sin(a)*rr*1.38,0); if(Math.sin(a)<0) add(cx+Math.cos(a)*rr*1.12,cy+Math.sin(a)*rr*1.12,2.2); } } else {
 add(G.ox-G.R*.6,G.pad,1.6); add(G.ox+G.bw+G.R*.6,G.pad,1.6); add(G.ox-G.R*.4,G.pad+G.bh+18+G.bs+G.R*.1,0); add(G.ox+G.bw+G.R*.4,G.pad+G.bh+18+G.bs+G.R*.1,0);
 // A pantalla completa los laterales (entrenadores) pueden quedar fuera del hueco: así el tablero se ve más grande
 if(!full(rc)){ add(G.pad,G.pad+G.bh*.5,0); add(G.W-G.pad,G.pad+G.bh*.5,0); }
 }
 let tz=0;
 const place=D=>{ camera.position.set(0,Math.sin(el)*D,tz+Math.cos(el)*D); camera.lookAt(0,0,tz); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); };
 for(let it=0;it<3;it++){
   let lo=4,hi=80; for(let i=0;i<30;i++){ const D=(lo+hi)/2; place(D); const ok=pts.every(p=>{ const q=p.clone().project(camera); return Math.abs(q.x)<=.97*lx&&Math.abs(q.y)<=.95*ly; }); if(ok) hi=D; else lo=D; }
   place(hi); camDist=hi; let y0=9,y1=-9; for(const p of pts){ const q=p.clone().project(camera); y0=Math.min(y0,q.y); y1=Math.max(y1,q.y); }
   const mid=(y0+y1)/2; if(Math.abs(mid)<.01) break; tz+=-mid*hi*.35;
 }
 // Desplaza la imagen para que el centro del tablero caiga en el centro del rectángulo de juego
 const ox=M.W/2-(rc.x+rc.w/2), oy=M.H/2-(rc.y+rc.h/2); if(Math.abs(ox)>.5||Math.abs(oy)>.5){ camera.setViewOffset(M.W,M.H,ox,oy,M.W,M.H); camera.updateProjectionMatrix(); }
 sun.target.position.set(0,0,tz); sun.position.set(-6,14,tz+8);
 partScale();
}
// Tamaño de las partículas en píxeles del búfer (depende del alto y de la densidad de píxeles)
function partScale(){ const s=renderer.getSize(new THREE.Vector2()); for(const P of [PA,PN]) P.mat.uniforms.uScale.value=s.y*renderer.getPixelRatio()/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)); }
// V: tamaño del lienzo y rectángulo donde debe caber el tablero (por defecto, el lienzo entero)
function resize(G,dpr,V){
 V=V||{W:G.W,H:G.H,rect:{x:0,y:0,w:G.W,h:G.H}};
 Object.assign(M,{W:V.W,H:V.H,rect:V.rect,R:G.R,cx:G.W/2,cz:(G.pad+G.pad+G.bh+18+G.bs)/2});
 dpr0=dpr||1; renderer.setPixelRatio(Math.min(dpr0,Q.pr)); renderer.setSize(V.W,V.H,false);
 buildBoard(G); fitCamera(G);
}
const v3=new THREE.Vector3();
function project(x,y,h=0){ v3.copy(W3(x,y,h)).project(camera); return [(v3.x+1)/2*M.W,(1-v3.y)/2*M.H]; }
function projectV(p){ v3.copy(p).project(camera); return [(v3.x+1)/2*M.W,(1-v3.y)/2*M.H]; }
const ray=new THREE.Raycaster(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),-TOP);
function unproject(sx,sy){ ray.setFromCamera(new THREE.Vector2(sx/M.W*2-1,1-sy/M.H*2),camera); const p=new THREE.Vector3(); if(!ray.ray.intersectPlane(plane,p)) return [-1e4,-1e4]; return [p.x*M.R+M.cx,p.z*M.R+M.cz]; }
let lastT=0;
function render(F){
 if(!ready) return;
 const now=performance.now()/1000, raw=lastT?now-lastT:0, dt=Math.min(.1,raw); lastT=now;
 watchPerf(raw); if(F.car) M.car=F.car; setArena(F.arena);
 if(arenas[curArena]) for(const a of arenas[curArena].userData.anim) a(now);
 // casillas resaltadas al arrastrar
 for(let i=0;i<56;i++){ const mine=i>=28, hi=F.cells&&F.cells.drop&&mine, on=F.cells&&F.cells.hover===i; hexMesh.setColorAt(i,ccol(on?'#ffffff':hi?(Math.sin(now*6)>0?'#9cc8ff':'#b8d8ff'):mine?'#cfe2ff':'#ffd9cf')); }
 hexMesh.instanceColor.needsUpdate=true; hexMesh.material.opacity=F.cells&&F.cells.drop?.7:.38;
 for(let i=0;i<9;i++) benchPads.setColorAt(i,ccol(F.benchHover===i?'#c8d8ff':curArena==='stadium'?'#262638':curArena.startsWith('temple')?'#4e4840':'#583018')); benchPads.instanceColor.needsUpdate=true;
 hexMesh.visible=hexRing.visible=F.arena!=='plaza'&&!!(F.cells&&F.cells.drop);
 // actores
 const seen=new Set();
 for(const s of F.actors){
   let a=actors.get(s.key); if(!a){ a=new Actor(s); actors.set(s.key,a); }
   a.setDex(s.dex); s.glowCol=s.glowCol||ccol(s.glowColor||'#ffffff'); a.update(s,dt,now); seen.add(s.key);
   s.anchor=projectV(a.head()); s.base=projectV(a.root.position.clone().setY(TOP));
 }
 for(const [k,a] of actors) if(!seen.has(k)){ a.dispose(); actors.delete(k); }
 // efectos
 const fseen=new Set();
 for(const f of F.fx){ let v=fxVis.get(f); if(v===undefined){ v=makeFx(f,F); fxVis.set(f,v); } if(v){ fseen.add(f); if(!v.done) updFx(f,v,F,dt); } }
 for(const [f,v] of fxVis) if(!fseen.has(f)){ if(v) killFx(v); fxVis.delete(f); }
 stepOrbs(F.orbs,now); stepProps(F,now); stepBubbles(F.bubbles,now); stepPads(F.pads);
 stepParticles(PA,dt); stepParticles(PN,dt);
 // temblor de cámara en los impactos fuertes
 const base=camera.position.clone(); if(shake>0){ camera.position.x+=rnd(shake); camera.position.y+=rnd(shake); shake=Math.max(0,shake-dt*.6); }
 renderer.render(scene,camera); camera.position.copy(base);
}
/* ---------- retratos (cartas de la tienda y paneles) ---------- */
// La cara de cada modelo se renderiza una sola vez, con fondo transparente, y se guarda como imagen.
// Se encuadra en el hueso de la cabeza (o en la parte alta del modelo si no tiene huesos).
let pR=null, pScene=null; const portraits={}, pWait={};
function portrait(dex,cb){
 if(dex in portraits) return portraits[dex];
 if(cb) (pWait[dex]=pWait[dex]||[]).push(cb);
 const m=wantModel(dex); if(m.status==='ok') makePortrait(dex); else if(m.status==='fail') portraits[dex]='';
 return null;
}
function makePortrait(dex){
 const m=models[dex]; if(dex in portraits||!m||m.status!=='ok') return;
 try{
   if(!pR){ pR=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true}); pR.setSize(300,300,false); pR.outputColorSpace=THREE.SRGBColorSpace; pR.toneMapping=THREE.ACESFilmicToneMapping;
     pScene=new THREE.Scene(); pScene.add(new THREE.HemisphereLight('#ffffff','#6a6a80',2.2)); const l=new THREE.DirectionalLight('#ffffff',2.2); l.position.set(-2,3,4); pScene.add(l); }
   const inst=SkeletonUtils.clone(m.scene), g=new THREE.Group(); inst.position.copy(m.off); g.add(inst); g.scale.setScalar(m.k); pScene.add(g);
   if(m.clips.idle){ const mx=new THREE.AnimationMixer(inst); mx.clipAction(m.clips.idle).play(); mx.update(.4); }
   g.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(g,true), size=box.getSize(new THREE.Vector3()), c=box.getCenter(new THREE.Vector3());
   let head=null; inst.traverse(o=>{ if(!head&&o.isBone&&/^Head$/.test(boneName(o))) head=o; });
   // Sin hueso de cabeza: se encuadra la parte alta de las piezas opacas (el gas de Gastly, por ejemplo, no cuenta)
   const core=new THREE.Box3(); inst.traverse(o=>{ if(o.isMesh&&![].concat(o.material).some(mt=>mt.transparent)) core.expandByObject(o,true); });
   const cb=core.isEmpty()?box:core, cs=cb.getSize(new THREE.Vector3()), cc=cb.getCenter(new THREE.Vector3());
   // De la cadera a la cabeza, visto de tres cuartos: se aleja la cámara hasta que esa parte entera cabe en la imagen
   // Con hueso de cabeza, el tope es la cabeza (las hojas, antenas o crestas muy altas no encogen el retrato)
   const hy=head?head.getWorldPosition(new THREE.Vector3()).y:null, full=Math.max(cb.max.y,box.max.y*.9)-cb.min.y;
   const top=hy!=null?Math.min(Math.max(cb.max.y,box.max.y*.9),hy+full*.22):Math.max(cb.max.y,box.max.y*.9), h=top-cb.min.y, low=cb.min.y+h*.3;
   const hw=h*.5, corners=[]; for(const x of [Math.max(cb.min.x,cc.x-hw),Math.min(cb.max.x,cc.x+hw)]) for(const y of [low,top]) for(const z of [Math.max(cb.min.z,cc.z-hw),Math.min(cb.max.z,cc.z+hw)]) corners.push(new THREE.Vector3(x,y,z));
   const tgt=new THREE.Vector3(cc.x,(low+top)/2,cc.z), dir=new THREE.Vector3(.45,.14,.88).normalize();
   const cam=new THREE.PerspectiveCamera(30,1,.01,80), place=D=>{ cam.position.copy(tgt).addScaledVector(dir,D); cam.lookAt(tgt); cam.updateMatrixWorld(); };
   let lo=.05,hi=40; for(let i=0;i<26;i++){ const D=(lo+hi)/2; place(D); if(corners.every(p=>{ const q=p.clone().project(cam); return q.z<1&&Math.abs(q.x)<=.9&&Math.abs(q.y)<=.9; })) hi=D; else lo=D; }
   place(hi);
   pR.setClearColor(0x000000,0); pR.render(pScene,cam); portraits[dex]=pR.domElement.toDataURL('image/png'); pScene.remove(g);
 }catch(e){ portraits[dex]=''; }
 for(const f of pWait[dex]||[]) try{ f(portraits[dex]); }catch(e){} delete pWait[dex];
}
// Precarga de modelos (por ejemplo, los de la tienda) para que aparezcan sin espera
function preload(list){ for(const d of list) wantModel(d); }
function modelStatus(dex){ return models[dex]?models[dex].status:'none'; }
window.B3={init,resize,render,project,unproject,preload,modelStatus,setQuality,portrait,totemTop,get quality(){ return qLevel; },get fps(){ return perf.fps; },get ready(){ return ready; }};
window.dispatchEvent(new Event('b3ready'));

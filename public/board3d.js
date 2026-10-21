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
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

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
const QL=[{pr:1,shadow:0,part:.35,crowd:false,sway:false},{pr:1.25,shadow:1024,part:.6,crowd:true,sway:true},{pr:1.5,shadow:2048,part:1,crowd:true,sway:true}];
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
 const side=new THREE.MeshStandardMaterial({color:sideCol,roughness:.9});
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
function makeParticles(additive){ const bub=additive==='bubble'; additive=additive===true;
 const geo=new THREE.BufferGeometry();
 const pos=new Float32Array(PART_MAX*3), pc=new Float32Array(PART_MAX*3), sz=new Float32Array(PART_MAX), al=new Float32Array(PART_MAX);
 geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('pcol',new THREE.BufferAttribute(pc,3));
 geo.setAttribute('size',new THREE.BufferAttribute(sz,1)); geo.setAttribute('alpha',new THREE.BufferAttribute(al,1));
 const mat=new THREE.ShaderMaterial({uniforms:{uScale:{value:400}},transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
  vertexShader:`attribute vec3 pcol;attribute float size;attribute float alpha;varying vec3 vC;varying float vA;uniform float uScale;
   void main(){vC=pcol;vA=alpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:bub?`varying vec3 vC;varying float vA;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float rim=smoothstep(.3,.45,d)*smoothstep(.5,.46,d);float hl=smoothstep(.1,.02,length(gl_PointCoord-vec2(.33,.33)));gl_FragColor=vec4(mix(vC,vec3(1.),rim*.55+hl),(rim*.95+.16*(1.-d*2.)+hl)*vA);}`:`varying vec3 vC;varying float vA;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=${additive?'pow(1.-d*2.,1.6)':'smoothstep(.5,.35,d)'};gl_FragColor=vec4(vC,a*vA);}`});
 const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; pts.renderOrder=10;
 const P={pts,n:0,list:[],geo,mat,pos,pc,sz,al};
 return P;
}
let PA,PN,PB; // aditivas (luz), normales (humo, rocas, hojas) y burbujas
function emit(o){
 if(Q.part<1&&Math.random()>Q.part) return; // en calidad media o baja se emite solo una parte
 const P=o.bub?PB:o.add===false?PN:PA; if(P.list.length>=PART_MAX) return;
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
function blob(rad,seed,amt=.18,ws=18,hs=12){
 const g=new THREE.SphereGeometry(rad,ws,hs), p=g.attributes.position, v=new THREE.Vector3();
 for(let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i); const u=v.clone().normalize(), n=Math.sin(u.x*3.1+seed)*Math.sin(u.y*2.7+seed*1.7)*Math.sin(u.z*3.3+seed*.7)+.5*Math.sin(u.x*6.3+u.z*5.1+seed*2.3);
   v.multiplyScalar(1+amt*n*.7); p.setXYZ(i,v.x,v.y,v.z); }
 g.computeVertexNormals(); return g; }
// Roca redondeada y aplastada
function rockMesh(rad,seed,color){ const m=new THREE.Mesh(blob(rad,seed,.26,10,7),new THREE.MeshStandardMaterial({color,roughness:.85})); m.scale.y=.68; m.castShadow=true; m.receiveShadow=true; return m; }
function tree(x,z,s,r,leaf){
 const t=new THREE.Group();
 const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.1*s,.2*s,.95*s,8),new THREE.MeshStandardMaterial({color:'#7a4c28',roughness:.9})); trunk.position.y=.45*s; t.add(trunk);
 const cols=leaf||['#286828','#409840','#60b858'];
 for(let i=0;i<3;i++){ const c=new THREE.Mesh(blob((.75-i*.15)*s,r()*10,.16,12,8),new THREE.MeshStandardMaterial({color:cols[i],roughness:.8})); c.scale.y=.86; c.position.set(rnd(.15)*s,(1.1+i*.42)*s,rnd(.15)*s); c.rotation.y=r()*TAU; t.add(c); }
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
 const blocks=new THREE.InstancedMesh(new RoundedBoxGeometry(1,1,1,3,.14),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.9}),220); const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), sc=new THREE.Vector3(); let n=0;
 const put=(x,z,w,d,hh)=>{ if(n>=220) return; m4.compose(new THREE.Vector3(x,hh/2-.1,z),q.setFromAxisAngle(new THREE.Vector3(0,1,0),(r()-.5)*.06),sc.set(w,hh,d)); blocks.setMatrixAt(n,m4); blocks.setColorAt(n,col(r()<.5?T.stone:T.dark).lerp(col('#ffffff'),r()*.15)); n++; };
 const pad=.45;
 for(let x=X0-pad;x<=X1+pad;x+=1.15){ put(x,Z0-pad-.2,1.05,.7,.55+r()*.25); put(x,Z1+pad+.2,1.05,.7,.4+r()*.2); }
 for(let z=Z0;z<=Z1;z+=1.15){ const mid=Math.abs(z-cz)<1.3; if(mid) continue; put(X0-pad-.25,z,.7,1.05,.5+r()*.3); put(X1+pad+.25,z,.7,1.05,.5+r()*.3); }
 blocks.count=n; blocks.castShadow=true; blocks.receiveShadow=true; g.add(blocks);
 // Columnas en las esquinas con braseros encendidos
 for(const [x,z] of [[X0-pad-.3,Z0-pad-.3],[X1+pad+.3,Z0-pad-.3],[X0-pad-.3,Z1+pad+.3],[X1+pad+.3,Z1+pad+.3]]){
   const col1=new THREE.Mesh(new THREE.CylinderGeometry(.4,.5,1.7,28),new THREE.MeshStandardMaterial({color:T.stone,roughness:.85})); col1.position.set(x,.75,z); col1.castShadow=true; g.add(col1);
   const cap=new THREE.Mesh(new THREE.CylinderGeometry(.55,.45,.25,28),new THREE.MeshStandardMaterial({color:T.dark,roughness:.8})); cap.position.set(x,1.72,z); g.add(cap);
   const base=new THREE.Mesh(new THREE.TorusGeometry(.5,.08,10,32),new THREE.MeshStandardMaterial({color:T.dark,roughness:.8})); base.rotation.x=Math.PI/2; base.position.set(x,.02,z); g.add(base);
   const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.42,.22,.3,28,1,true),new THREE.MeshStandardMaterial({color:'#4a3a2a',side:THREE.DoubleSide,metalness:.4,roughness:.5})); bowl.position.set(x,1.98,z); g.add(bowl);
   const glow=glowSprite(T.flame[1],2.2); glow.position.set(x,2.3,z); g.add(glow);
   anim.push(t=>{ glow.material.opacity=.65+.25*Math.sin(t*7+x)+.1*Math.sin(t*13+z);
     for(let k=0;k<2;k++) if(Math.random()<.8) emit({p:new THREE.Vector3(x+rnd(.16),2.02,z+rnd(.16)),v:[rnd(.12),1.1+Math.random()*.8,rnd(.12)],col:T.flame[Math.random()<.5?0:1],size:.42+Math.random()*.18,size1:.06,life:.5+Math.random()*.25,g:-.6,drag:1.5});
     if(Math.random()<.5) emit({p:new THREE.Vector3(x+rnd(.08),2.1,z+rnd(.08)),v:[rnd(.05),.9,rnd(.05)],col:T.flame[2],size:.22,size1:.04,life:.35,g:-.4});
     if(Math.random()<.06) emit({p:new THREE.Vector3(x+rnd(.15),2.3,z+rnd(.15)),v:[rnd(.5),2.2+Math.random(),rnd(.5)],col:T.flame[1],size:.07,size1:.02,life:1.1,g:.6}); });
 }
 // Árboles y rocas alrededor
 const outside=(x,z,m)=>x<X0-m||x>X1+m||z<Z0-m||z>Z1+m;
 for(let i=0;i<60;i++){ const a=r()*TAU, d=Math.max(X1-X0,Z1-Z0)*.62+2.5+r()*13, x=cx+Math.cos(a)*d*1.15, z=cz+Math.sin(a)*d*.9; if(!outside(x,z,2.4)) continue; const t=tree(x,z,.9+r()*.8,r,T.leaf); t.position.y=-.9; g.add(t); }
 for(let i=0;i<40;i++){ const a=r()*TAU, d=Math.max(X1-X0,Z1-Z0)*.6+1.8+r()*9, x=cx+Math.cos(a)*d, z=cz+Math.sin(a)*d*.85; if(!outside(x,z,1.6)) continue; const rock=rockMesh(.25+r()*.45,r()*20,r()<.5?T.stone:T.dark); rock.position.set(x,-.78,z); rock.rotation.y=r()*TAU; g.add(rock); }
 // Agua: un foso que rodea el templo (variante de agua)
 if(theme==='water'){ const moat=new THREE.Mesh(new THREE.RingGeometry(Math.max(X1-X0,Z1-Z0)*.75,Math.max(X1-X0,Z1-Z0)*.75+2.2,64),new THREE.MeshStandardMaterial({color:'#3a9ad8',emissive:'#0a3a6a',roughness:.15,metalness:.2,transparent:true,opacity:.9})); moat.rotation.x=-Math.PI/2; moat.position.set(cx,-.86,cz); g.add(moat); anim.push(t=>{ moat.material.emissive.setHSL(.58,.7,.14+.04*Math.sin(t*2)); }); }
 // Hojas o pavesas en el aire
 anim.push(t=>{ if(Math.random()<.1) emit({p:new THREE.Vector3(cx+rnd(10),6,cz+rnd(8)),v:[rnd(.6)+.4,-.6,rnd(.4)],col:T.leaf[Math.random()*3|0],size:.18,size1:.18,life:7,add:false,drag:0}); });
}
// Junta en una sola malla (color por vértice) todo lo estático, opaco y sin textura de la arena: árboles, rocas, columnas, arbustos…
// Pasa de cientos de llamadas de dibujo (y otras tantas en la pasada de sombras) a una. Lo animado lleva userData.dyn y se queda aparte.
function bakeStatic(g){
 g.updateMatrixWorld(true); const parts=[], keep=new Set();
 g.traverse(o=>{ if(!o.isMesh||o.isInstancedMesh||o.userData.dyn||o.children.length) return; const m=o.material;
   if(Array.isArray(m)||!m.isMeshStandardMaterial||m.vertexColors||m.map||m.transparent||m.side!==THREE.FrontSide||m.metalness>.05||(m.emissive&&m.emissive.getHex())) return;
   for(let p=o.parent;p&&p!==g;p=p.parent) if(p.userData.dyn) return;
   parts.push(o); });
 if(parts.length<2) return g;
 const geos=parts.map(o=>{ let q=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
   const keepAttr=new THREE.BufferGeometry(); keepAttr.setAttribute('position',q.attributes.position); keepAttr.setAttribute('normal',q.attributes.normal||q.computeVertexNormals()||q.attributes.normal);
   keepAttr.applyMatrix4(o.matrixWorld); const c=o.material.color, n=keepAttr.attributes.position.count, col=new Float32Array(n*3);
   for(let i=0;i<n;i++){ col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b; } keepAttr.setAttribute('color',new THREE.BufferAttribute(col,3)); return keepAttr; });
 const merged=mergeGeometries(geos,false); if(!merged) return g;
 const mesh=new THREE.Mesh(merged,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}));
 mesh.castShadow=true; mesh.receiveShadow=true; mesh.matrixAutoUpdate=false;
 for(const o of parts){ o.parent.remove(o); o.geometry.dispose(); o.material.dispose(); }
 g.add(mesh); g.traverse(o=>{ if(o!==g&&!o.userData.dyn) { o.matrixAutoUpdate=false; o.updateMatrix(); } });
 return g;
}
// Arena «río» (por defecto), inspirada en el mapa de Ríos de TFT: una isla de hierba con acantilados sobre un río, campo de tierra pisada con adoquines
// gastados en el centro, gruesas losas de piedra arriba y abajo, hileras de urnas hexagonales a los lados y cuatro torres con fuego en las esquinas
function riverTex(){
 return canvasTex(1024,1152,(g,w,h)=>{ const rr=seeded(41); g.fillStyle='#5f6f33'; g.fillRect(0,0,w,h);
   const blot=(x,y,r0,c,al)=>{ const gr=g.createRadialGradient(x,y,0,x,y,r0); gr.addColorStop(0,c+al); gr.addColorStop(1,c+'00'); g.fillStyle=gr; g.fillRect(x-r0,y-r0,r0*2,r0*2); };
   for(let i=0;i<420;i++) blot(rr()*w,rr()*h,30+rr()*120,['#6e7f38','#4f5f2b','#667632','#445426'][i%4],'55');
   // grandes manchas de tierra naranja-parda, más hacia el centro y las esquinas
   for(let i=0;i<34;i++){ const a=rr()*Math.PI*2, d=rr()*w*.32; blot(w/2+Math.cos(a)*d*1.25,h/2+Math.sin(a)*d*1.2,80+rr()*170,['#a87646','#946a3e','#b9824c'][i%3],'cc'); }
   for(const [x,y] of [[.14,.22],[.86,.76],[.18,.82],[.84,.2]]) for(let i=0;i<4;i++) blot(w*x+rnd(60),h*y+rnd(60),60+rr()*70,'#a87a48','88');
   // adoquines gastados en el centro
   g.lineJoin='round'; for(let i=0;i<86;i++){ const cx=w*.5+(rr()-.5)*w*.52, cy=h*.5+(rr()-.5)*h*.36, r0=30+rr()*38, n=9+(rr()*4|0); g.beginPath(); for(let k=0;k<n;k++){ const an=k/n*Math.PI*2+rr()*.25, rad=r0*(.9+rr()*.18); const px=cx+Math.cos(an)*rad, py=cy+Math.sin(an)*rad*.8; k?g.lineTo(px,py):g.moveTo(px,py); } g.closePath();
     g.fillStyle='rgba('+(118+(rr()*30|0))+','+(110+(rr()*24|0))+','+(92+(rr()*20|0))+',.55)'; g.fill(); g.strokeStyle='rgba(38,32,24,.38)'; g.lineWidth=3; g.stroke(); }
   // matas de hierba y florecillas
   for(let i=0;i<1400;i++){ const x=rr()*w, y=rr()*h; g.fillStyle=rr()<.5?'rgba(150,175,80,.5)':'rgba(40,60,28,.4)'; g.fillRect(x,y,2,5+rr()*5); }
   for(let i=0;i<90;i++){ const x=rr()*w, y=rr()*h; g.fillStyle=['#f2e27a','#f4f0e8','#c48ae8','#e88aa8'][i%4]; g.fillRect(x,y,4,4); }
   for(let i=0;i<2600;i++){ g.fillStyle=rr()<.5?'rgba(255,255,255,.05)':'rgba(0,0,0,.06)'; g.fillRect(rr()*w,rr()*h,2,2); }
   const v=g.createRadialGradient(w/2,h/2,w*.32,w/2,h/2,w*.8); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,.32)'); g.fillStyle=v; g.fillRect(0,0,w,h);
 },false);
}
function grassTex(){
 return canvasTex(512,512,(g,w,h)=>{ const rr=seeded(52); g.fillStyle='#3f5726'; g.fillRect(0,0,w,h);
   for(let i=0;i<260;i++){ const x=rr()*w, y=rr()*h, r0=20+rr()*70, c=['#4d6a2e','#364e22','#587836'][i%3]; const gr=g.createRadialGradient(x,y,0,x,y,r0); gr.addColorStop(0,c+'88'); gr.addColorStop(1,c+'00'); g.fillStyle=gr; g.fillRect(x-r0,y-r0,r0*2,r0*2); }
   for(let i=0;i<1600;i++){ g.fillStyle=rr()<.5?'rgba(170,200,90,.35)':'rgba(20,40,16,.35)'; g.fillRect(rr()*w,rr()*h,2,6); } },true);
}
function buildRiver(g,rc,r,anim){
 const X0=rc.bx0, X1=rc.bx1, Z0=rc.bz0, Z1=rc.bz1, ZB=rc.cz1, cx=(X0+X1)/2, cz=(Z0+ZB)/2, stone='#a89c88', dark='#6c6354', flame=['#ff6a2a','#ffb347','#ffe9a0'];
 // Isla de hierba con acantilado
 const gt=grassTex(); gt.wrapS=gt.wrapT=THREE.RepeatWrapping; gt.repeat.set(5,5);
 const isl=slab(roundRectShape(X0-5.2,Z0-5,X1+5.2,ZB+3.6,2.6),3.2,-.2,'#4a4136',null,'#4f6a2e');
 g.add(isl);
 const grass=new THREE.Mesh(new THREE.ShapeGeometry(roundRectShape(X0-5.2,Z0-5,X1+5.2,ZB+3.6,2.6),16),new THREE.MeshStandardMaterial({map:gt,roughness:1})); grass.geometry.rotateX(Math.PI/2); grass.position.y=-.02; grass.receiveShadow=true; g.add(grass);
 // Agua en el fondo (verde azulada oscura) y espuma en las orillas
 const wm=new THREE.MeshStandardMaterial({color:'#1f6670',emissive:'#0a3a44',roughness:.2,metalness:.15}); const wat=new THREE.Mesh(new THREE.PlaneGeometry(220,220),wm); wat.rotation.x=-Math.PI/2; wat.position.set(cx,-2.6,cz); wat.userData.dyn=true; g.add(wat);
 anim.push(t=>{ wm.emissive.setHSL(.53,.7,.12+.03*Math.sin(t*1.4)); if(Math.random()<.3){ const an=Math.random()*TAU; emit({p:new THREE.Vector3(cx+Math.cos(an)*(X1-X0)*.9,-2.5,cz+Math.sin(an)*(ZB-Z0)*.9),v:[rnd(.1),.2,rnd(.1)],col:'#d8f4f0',size:.2,size1:0,life:.9}); } });
 // Suelo del campo
 g.add(slab(roundRectShape(X0,Z0,X1,Z1,.7),.8,0,'#6e6558',riverTex()));
 // Gruesas losas arriba y abajo del campo
 const slabs=new THREE.InstancedMesh(new RoundedBoxGeometry(1,1,1,2,.1),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.95}),90), m4=new THREE.Matrix4(), q=new THREE.Quaternion(), sc=new THREE.Vector3(); let n=0;
 const put=(x,z,w,d,h)=>{ if(n>=90) return; m4.compose(new THREE.Vector3(x,h/2-.05,z),q.setFromAxisAngle(new THREE.Vector3(0,1,0),0),sc.set(w,h,d)); slabs.setMatrixAt(n,m4); slabs.setColorAt(n,col(stone).lerp(col(r()<.5?'#cfc3ae':dark),.08+r()*.25)); n++; };
 const sw=(X1-X0)/Math.ceil((X1-X0)/2.3);
 for(let x=X0;x<X1-.1;x+=sw){ put(x+sw/2,Z0-.55,sw-.06,1.05,.5); put(x+sw/2,Z1+.6,sw-.06,1.05,.46); }
 slabs.count=n; slabs.castShadow=true; slabs.receiveShadow=true; g.add(slabs);
 // Hileras de urnas hexagonales a los lados
 const urnM=new THREE.MeshStandardMaterial({color:'#9c9078',roughness:.9,flatShading:true}), urnD=new THREE.MeshStandardMaterial({color:'#3a342c',roughness:1});
 for(const sx of [-1,1]){ for(let i=0;i<5;i++){ const z=Z0+1.6+i*((Z1-Z0-3.2)/4), x=sx<0?X0-.95:X1+.95;
   const u=new THREE.Mesh(new THREE.CylinderGeometry(.62,.46,.72,6),urnM); u.position.set(x,.32,z); u.rotation.y=Math.PI/6; u.castShadow=true; g.add(u);
   const inner=new THREE.Mesh(new THREE.CylinderGeometry(.42,.34,.06,6),urnD); inner.position.set(x,.7,z); inner.rotation.y=Math.PI/6; g.add(inner); } }
 // Torres de las esquinas con fuego
 for(const [x,z] of [[X0-1.2,Z0-1.2],[X1+1.2,Z0-1.2],[X0-1.2,Z1+1.4],[X1+1.2,Z1+1.4]]){
   const base=new THREE.Mesh(new THREE.BoxGeometry(1.9,.7,1.9),new THREE.MeshStandardMaterial({color:dark,roughness:.9})); base.position.set(x,.3,z); base.castShadow=true; g.add(base);
   const tw=new THREE.Mesh(new THREE.CylinderGeometry(.7,.92,1.5,4),new THREE.MeshStandardMaterial({color:stone,roughness:.9})); tw.rotation.y=Math.PI/4; tw.position.set(x,1.3,z); tw.castShadow=true; g.add(tw);
   const cap=new THREE.Mesh(new THREE.BoxGeometry(1.35,.24,1.35),new THREE.MeshStandardMaterial({color:dark,roughness:.85})); cap.position.set(x,2.15,z); g.add(cap);
   const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.46,.26,.32,20,1,true),new THREE.MeshStandardMaterial({color:'#2f261e',side:THREE.DoubleSide,metalness:.4,roughness:.5})); bowl.position.set(x,2.42,z); g.add(bowl);
   const glow=glowSprite(flame[1],2.8); glow.position.set(x,2.75,z); g.add(glow);
   anim.push(t=>{ glow.material.opacity=.7+.25*Math.sin(t*7+x)+.1*Math.sin(t*13+z);
     for(let k=0;k<2;k++) if(Math.random()<.85) emit({p:new THREE.Vector3(x+rnd(.16),2.45,z+rnd(.16)),v:[rnd(.12),1.2+Math.random()*.9,rnd(.12)],col:flame[Math.random()<.5?0:1],size:.5+Math.random()*.2,size1:.06,life:.55+.3*Math.random(),g:-.6,drag:1.4});
     if(Math.random()<.5) emit({p:new THREE.Vector3(x+rnd(.08),2.55,z+rnd(.08)),v:[rnd(.05),1],col:flame[2],size:.26,size1:.04,life:.35,g:-.4});
     if(Math.random()<.07) emit({p:new THREE.Vector3(x+rnd(.15),2.7,z+rnd(.15)),v:[rnd(.5),2.2+Math.random(),rnd(.5)],col:flame[1],size:.07,size1:.02,life:1.2,g:.6}); }); }
 // Pinos y arbustos en las esquinas de la isla, flores moradas y rocas
 const pine=(x,z,s2)=>{ const t=new THREE.Group(); const tr=new THREE.Mesh(new THREE.CylinderGeometry(.12*s2,.18*s2,.8*s2,6),new THREE.MeshStandardMaterial({color:'#5e3d22',roughness:.9})); tr.position.y=.4*s2; t.add(tr);
   for(let i=0;i<4;i++){ const c=new THREE.Mesh(new THREE.ConeGeometry((.95-i*.2)*s2,(1.1-i*.08)*s2,8),new THREE.MeshStandardMaterial({color:['#1f4a34','#255a3a','#2e6a43','#387a4f'][i],roughness:.85,flatShading:true})); c.position.y=(.85+i*.62)*s2; t.add(c); }
   t.position.set(x,-.1,z); t.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } }); return t; };
 const spots=[[X0-2.6,Z0-3.2,1.5],[X0-3.6,Z0-1.4,1.2],[X0-1.4,Z0-3.6,1.1],[X1+2.6,Z0-3.2,1.6],[X1+3.6,Z0-1.4,1.25],[X1+1.4,Z0-3.7,1.1],[X0-4,ZB+.5,1.1],[X1+4,ZB+.4,1.2],[X0-3.4,Z1-2,.9],[X1+3.5,Z1-3,1]];
 for(const [x,z,sz] of spots) g.add(pine(x+rnd(.3),z+rnd(.3),sz*(.9+r()*.3)));
 for(let i=0;i<46;i++){ const side=r()<.5?-1:1, x=side<0?X0-1.9-r()*3.2:X1+1.9+r()*3.2, z=Z0-3.4+r()*(ZB-Z0+6.2); if(Math.abs(z-cz)<2&&r()<.5) continue;
   const b=new THREE.Mesh(blob(.42+r()*.4,i*1.7,.2,10,7),new THREE.MeshStandardMaterial({color:['#34562a','#3f6a2e','#2b4a24'][i%3],roughness:.9})); b.scale.y=.75; b.position.set(x,.05,z); b.castShadow=true; g.add(b); }
 for(let i=0;i<90;i++){ const x=X0-4.5+r()*(X1-X0+9), z=Z0-4.3+r()*(ZB-Z0+7.6); if(x>X0-.6&&x<X1+.6&&z>Z0-.8&&z<ZB+.6) continue; const fl=new THREE.Mesh(new THREE.SphereGeometry(.08,6,4),new THREE.MeshBasicMaterial({color:['#b48ae8','#f2e27a','#f4f0e8','#e88aa8'][i%4]})); fl.position.set(x,.0,z); g.add(fl); }
 for(let i=0;i<24;i++){ const side=r()<.5?-1:1, x=side<0?X0-2.2-r()*3:X1+2.2+r()*3, z=Z0-3+r()*(ZB-Z0+5.5), rock=rockMesh(.3+r()*.5,r()*20,['#7a7064','#6a6054','#867c6e'][i%3]); rock.position.set(x,-.05,z); rock.rotation.y=r()*TAU; g.add(rock); }
 // Acantilados lejanos con árboles y una cascada
 for(let i=0;i<30;i++){ const an=i/30*TAU, dx=(X1-X0)*.5+11+r()*5, dz=(ZB-Z0)*.5+9+r()*5, x=cx+Math.cos(an)*dx, z=cz+Math.sin(an)*dz, h=3+r()*5;
   const c=new THREE.Mesh(new THREE.CylinderGeometry(1.2+r()*1.6,2+r()*2,h,6),new THREE.MeshStandardMaterial({color:['#4e4a50','#5a5560','#403c46'][i%3],roughness:.95,flatShading:true})); c.position.set(x,h/2-2.6,z); c.rotation.y=r()*TAU; c.castShadow=true; g.add(c);
   if(r()<.7){ const t=pine(x+rnd(.6),z+rnd(.6),1.1+r()*.8); t.position.y=h-2.6; g.add(t); } }
 const fall=new THREE.Mesh(new THREE.PlaneGeometry(1.4,5),new THREE.MeshBasicMaterial({color:'#e8f8f6',transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide})); fall.position.set(X0-9.5,0,Z0-7); fall.userData.dyn=true; g.add(fall);
 anim.push(t=>{ fall.material.opacity=.55+.2*Math.sin(t*5); if(Math.random()<.5) emit({p:new THREE.Vector3(X0-9.5+rnd(.6),-2.4,Z0-7),v:[rnd(.4),.6,rnd(.4)],col:'#e8f8f6',size:.5,size1:.9,life:1.1,add:false,alpha:.5}); if(Math.random()<.1) emit({p:new THREE.Vector3(cx+rnd(10),6,cz+rnd(8)),v:[rnd(.6)+.4,-.6,rnd(.4)],col:['#f6c4cc','#fff0b8','#b8e890'][Math.random()*3|0],size:.16,size1:.16,life:7,add:false,drag:0}); });
}
// Plaza del carrusel: arena helada con un mandala de flor en el suelo, riscos de roca azulada alrededor, cristales y flores azules
function iceTex(){
 return canvasTex(1024,1024,(g,w)=>{ const m=w/2, rr=seeded(77);
   const bg=g.createRadialGradient(m,m,0,m,m,m); bg.addColorStop(0,'#e6dcff'); bg.addColorStop(.35,'#a9a4f0'); bg.addColorStop(.7,'#7f93e8'); bg.addColorStop(1,'#5266b8'); g.fillStyle=bg; g.fillRect(0,0,w,w);
   // grietas de hielo con brillo eléctrico
   for(let i=0;i<46;i++){ let x=m+(rr()-.5)*40, y=m+(rr()-.5)*40, a=rr()*Math.PI*2; g.beginPath(); g.moveTo(x,y); for(let k=0;k<9;k++){ a+=(rr()-.5)*.9; x+=Math.cos(a)*(34+rr()*40); y+=Math.sin(a)*(34+rr()*40); g.lineTo(x,y); } g.strokeStyle='rgba(200,235,255,.30)'; g.lineWidth=2+rr()*2; g.stroke(); g.strokeStyle='rgba(255,255,255,.35)'; g.lineWidth=1; g.stroke(); }
   // mandala de flor: anillos de pétalos
   for(const [ring,n,len,wid,alpha] of [[.62,18,.1,.035,.16],[.5,14,.13,.05,.22],[.37,11,.14,.06,.3],[.24,8,.13,.07,.4],[.11,6,.09,.06,.55]]){
     for(let i=0;i<n;i++){ const an=i/n*Math.PI*2; g.save(); g.translate(m+Math.cos(an)*ring*m,m+Math.sin(an)*ring*m); g.rotate(an); g.beginPath(); g.ellipse(0,0,len*m,wid*m*2,0,0,Math.PI*2); g.fillStyle='rgba(235,225,255,'+alpha+')'; g.fill(); g.strokeStyle='rgba(255,255,255,'+(alpha+.18)+')'; g.lineWidth=3; g.stroke(); g.restore(); } }
   g.beginPath(); g.arc(m,m,m*.07,0,Math.PI*2); g.fillStyle='rgba(255,240,255,.85)'; g.fill();
   // anillo de lucecitas
   for(let i=0;i<40;i++){ const an=i/40*Math.PI*2, x=m+Math.cos(an)*m*.7, y=m+Math.sin(an)*m*.7; const gr=g.createRadialGradient(x,y,0,x,y,14); gr.addColorStop(0,'rgba(255,255,255,.95)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(x-14,y-14,28,28); }
   for(let i=0;i<900;i++){ g.fillStyle=rr()<.5?'rgba(255,255,255,.07)':'rgba(40,50,120,.07)'; g.fillRect(rr()*w,rr()*w,3,3); }
 },false);
}
function buildIce(g,cx,cz,rad,r,anim){
 const base=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad+.2,.8,64),new THREE.MeshStandardMaterial({color:'#5c6aa8',roughness:.7})); base.position.set(cx,-.4,cz); base.receiveShadow=true; g.add(base);
 const tex=iceTex(); tex.anisotropy=8; const top=new THREE.Mesh(new THREE.CircleGeometry(rad-.04,64),new THREE.MeshStandardMaterial({map:tex,roughness:.4,metalness:.05})); top.rotation.x=-Math.PI/2; top.position.set(cx,.01,cz); top.receiveShadow=true; g.add(top);
 // Riscos de roca azulada alrededor (más altos al fondo)
 const rockCols=['#4a5272','#59628a','#3c4466','#6a74a0'];
 for(let i=0;i<46;i++){ const an=i/46*TAU+rnd(.05), front=Math.max(0,Math.sin(an)), back=Math.max(0,-Math.sin(an)), d=rad+.5+front*1.6+r()*1.2, h=(1.6+r()*2.4)*(1-.62*front)+back*3.2;
   const c=new THREE.Mesh(new THREE.ConeGeometry(.55+r()*.7,h,5+(r()*3|0)),new THREE.MeshStandardMaterial({color:rockCols[i%4],roughness:.9,flatShading:true}));
   c.position.set(cx+Math.cos(an)*d,h/2-.8,cz+Math.sin(an)*d); c.rotation.set(rnd(.18),r()*TAU,rnd(.18)); c.castShadow=true; g.add(c); }
 // Cristales brillantes
 const crys=[]; for(let i=0;i<16;i++){ const an=r()*TAU, d=rad+.2+r()*1.4, pink=i%3===0, col2=pink?'#ff8ad8':'#7fe8ff';
   for(let k=0;k<3;k++){ const h=.5+r()*1.2, m=new THREE.Mesh(new THREE.ConeGeometry(.14+r()*.12,h,5),new THREE.MeshStandardMaterial({color:col2,emissive:col2,emissiveIntensity:.55,roughness:.2,metalness:.1,flatShading:true})); m.position.set(cx+Math.cos(an)*d+rnd(.3),h/2-.7,cz+Math.sin(an)*d+rnd(.3)); m.rotation.set(rnd(.4),r()*TAU,rnd(.4)); g.add(m); crys.push(m); } }
 // Flores azules con centro amarillo
 for(let i=0;i<14;i++){ const an=r()*TAU, d=rad+.1+r()*1.1, fx=cx+Math.cos(an)*d, fz=cz+Math.sin(an)*d, fl=new THREE.Group();
   for(let k=0;k<6;k++){ const pt=new THREE.Mesh(new THREE.SphereGeometry(.17,8,6),new THREE.MeshStandardMaterial({color:'#7fb4ff',emissive:'#2a5ab8',emissiveIntensity:.35,roughness:.6})); pt.scale.set(1,.35,1.4); const a2=k/6*TAU; pt.position.set(Math.cos(a2)*.2,0,Math.sin(a2)*.2); pt.rotation.y=-a2; fl.add(pt); }
   const ce=new THREE.Mesh(new THREE.SphereGeometry(.1,8,6),new THREE.MeshStandardMaterial({color:'#ffd94a',emissive:'#a07a00',emissiveIntensity:.5})); ce.position.y=.05; fl.add(ce); fl.position.set(fx,-.4,fz); fl.rotation.x=rnd(.2); g.add(fl); }
 anim.push(t=>{ for(let i=0;i<crys.length;i++) crys[i].material.emissiveIntensity=.45+.25*Math.sin(t*1.6+i*1.3);
   if(Math.random()<.35) emit({p:new THREE.Vector3(cx+rnd(rad),5.5,cz+rnd(rad)),v:[rnd(.3),-.9,rnd(.3)],col:'#ffffff',size:.12,size1:.12,life:6,add:false,drag:0});
   if(Math.random()<.4){ const an=Math.random()*TAU, d=Math.random()*rad*.9; emit({p:new THREE.Vector3(cx+Math.cos(an)*d,.15,cz+Math.sin(an)*d),v:[0,.35,0],col:Math.random()<.5?'#ffffff':'#c8b8ff',size:.18,size1:0,life:1.2}); } });
}
/* ---------- arena «glade»: claro de bosque sobre una meseta flotante (procedural, ≤15 llamadas de dibujo) ----------
   Todo lo estático (muro, pilares, hornacinas, proa, acantilado, pinos, arbustos, rocas) se junta por material en pocas mallas con color por
   vértice. Lo animado (agua, llamas, brasas, hierba y copas que se mecen) va aparte con userData.dyn y un uniform de tiempo. */
// Paleta inspirada en la arena por defecto de TFT: centro dorado, arenisca clara, agua turquesa y acantilado de tierra
const GL={grass:'#6f9a45',grass2:'#8fae52',dirt:'#a07a52',gold:'#d4a640',stone:'#c9b48c',stone2:'#b8a27a',stoneD:'#97835f',water:'#3a9da2',fog:'#e8b9b0',cliff:'#5c4332',rock:['#7a5a46','#8c6a52','#6a4c3a'],pine:['#2f6b3f','#3b7d49','#4a8f55'],bush:'#3f7a3a',flower:'#9a5fc9'};
// Ruido suave repetible (valor) para los sombreadores y las texturas
const GLSL_NOISE=`float gh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float gn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x),f.y); }
float gfbm(vec2 p){ return gn(p)*.5+gn(p*2.1+3.3)*.25+gn(p*4.3+7.1)*.125+gn(p*8.7+1.7)*.0625; }`;
// Suelo del campo: hierba con parches de tierra y losas gastadas (pintado una vez a un CanvasTexture)
function gladeFloorTex(){
 return canvasTex(1024,1152,(g,w,h)=>{ const rr=seeded(23);
   g.fillStyle=GL.grass; g.fillRect(0,0,w,h);
   const blot=(x,y,r0,c,al)=>{ const gr=g.createRadialGradient(x,y,0,x,y,r0); gr.addColorStop(0,c+al); gr.addColorStop(1,c+'00'); g.fillStyle=gr; g.fillRect(x-r0,y-r0,r0*2,r0*2); };
   for(let i=0;i<380;i++) blot(rr()*w,rr()*h,40+rr()*120,[GL.grass2,'#5e8a3c','#7aa04a','#557d36'][i%4],'66');
   // centro dorado (como el tablero de TFT) que se funde con la hierba de los bordes
   { const gc=g.createRadialGradient(w/2,h/2,w*.05,w/2,h/2,w*.62); gc.addColorStop(0,'#e4bd55'); gc.addColorStop(.45,GL.gold+'ee'); gc.addColorStop(.75,'#a8a04acc'); gc.addColorStop(1,'#a8a04a00'); g.fillStyle=gc; g.fillRect(0,0,w,h); }
   for(let i=0;i<30;i++){ const a=rr()*Math.PI*2, d=rr()*w*.3; blot(w/2+Math.cos(a)*d*1.3,h/2+Math.sin(a)*d*1.15,90+rr()*170,['#c99a3c','#d8b04e','#b88a3a'][i%3],'88'); }
   for(const [x,y] of [[.12,.2],[.88,.78],[.16,.84],[.86,.18]]) for(let i=0;i<3;i++) blot(w*x+rnd(60),h*y+rnd(60),70+rr()*70,GL.dirt,'88');
   // losas de piedra gastada en el centro
   g.lineJoin='round'; for(let i=0;i<46;i++){ const cx=w*.5+(rr()-.5)*w*.62, cy=h*.5+(rr()-.5)*h*.5, r0=45+rr()*60, n=9+(rr()*4|0); g.beginPath(); for(let k=0;k<n;k++){ const an=k/n*Math.PI*2+rr()*.25, rad=r0*(.9+rr()*.18); const px=cx+Math.cos(an)*rad, py=cy+Math.sin(an)*rad*.8; k?g.lineTo(px,py):g.moveTo(px,py); } g.closePath();
     g.fillStyle='rgba('+(236+(rr()*16|0))+','+(214+(rr()*20|0))+','+(150+(rr()*30|0))+',.3)'; g.fill(); g.strokeStyle='rgba(120,90,40,.22)'; g.lineWidth=3; g.stroke(); }
   for(let i=0;i<1400;i++){ const x=rr()*w, y=rr()*h; g.fillStyle=rr()<.5?'rgba(170,200,100,.45)':'rgba(40,70,30,.4)'; g.fillRect(x,y,2,4+rr()*5); }
   for(let i=0;i<60;i++){ g.fillStyle=[GL.flower,'#f4ee9a','#f6f1ea'][i%3]; g.fillRect(rr()*w,rr()*h,4,4); }
   for(let i=0;i<2400;i++){ g.fillStyle=rr()<.5?'rgba(255,255,255,.05)':'rgba(0,0,0,.06)'; g.fillRect(rr()*w,rr()*h,2,2); }
   const v=g.createRadialGradient(w/2,h/2,w*.32,w/2,h/2,w*.8); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,.3)'); g.fillStyle=v; g.fillRect(0,0,w,h);
 },false);
}
// Junta geometrías ya colocadas (matriz aplicada) en una sola malla con color por vértice
function mergeColored(parts,mat){ const sway=parts.some(p=>p[3]!=null); const geos=parts.map(([geo,m,c,sk])=>{ let q=geo.index?geo.toNonIndexed():geo.clone(); q.applyMatrix4(m); const n=q.attributes.position.count, cc=new Float32Array(n*3), C=col(c); for(let i=0;i<n;i++){ cc[i*3]=C.r; cc[i*3+1]=C.g; cc[i*3+2]=C.b; } const out=new THREE.BufferGeometry(); out.setAttribute('position',q.attributes.position); out.setAttribute('normal',q.attributes.normal||(q.computeVertexNormals(),q.attributes.normal)); out.setAttribute('color',new THREE.BufferAttribute(cc,3));
  if(sway){ const p=q.attributes.position; let y0=1e9,y1=-1e9; for(let i=0;i<n;i++){ const y=p.getY(i); y0=Math.min(y0,y); y1=Math.max(y1,y); } const sw=new Float32Array(n), k=sk||0; for(let i=0;i<n;i++) sw[i]=k*clamp((p.getY(i)-y0)/Math.max(.01,y1-y0),0,1); out.setAttribute('sway',new THREE.BufferAttribute(sw,1)); } return out; });
 for(const [geo] of parts) geo.dispose(); const merged=mergeGeometries(geos,false); for(const q of geos) q.dispose(); const mesh=new THREE.Mesh(merged,mat||new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,flatShading:true})); mesh.castShadow=true; mesh.receiveShadow=true; mesh.matrixAutoUpdate=false; return mesh; }
const M4=(x,y,z,ry=0,sx=1,sy=1,sz=1)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),ry),new THREE.Vector3(sx,sy,sz));
// Material que se mece por vértice (hierba, copas): desplaza x/z con el tiempo, más cuanto más alto el vértice respecto a su base (atributo sway)
function swayMat(opts={}){ const m=new THREE.MeshStandardMaterial(Object.assign({vertexColors:true,roughness:.9,flatShading:true},opts)); m.userData.u={uTime:{value:0},uAmp:{value:1}};
 m.onBeforeCompile=sh=>{ sh.uniforms.uTime=m.userData.u.uTime; sh.uniforms.uAmp=m.userData.u.uAmp; sh.vertexShader='uniform float uTime; uniform float uAmp; attribute float sway;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n float ph=position.x*.6+position.z*.4; transformed.x+=sin(uTime*1.4+ph)*.06*sway*uAmp; transformed.z+=cos(uTime*1.1+ph*1.3)*.05*sway*uAmp;'); };
 return m; }
function buildGlade(g,rc,r,anim){
 const X0=rc.bx0, X1=rc.bx1, Z0=rc.bz0, Z1=rc.bz1, ZB=rc.cz1, cx=(X0+X1)/2, cz=(Z0+ZB)/2, S=[], W=[], D=[];
 // --- suelo del campo y banquillo ---
 g.add(slab(roundRectShape(X0,Z0,X1,Z1,.7),.8,0,GL.stoneD,gladeFloorTex()));
 g.add(slab(roundRectShape(rc.cx0,rc.cz0,rc.cx1,rc.cz1,.3),.5,0,GL.stoneD,null,GL.stone));
 // --- muro bajo de losas y pilares (una malla de piedra) ---
 const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
 const sw=(X1-X0)/Math.ceil((X1-X0)/2.3);
 for(let x=X0;x<X1-.1;x+=sw){ S.push([box(sw-.06,.5,1.05),M4(x+sw/2,.2,Z0-.55),r()<.5?GL.stone:GL.stone2]); S.push([box(sw-.06,.2,1.05),M4(x+sw/2,0,Z1+.6),r()<.5?GL.stone:GL.stone2]); } // delante solo un bordillo por debajo de las casillas: un muro ahí tapaba a los Pokémon que lo cruzan
 for(let z=Z0+.4;z<Z1-.3;z+=1.3){ S.push([box(.5,.34,1.2),M4(X0-.45,.12,z+.6),GL.stoneD]); S.push([box(.5,.34,1.2),M4(X1+.45,.12,z+.6),GL.stoneD]); }
 // hornacinas: 5 por lateral, redondas (nicho de piedra con hueco oscuro); en cada una flota un cristal de intereses (stepProps)
 gladeNiches.length=0;
 for(const sx of [-1,1]) for(let i=0;i<5;i++){ const z=Z0+1.6+i*((Z1-Z0-3.2)/4), x=sx<0?X0-1.05:X1+1.05; S.push([new THREE.CylinderGeometry(.6,.46,.72,24),M4(x,.31,z),GL.stone]); S.push([new THREE.CylinderGeometry(.42,.34,.08,24),M4(x,.7,z),'#2a2530']); gladeNiches.push([x,z,4-i]); }
 // pilares de las esquinas con brasero
 const corners=[[X0-1.25,Z0-1.25],[X1+1.25,Z0-1.25],[X0-1.25,Z1+1.45],[X1+1.25,Z1+1.45]];
 for(const [x,z] of corners){ S.push([box(1.9,.7,1.9),M4(x,.3,z),GL.stoneD]); S.push([new THREE.CylinderGeometry(.7,.92,1.5,4),M4(x,1.3,z,Math.PI/4),GL.stone]); S.push([box(1.35,.24,1.35),M4(x,2.15,z),GL.stoneD]); S.push([new THREE.CylinderGeometry(.46,.26,.32,10,1,true),M4(x,2.42,z),'#2f261e']); }
 // proa de piedra tallada delante del banquillo
 { const prow=new THREE.Shape(); const px=cx, pz=rc.cz1+.2; prow.moveTo(px-3.2,pz); prow.lineTo(px+3.2,pz); prow.lineTo(px+1.6,pz+1.6); prow.lineTo(px,pz+3.2); prow.lineTo(px-1.6,pz+1.6); prow.closePath();
   const pg=new THREE.ExtrudeGeometry(prow,{depth:1.1,bevelEnabled:true,bevelSize:.12,bevelThickness:.1,bevelSegments:1}); pg.rotateX(Math.PI/2); S.push([pg,M4(0,.0,0),GL.stone]);
   S.push([box(2.6,.3,.6),M4(px,.2,pz+.9),GL.stoneD]); S.push([box(1.4,.3,.6),M4(px,.2,pz+1.9),GL.stoneD]); }
 // --- meseta de hierba con acantilado ---
 const MX0=X0-5.4, MX1=X1+5.4, MZ0=Z0-5.2, MZ1=ZB+4.2;
 const gt=grassTex(); gt.wrapS=gt.wrapT=THREE.RepeatWrapping; gt.repeat.set(6,6); const plateau=slab(roundRectShape(MX0,MZ0,MX1,MZ1,2.8),3.4,-.22,GL.cliff,gt,'#9fc46a'); g.add(plateau);
 // --- pinos, arbustos, rocas y flores (se mecen las copas) ---
 const P=[], B=[], F=[];
 const pine=(x,z,sz)=>{ S.push([new THREE.CylinderGeometry(.12*sz,.18*sz,.8*sz,5),M4(x,.4*sz-.2,z),'#5e3d22']); for(let i=0;i<4;i++) P.push([new THREE.ConeGeometry((.95-i*.2)*sz,(1.1-i*.08)*sz,7),M4(x,(.85+i*.62)*sz-.2,z,r()*TAU),GL.pine[Math.min(2,i)],.5+i*.25]); };
 const spots=[[X0-2.8,Z0-3.4,1.5],[X0-3.9,Z0-1.5,1.2],[X0-1.5,Z0-3.9,1.05],[X1+2.8,Z0-3.4,1.6],[X1+3.9,Z0-1.5,1.25],[X1+1.5,Z0-3.9,1.1],[X0-4.3,ZB+.6,1.15],[X1+4.3,ZB+.5,1.2],[X0-3.6,Z1-2,.95],[X1+3.7,Z1-3,1],[X0-4.4,Z0+2,1.05],[X1+4.4,Z0+3,1.1]];
 for(const [x,z,sz] of spots) pine(x+rnd(.3),z+rnd(.3),sz*(.9+r()*.3));
 for(let i=0;i<40;i++){ const side=r()<.5?-1:1, x=side<0?X0-2-r()*3:X1+2+r()*3, z=Z0-3.4+r()*(ZB-Z0+6); if(Math.abs(z-cz)<2&&r()<.5) continue; B.push([blob(.4+r()*.4,i*1.7,.2,8,6),M4(x,.05,z,0,1,.75,1),GL.bush]); if(i%3===0) F.push([new THREE.SphereGeometry(.09,5,4),M4(x+rnd(.3),.35,z+rnd(.3)),GL.flower]); }
 for(let i=0;i<70;i++){ const x=MX0+1+r()*(MX1-MX0-2), z=MZ0+1+r()*(MZ1-MZ0-2); if(x>X0-.8&&x<X1+.8&&z>Z0-.9&&z<ZB+.6) continue; F.push([new THREE.SphereGeometry(.08,5,4),M4(x,.0,z),[GL.flower,'#f4ee9a','#f6f1ea','#c9a5e8'][i%4]]); }
 for(let i=0;i<22;i++){ const side=r()<.5?-1:1, x=side<0?X0-2.2-r()*3:X1+2.2+r()*3, z=Z0-3+r()*(ZB-Z0+5.5); S.push([blob(.3+r()*.5,i*3.1,.26,8,6),M4(x,-.05,z,r()*TAU,1,.68,1),['#9a8a78','#8a7868','#a89888'][i%3]]); }
 // rocas en capas (losas apiladas y giradas) en las dos esquinas del fondo
 for(const [x0,z0,n] of [[X1+4.1,Z0-3.9,8],[X0-4.2,Z0-4,5]]) for(let i=0;i<n;i++){ const w0=2.3-i*.17+r()*.3; S.push([box(w0,.62,w0*(.75+r()*.3)),M4(x0+rnd(.35),.1+i*.58,z0+rnd(.35),r()*TAU),GL.rock[i%3]]); }
 // columnas de roca delante de la cascada (bajo el estanque)
 for(let i=0;i<9;i++){ const a=(i/8-.5)*2.6, rad=.6+r()*.35, hh=2+r()*1.1; S.push([new THREE.CylinderGeometry(rad*.8,rad,hh,7),M4(cx+Math.sin(a)*3.4,-3.6+hh/2,MZ1+1.6-Math.abs(Math.sin(a))*.6,r()*TAU),GL.rock[i%3]]); }
 // hierba alta: matas (conos finos) que se mecen
 const GR=[]; for(let i=0;i<260;i++){ const x=MX0+.8+r()*(MX1-MX0-1.6), z=MZ0+.8+r()*(MZ1-MZ0-1.6); if(x>X0-1.3&&x<X1+1.3&&z>Z0-1.4&&z<ZB+.8) continue; P.push([new THREE.ConeGeometry(.07,.42+r()*.3,3),M4(x,.1,z,r()*TAU),r()<.5?GL.grass2:'#5f8a3a',2.4]); }
 g.add(mergeColored(S)); g.add(mergeColored(B.concat(F)));
 // copas y hierba con balanceo (atributo sway = altura relativa del vértice)
 const pineM=mergeColored(P,swayMat()); pineM.userData.dyn=true; g.add(pineM);
 anim.push(t=>{ pineM.material.userData.u.uTime.value=t; pineM.material.userData.u.uAmp.value=Q.sway?.7:0; });
 // --- agua: río alrededor, cascada por el lado izquierdo y estanque bajo la proa (UV desplazadas en el shader) ---
 const waterMat=new THREE.MeshStandardMaterial({color:GL.water,emissive:'#123a44',roughness:.25,metalness:.1,transparent:true,opacity:.92}); waterMat.userData.u={uTime:{value:0}};
 waterMat.onBeforeCompile=sh=>{ sh.uniforms.uTime=waterMat.userData.u.uTime; sh.fragmentShader='uniform float uTime;\n'+GLSL_NOISE+'\n'+sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n { vec2 p=vWuv*3.; float w=gfbm(p+vec2(uTime*.12,uTime*.07))*.6+gfbm(p*2.-vec2(uTime*.09,-uTime*.05))*.4; float rip=smoothstep(.55,.75,w); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.9,.92),rip*.55); diffuseColor.rgb+=vec3(.05,.08,.08)*w; }');
   sh.vertexShader='varying vec2 vWuv;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vWuv=vec2(position.x,position.z)*.08;'); sh.fragmentShader='varying vec2 vWuv;\n'+sh.fragmentShader; };
 const water=new THREE.Mesh(new THREE.PlaneGeometry(240,240),waterMat); water.rotation.x=-Math.PI/2; water.position.set(cx,-3.4,cz); water.userData.dyn=true; water.receiveShadow=false; g.add(water);
 // cascada: plano vertical que cae por el acantilado izquierdo, con el mismo ruido desplazándose hacia abajo
 const fallMat=new THREE.MeshBasicMaterial({color:'#dff3f4',transparent:true,opacity:.75,depthWrite:false,side:THREE.DoubleSide}); fallMat.userData.u={uTime:{value:0}};
 fallMat.onBeforeCompile=sh=>{ sh.uniforms.uTime=fallMat.userData.u.uTime; sh.vertexShader='varying vec2 vFuv;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vFuv=uv;'); sh.fragmentShader='uniform float uTime; varying vec2 vFuv;\n'+GLSL_NOISE+'\n'+sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n { float w=gfbm(vec2(vFuv.x*6.,vFuv.y*3.+uTime*1.6)); float a=smoothstep(.35,.7,w)*.9+.25; diffuseColor.a*=a*smoothstep(0.,.15,vFuv.y)*smoothstep(1.,.85,vFuv.y); }'); };
 const fall=new THREE.Mesh(new THREE.PlaneGeometry(2.2,3.4),fallMat); fall.position.set(MX0-.02,-1.9,Z0+1.5); fall.rotation.y=-Math.PI/2; fall.userData.dyn=true; g.add(fall);
 // estanque: medio círculo contra el borde delantero de la meseta; de su borde cae la cascada grande (como en la arena de TFT)
 const pond=new THREE.Mesh(new THREE.CircleGeometry(3.6,24,0,Math.PI),waterMat); pond.rotation.x=-Math.PI/2; pond.position.set(cx,-.1,MZ1+.25); pond.userData.dyn=true; g.add(pond);
 const front=new THREE.Mesh(new THREE.PlaneGeometry(7.2,3.3),fallMat); front.position.set(cx,-1.75,MZ1+.27); front.userData.dyn=true; g.add(front);
 anim.push(t=>{ waterMat.userData.u.uTime.value=t; fallMat.userData.u.uTime.value=t; });
 // --- braseros: llamas (planos aditivos con ruido) y una luz puntual por brasero solo en calidad Alta ---
 const flameMat=new THREE.MeshBasicMaterial({color:'#ffb347',transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}); flameMat.userData.u={uTime:{value:0}};
 flameMat.onBeforeCompile=sh=>{ sh.uniforms.uTime=flameMat.userData.u.uTime; sh.vertexShader='varying vec2 vFuv;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vFuv=uv;'); sh.fragmentShader='uniform float uTime; varying vec2 vFuv;\n'+GLSL_NOISE+'\n'+sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n { vec2 p=vec2(vFuv.x*2.5,vFuv.y*1.6-uTime*1.8); float w=gfbm(p); float cx=abs(vFuv.x-.5)*2.; float wd=1.-vFuv.y*.85; float body=smoothstep(wd,wd-.5,cx+(w-.5)*.7); float a=body*smoothstep(0.,.08,vFuv.y)*(1.-vFuv.y*vFuv.y); vec3 c=mix(vec3(1.,.3,.04),vec3(1.,.95,.6),pow(body,2.)*(.8-vFuv.y*.5)); diffuseColor=vec4(c,a*1.3); }'); };
 const FP=[], lights=[];
 for(const [x,z] of corners){ for(const ry of [0,Math.PI/2]){ const q=new THREE.PlaneGeometry(1.4,1.9); q.applyMatrix4(M4(x,3.3,z,ry)); FP.push(q); } const pl=new THREE.PointLight('#ff9a3a',0,7,2); pl.position.set(x,2.9,z); g.add(pl); pl.userData.dyn=true; lights.push(pl); }
 const flames=new THREE.Mesh(mergeGeometries(FP,false),flameMat); flames.userData.dyn=true; flames.frustumCulled=false; g.add(flames);
 // brasas: un único Points (≤40) que sube desde los braseros
 const NB=40, bp=new Float32Array(NB*3), bl=new Float32Array(NB), bg2=new THREE.BufferGeometry(); bg2.setAttribute('position',new THREE.BufferAttribute(bp,3)); const bm=new THREE.PointsMaterial({color:'#ffb347',map:glowTex,size:.22,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
 const embers=new THREE.Points(bg2,bm); embers.userData.dyn=true; embers.frustumCulled=false; g.add(embers); for(let i=0;i<NB;i++) bl[i]=Math.random();
 anim.push(t=>{ flameMat.userData.u.uTime.value=t;
   const on=qLevel>=2; for(const pl of lights) pl.intensity=on?2.2+.6*Math.sin(t*9+pl.position.x):0;
   embers.visible=Q.part>=.6; if(embers.visible){ for(let i=0;i<NB;i++){ bl[i]+=.006+.004*((i*7)%5)/5; if(bl[i]>1){ bl[i]=0; } const c=corners[i%4], k=bl[i]; bp[i*3]=c[0]+Math.sin(t*2+i)*.18*k; bp[i*3+1]=2.6+k*2.4; bp[i*3+2]=c[1]+Math.cos(t*1.7+i*2)*.18*k; } bg2.attributes.position.needsUpdate=true; bm.opacity=.85; } });
}
function buildArena(kind){
 const g=new THREE.Group(), rc=boardRects(), r=seeded(kind.length*17+3);
 if(kind==='glade'){ const anim=[]; g.userData.anim=anim; buildGlade(g,rc,r,anim); g.traverse(o=>{ if(o.isMesh&&!o.userData.dyn) o.receiveShadow=true; }); return g; }
 if(kind==='river'){ const anim=[]; g.userData.anim=anim;
   const ground=new THREE.Object3D();
   buildRiver(g,rc,r,anim); g.add(slab(roundRectShape(rc.cx0,rc.cz0,rc.cx1,rc.cz1,.3),.5,0,'#6e6558',null,'#b6aa95'));
   g.traverse(o=>{ if(o.isMesh&&o!==ground) o.receiveShadow=true; }); return g; }
 if(kind.startsWith('temple')){ const anim=[]; g.userData.anim=anim; const T=TEMPLE[kind.split('-')[1]]||TEMPLE.grass;
   const ground=new THREE.Mesh(new THREE.CircleGeometry(60,48),new THREE.MeshStandardMaterial({color:T.ground,roughness:1})); ground.rotation.x=-Math.PI/2; ground.position.y=-.9; ground.receiveShadow=true; g.add(ground);
   buildTemple(g,kind.split('-')[1],rc,r,anim);
   g.add(slab(roundRectShape(rc.cx0,rc.cz0,rc.cx1,rc.cz1,.3),.5,0,T.dark,null,T.stone));
   g.traverse(o=>{ if(o.isMesh&&o!==ground) o.receiveShadow=true; }); return g; }
 const anim=[]; g.userData.anim=anim;
 const groundCol={route:'#4f9a34',stadium:'#2a3360',plaza:'#8ea6d4'}[kind];
 const ground=new THREE.Mesh(new THREE.CircleGeometry(60,48),new THREE.MeshStandardMaterial({color:groundCol,roughness:1}));
 ground.rotation.x=-Math.PI/2; ground.position.y=-.9; ground.receiveShadow=true; g.add(ground);
 const bw=rc.bx1-rc.bx0, bd=rc.bz1-rc.bz0;
 if(kind!=='plaza'){
   const sh=roundRectShape(rc.bx0,rc.bz0,rc.bx1,rc.bz1,.6);
   g.add(slab(sh,.8,0,kind==='route'?'#805028':'#404060',fieldTex(kind)));
 } else {
   const cp=M.car?W3(M.car.cx,M.car.cy):null, cx=cp?cp.x:(rc.bx0+rc.bx1)/2, cz=cp?cp.z:(rc.bz0+rc.bz1)/2, rad=M.car?M.car.rr*1.36/M.R:Math.max(bw,bd)*.56;
   buildIce(g,cx,cz,rad,r,anim);
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
/* ---------- prueba: escenario plano (?arena=gif) ----------
   Sin decorado 3D en la arena «glade»: detrás del lienzo (transparente) va una imagen o GIF del escenario, deformada en perspectiva
   (matrix3d) para que su campo coincida con el tablero. Las casillas, el banquillo, los Pokémon y los efectos siguen en 3D. */
const FLAT=(()=>{ try{ return new URLSearchParams(location.search).get('arena')==='gif'; }catch(e){ return false; } })();
// Dos capas a 2× (1904×1440): base fija y, encima, solo lo que se mueve (agua, fuego, árboles) con transparencia. Coordenadas en píxeles del original (952×720).
// q: puntos de la imagen que se encajan con el tablero: las dos esquinas del fondo del campo y los dos extremos del banquillo (sus 9 losas = nuestras 9 casillas)
// back: esquinas del fondo del campo; bench: extremos del banquillo (sus 9 losas, de 243 a 689, son nuestras 9 casillas); holes: huecos de la izquierda; totem: esquina superior izquierda del campo, entre el pilar y las hornacinas (fuera de la cabecera)
const FLAT_IMG={base:'test-arena/base.webp',anim:'test-arena/anim.webp',w:952,h:720,back:[[287,181],[636,182]],bench:[243,689,390],
 holes:[[266,209],[260,229],[252,249],[246,269],[240,292]], totem:[282,224]};
let flatEl=null, flatKey='', flatH=null;
// Homografía (s → d) por mínimos cuadrados con N≥4 puntos: [a,b,c,d,e,f,g,h] con u=(ax+by+c)/(gx+hy+1), v=(dx+ey+f)/(gx+hy+1)
function homography(s,d){ const M=Array.from({length:8},()=>new Float64Array(9));
 for(let i=0;i<s.length;i++){ const [x,y]=s[i],[u,v]=d[i]; for(const [row,t] of [[[x,y,1,0,0,0,-u*x,-u*y],u],[[0,0,0,x,y,1,-v*x,-v*y],v]]) for(let a=0;a<8;a++){ for(let c=0;c<8;c++) M[a][c]+=row[a]*row[c]; M[a][8]+=row[a]*t; } }
 for(let c=0;c<8;c++){ let p=c; for(let r=c+1;r<8;r++) if(Math.abs(M[r][c])>Math.abs(M[p][c])) p=r; [M[c],M[p]]=[M[p],M[c]];
   for(let r=0;r<8;r++){ if(r===c) continue; const k=M[r][c]/M[c][c]; for(let j=c;j<9;j++) M[r][j]-=k*M[c][j]; } }
 return M.map((r,i)=>r[8]/r[i]); }
const hApply=(h,[x,y])=>{ const w=h[6]*x+h[7]*y+1; return [(h[0]*x+h[1]*y+h[2])/w,(h[3]*x+h[4]*y+h[5])/w]; };
// Punto de la imagen → mundo, sobre el plano de altura y (para poner cosas 3D justo encima de algo pintado en la imagen)
const _rv=new THREE.Vector3(), _rd=new THREE.Vector3();
function flatWorld(pt,y=0){ if(!flatH) return null; const cvs=renderer.domElement, [sx,sy]=hApply(flatH,pt); _rv.set(sx/cvs.clientWidth*2-1,1-sy/cvs.clientHeight*2,.5).unproject(camera);
 _rd.copy(_rv).sub(camera.position).normalize(); const t=(y-camera.position.y)/_rd.y; return new THREE.Vector3().copy(camera.position).addScaledVector(_rd,t); }
function stepFlat(){
 const on=FLAT&&curArena==='glade'&&board.G; if(!on){ if(flatEl) flatEl.hidden=true; flatH=null; return; }
 const cvs=renderer.domElement, G=board.G; if(!flatEl){ flatEl=document.createElement('div'); flatEl.style.cssText=`position:absolute;width:${FLAT_IMG.w}px;height:${FLAT_IMG.h}px;transform-origin:0 0;pointer-events:none;z-index:0`;
   for(const src of [FLAT_IMG.base,FLAT_IMG.anim]){ const im=document.createElement('img'); im.src=src; im.alt=''; im.style.cssText='position:absolute;inset:0;width:100%;height:100%'; flatEl.appendChild(im); }
   cvs.parentElement.insertBefore(flatEl,cvs); cvs.parentElement.style.background='radial-gradient(circle at 50% 40%,#5a5d63,#2e3036)'; }
 flatEl.hidden=false; flatEl.style.left=cvs.offsetLeft+'px'; flatEl.style.top=cvs.offsetTop+'px';
 const rc=boardRects(), W=cvs.clientWidth, H=cvs.clientHeight, [bx0,bx1,by]=FLAT_IMG.bench, bw=(bx1-bx0)/9;
 const scr=v=>{ v3.copy(v).project(camera); return [(v3.x+1)/2*W,(1-v3.y)/2*H]; };
 // se encajan las dos esquinas del fondo y el centro de las 9 losas del banquillo (mínimos cuadrados): las fichas de la banca caen justo en su losa
 const src=[...FLAT_IMG.back,...G.bench.map((_,i)=>[bx0+bw*(i+.5),by])], d=[scr(new THREE.Vector3(rc.bx0,0,rc.bz0)),scr(new THREE.Vector3(rc.bx1,0,rc.bz0)),...G.bench.map(([x,y])=>scr(W3(x,y,TOP)))];
 const k=d.map(p=>p.map(Math.round).join(',')).join(';'); if(k===flatKey) return; flatKey=k; const h=homography(src,d); flatH=h;
 flatEl.style.transform='matrix3d('+[h[0],h[3],0,h[6], h[1],h[4],0,h[7], 0,0,1,0, h[2],h[5],0,1].join(',')+')'; }
const SKY={glade:['#f2b7ad','#ffe6dc'],river:['#f4b0bc','#ffe9dc'],route:['#8fd3ff','#e8f7ff'],stadium:['#141a3a','#3a4a8a'],plaza:['#7f93e6','#dfe8ff'],'temple-fire':TEMPLE.fire.sky,'temple-grass':TEMPLE.grass.sky,'temple-water':TEMPLE.water.sky};
function setArena(kind){
 if(kind===curArena) return; const prev=curArena; curArena=kind; if(renderer) renderer.shadowMap.needsUpdate=true;
 if(benchPads) benchPads.visible=kind!=='plaza';
 // La cámara encuadra la plaza entera en el carrusel y el tablero en el resto
 if(board.G&&(kind==='plaza')!==(prev==='plaza')) fitCamera(board.G);
 if(FLAT&&kind==='glade'){ for(const k in arenas) arenas[k].visible=false; scene.background=null; scene.fog=null; return; }
 if(!arenas[kind]){ arenas[kind]=bakeStatic(buildArena(kind)); scene.add(arenas[kind]); }
 for(const k in arenas) arenas[k].visible=k===kind;
 const [a,b]=SKY[kind]; scene.background=canvasTex(2,64,(g)=>{ const gr=g.createLinearGradient(0,0,0,64); gr.addColorStop(0,a); gr.addColorStop(1,b); g.fillStyle=gr; g.fillRect(0,0,2,64); },false);
 scene.fog=new THREE.Fog(kind==='glade'?GL.fog:b,camDist+12,camDist+55);
 hemi.intensity=kind==='stadium'?1.1:1.5; sun.intensity=kind==='stadium'?1.6:2.4; sun.color.set(kind==='plaza'?'#fff0d8':'#ffffff');
}

/* ---------- modelos ---------- */
const loader=new GLTFLoader(); const draco=new DRACOLoader(); draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
const models={}; const queue=[]; let loading=0;
function dropQueue(){ for(const dex of queue.splice(0)) if(models[dex]&&models[dex].status==='queued') delete models[dex]; }
// Animaciones por estados: idle, run, attack, special, hit, faint y victory.
// Cada uno tiene public/anims/<n.º>.json (fotograma de impacto y, opcional, "glb": true para usar anims/<n.º>.glb con los clips ya
// renombrados). Para mejorar un clip basta con cambiar ese .glb (mismos huesos, mismos nombres): el código no cambia.
// Pokémon con modelo animado propio en public/anims (1.ª gen, de 06wj/pokemon); el resto sigue con Pokemon-3D-api
const ANIM_SET=new Set([1,2,3,4,5,6,7,8,9,10,13,16,19,20,21,25,26,35,36,39,40,43,44,45,50,51,52,53,54,55,58,59,60,61,62,63,64,65,66,67,68,74,75,76,77,78,81,82,90,91,92,93,94,95,96,97,98,99,111,112,116,117,122,123,125,128,129,130,131,132,133,134,135,136,142,143,145,146,147,148,149,150,230,249,250,570,571]);
// En producción los modelos animados salen de jsDelivr fijados al commit desplegado (mismos archivos, caché de un año y
// sin gastar el ancho de banda de Render); si jsDelivr falla, se piden a nuestro servidor. En local, siempre a nuestro servidor.
let ANIM_BASE='';
const animReady=fetch('/api/build').then(r=>r.ok?r.json():{}).catch(()=>({})).then(b=>{ if(b&&/^[0-9a-f]{7,40}$/.test(b.commit||'')&&/^[\w.-]+\/[\w.-]+$/.test(b.repo||'')) ANIM_BASE=`https://cdn.jsdelivr.net/gh/${b.repo}@${b.commit}/public/`; });
const animFetch=p=>animReady.then(()=>ANIM_BASE?fetch(ANIM_BASE+p).then(r=>r.ok?r:Promise.reject(r)).catch(()=>fetch(p)):fetch(p));
const SM_CLIPS=['idle','run','attack','special','hit','faint','victory'];
function wantModel(dex){
 let m=models[dex]; if(m) return m;
 m=models[dex]={status:'queued'};
 if(ANIM_SET.has(+dex)){ m.status='meta'; animFetch('anims/'+dex+'.json').then(r=>r.ok?r.json():{}).catch(()=>({})).then(j=>{ m.meta=j||{}; if(m.meta.glb){ m.url=ANIM_BASE+'anims/'+dex+'.glb'; m.local='anims/'+dex+'.glb'; } m.status='queued'; queue.push(dex); pump(); }); return m; }
 queue.push(dex); pump(); return m;
}
function pump(){
 while(loading<4&&queue.length){
   const dex=queue.shift(), m=models[dex]; loading++; m.status='loading';
   loader.load(m.retry?(m.local||MODEL_RAW(dex)):(m.url||MODEL_URL(dex)),gl=>{ loading--; try{ prepModel(m,gl,dex); m.status='ok'; warmModel(m); }catch(e){ m.status='fail'; } if(pWait[dex]) makePortrait(dex); pump(); },undefined,()=>{ loading--; if(!m.retry){ m.retry=1; m.status='queued'; queue.push(dex); pump(); return; } m.status='fail'; portraits[dex]=''; if(pWait[dex]){ for(const f of pWait[dex]) f(''); delete pWait[dex]; } pump(); });
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
// Sube las texturas a la GPU y compila sus shaders en cuanto llega el modelo (fuera del fotograma en que aparece)
function warmModel(m){ if(!renderer||!m.scene) return; try{ m.scene.traverse(o=>{ if(o.isMesh) for(const mt of [].concat(o.material)) for(const k of ['map','normalMap','emissiveMap']) if(mt[k]) renderer.initTexture(mt[k]); }); if(!renderer.compileAsync) return; renderer.compileAsync(m.scene,camera,scene).catch(()=>{});
 // También la variante transparente (al morir o volverse sigiloso se desvanece y three.js cambia de shader)
 const ms=[]; m.scene.traverse(o=>{ if(o.isMesh) for(const mt of [].concat(o.material)) ms.push([mt,mt.transparent,mt.depthWrite]); });
 for(const [mt] of ms){ mt.transparent=true; mt.depthWrite=false; } renderer.compileAsync(m.scene,camera,scene).catch(()=>{}); for(const [mt,t,d] of ms){ mt.transparent=t; mt.depthWrite=d; } }catch(e){} }
function prepModel(m,gl,dex){
 const root=gl.scene;
 // pose "tail" (en su .json): los alargados se ponen de pie sobre la cola, como Dratini, para ocupar su casilla igual que los demás
 if(m.meta&&m.meta.pose==="tail") root.rotation.x=-(m.meta.tilt||78)*Math.PI/180;
 root.updateMatrixWorld(true);
 root.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.receiveShadow=false; o.frustumCulled=false; const ms=Array.isArray(o.material)?o.material:[o.material]; for(const mt of ms){ if(mt.map) mt.map.colorSpace=THREE.SRGBColorSpace; if(mt.transparent&&mt.opacity>=1) mt.alphaTest=.5; } } });
 const clips=gl.animations||[], pick=res=>{ for(const re of res){ const c=clips.find(k=>re.test(k.name)); if(c) return c; } return null; };
 m.clips={idle:pick(RX.idle),walk:pick(RX.walk),attack:pick(RX.attack),cast:pick(RX.cast),ko:pick(RX.ko)};
 if(!m.clips.idle){ const c2=clips.find(k=>!BAD_IDLE.test(k.name)&&k!==m.clips.attack&&k!==m.clips.ko); m.clips.idle=c2||null; }
 // Sin desplazamiento de la raíz: algunas animaciones mueven el modelo hacia un lado y al repetirse vuelve de golpe (un "tic")
 const roots=new Set(); root.traverse(o=>{ if(o.isBone&&!(o.parent&&o.parent.isBone)) roots.add(o.name); });
 for(const c of clips) for(const tr of c.tracks){ const i=tr.name.lastIndexOf('.'); if(tr.name.slice(i+1)!=='position'||!roots.has(tr.name.slice(0,i))) continue; const v=tr.values; for(let k=3;k<v.length;k+=3){ v[k]=v[0]; v[k+2]=v[2]; } }
 const body=m.meta?bodyType(root,dex):null;
 // Se mide en la pose de reposo real: la animación de espera o, si no hay, la pose que le damos por código
 if(m.clips.idle){ const mx=new THREE.AnimationMixer(root); mx.clipAction(m.clips.idle).play(); mx.update(.4); root.updateMatrixWorld(true); }
 else { m.proc=rigPose(root,dex); root.updateMatrixWorld(true); }
 const box=new THREE.Box3().setFromObject(root,true), size=box.getSize(new THREE.Vector3()), c=box.getCenter(new THREE.Vector3());
 // Todos del mismo alto (como las piezas de TFT), salvo los muy anchos o largos, que se encogen para no salirse de su casilla
 const h=Math.max(size.y,1e-3), L=Math.max(size.x,size.z,1e-3);
 // Las serpientes enroscadas (COIL) ocupan más ancho que alto: se les deja algo más de margen
 m.kh=1.05/h; m.k=COIL.has(dex)?Math.min(1.2/h,1.8/L):Math.min(1.05/h,1.3/L);
 // size (en su .json): las primeras etapas, más pequeñas; al evolucionar se nota el cambio
 if(m.meta&&m.meta.size){ m.k*=m.meta.size; m.kh*=m.meta.size; } m.off=new THREE.Vector3(-c.x,-box.min.y,-c.z); m.scene=root;
 if(m.meta){ const have={}; for(const n of SM_CLIPS){ const c2=clips.find(k=>k.name===n); if(c2) have[n]=c2; }
   // alias: un clip propio que hace de otro (p. ej. special con el de ataque) antes de generarlo por código
   for(const [n,src] of Object.entries(m.meta.alias||{})) if(!have[n]&&have[src]) have[n]=have[src];
   const gen=synthClips(root,body,h); for(const n of SM_CLIPS) if(!have[n]&&gen[n]) have[n]=gen[n];
   // Una acción no puede fundirse consigo misma: special (si usa el clip del ataque) va con su copia, y los clips de una vez llevan una copia (~) para encadenar un golpe con el siguiente sin saltos
   if(have.special&&have.special===have.attack) have.special=have.attack.clone();
   const alt={}; for(const n of ["attack","special","hit"]) if(have[n]) alt[n]=have[n].clone();
   m.sm={clips:have,alt,hit:{attack:(m.meta.attack&&m.meta.attack.hit)||.4,special:(m.meta.special&&m.meta.special.hit)||.55},body}; }
}
// Tipo de cuerpo por los huesos (en la pose de montaje): serpiente, cuadrúpedo (brazos hacia el suelo), volador (alas largas) o bípedo
function bodyType(root,dex){ const B=bonesOf(root,true); root.updateMatrixWorld(true);
 if(COIL.has(+dex)) return 'serpent';
 if(chainOf(B,/^LFeeler\d+$/).length>=4) return 'flyer';
 const arm=B.LArm||B.RArm; if(arm&&B.LThigh&&Math.abs(dirOf(arm).y)>.7) return 'quad';
 if(!B.LThigh&&!B.RThigh) return 'float';
 return 'biped'; }
// Genera los 7 clips sobre el esqueleto (en la pose de reposo ya colocada): rotaciones alrededor de ejes del modelo,
// cada brazo en su lado (nunca cruza el cuerpo: solo gira hacia delante/atrás o hacia fuera)
function synthClips(root,body,h){
 const B=bonesOf(root,true); if(!Object.keys(B).length) return {};
 root.updateMatrixWorld(true);
 const X=new THREE.Vector3(1,0,0), Y=new THREE.Vector3(0,1,0), Z=new THREE.Vector3(0,0,1), FPS=30;
 const used=new Map(); // hueso → {q0, ejes locales}
 const reg=b=>{ if(!b) return null; if(!used.has(b)) used.set(b,{q0:b.quaternion.clone(),x:localAxis(b,X),y:localAxis(b,Y),z:localAxis(b,Z)}); return b; };
 const spine=chainOf(B,/^Spine\d*$/).map(reg), tail=chainOf(B,/^Tail\d*$/).map(reg), head=reg(B.Head), neck=reg(B.Neck||B.Neck1), jaw=reg(B.Jaw), hips=reg(B.Hips);
 const armL=reg(B.LArm), armR=reg(B.RArm), foreL=reg(B.LForeArm), foreR=reg(B.RForeArm), thL=reg(B.LThigh), thR=reg(B.RThigh), legL=reg(B.LLeg), legR=reg(B.RLeg), earL=reg(B.LEar), earR=reg(B.REar);
 const wingL=chainOf(B,/^LFeeler\d*$/).map(reg), wingR=chainOf(B,/^RFeeler\d*$/).map(reg);
 // Hacia fuera de cada brazo (signo del eje Z del modelo que lo levanta por su lado)
 const out=b=>b?(Math.sign(dirOf(b).x)||1):1;
 const quad=body==='quad', snake=body==='serpent';
 // f(t) → lista de [hueso, eje, ángulo]; se muestrea a 30 fps y se compone sobre la pose de reposo
 const make=(name,dur,f,loop)=>{ if(!used.size) return null; const n=Math.max(2,Math.round(dur*FPS)+1), times=new Float32Array(n), vals=new Map();
   for(const [bn] of used) vals.set(bn,new Float32Array(n*4));
   const q=new THREE.Quaternion(), qa=new THREE.Quaternion();
   for(let i=0;i<n;i++){ const t=loop?i/(n-1)*dur:i/(n-1)*dur; times[i]=t; const rot=new Map(); for(const [bone,ax,ang] of f(t/dur,t)){ if(!bone||!ang) continue; (rot.get(bone)||rot.set(bone,[]).get(bone)).push([ax,ang]); }
     for(const [bone,info] of used){ q.copy(info.q0); for(const [ax,ang] of rot.get(bone)||[]){ qa.setFromAxisAngle(info[ax],ang); q.multiply(qa); } q.toArray(vals.get(bone),i*4); } }
   const tracks=[...used].map(([bone])=>new THREE.QuaternionKeyframeTrack(bone.name+'.quaternion',times,vals.get(bone)));
   return new THREE.AnimationClip(name,dur,tracks); };
 const S=Math.sin, TAU2=Math.PI*2, ease=x=>x<0?0:x>1?1:x*x*(3-2*x), bump=(p,a,b)=>p<a||p>b?0:S((p-a)/(b-a)*Math.PI);
 const wave=(arr,p,amp,ax,lag=.7)=>arr.map((bn,i)=>[bn,ax,amp*S(p*TAU2-i*lag)]);
 const C={};
 // idle: respira, cola y orejas, mira alrededor (bucle exacto)
 C.idle=make('idle',2.6,p=>[ ...spine.map((bn,i)=>[bn,'x',.035*S(p*TAU2+i*.4)]), [neck,'x',.04*S(p*TAU2+.5)], [head,'x',.05*S(p*TAU2+.9)], [head,'y',.22*S(p*TAU2)*Math.min(1,Math.abs(S(p*TAU2))*1.6)],
   ...wave(tail,p,snake?.05:.16,'y',.5), [earL,'z',.07*S(p*TAU2*2)], [earR,'z',-.07*S(p*TAU2*2+.5)], [jaw,'x',.03*S(p*TAU2)], [armL,'x',.05*S(p*TAU2)], [armR,'x',.05*S(p*TAU2+Math.PI)],
   ...wingL.map((bn,i)=>[bn,'z',.18*S(p*TAU2+i*.4)]), ...wingR.map((bn,i)=>[bn,'z',-.18*S(p*TAU2+i*.4)]) ],true);
 // run: piernas alternas, brazos opuestos (cuadrúpedo: en diagonal), cadera y cola; la serpiente ondula
 C.run=make('run',.68,p=>{ const w=p*TAU2; if(snake) return [...wave([...spine,...tail],p,.18,'y',.8), [head,'y',-.08*S(w)]];
   return [ [thL,'x',.6*S(w)], [thR,'x',-.6*S(w)], [legL,'x',.4*S(w+.9)+.25], [legR,'x',-.4*S(w+.9)+.25],
     [armL,'x',(quad?-.55:-.5)*S(w)*(quad?-1:1)], [armR,'x',(quad?-.55:-.5)*S(w+Math.PI)*(quad?-1:1)], [foreL,'x',quad?.3*S(w+.9):0], [foreR,'x',quad?.3*S(w+.9+Math.PI):0],
     ...spine.map(bn=>[bn,'z',.05*S(w)]), [hips,'y',.06*S(w)], [head,'x',.06*S(w*2)], ...wave(tail,p,.25,'y',.6), ...wingL.map(bn=>[bn,'z',.35*S(w*1.5)]), ...wingR.map(bn=>[bn,'z',-.35*S(w*1.5)]) ]; },true);
 // attack: preparación (0–35 %), golpe con el impacto al 40 % y vuelta al reposo
 C.attack=make('attack',.5,p=>{ const k=p<.35?-ease(p/.35):p<.5?-1+2.4*ease((p-.35)/.15):1.4*(1-ease((p-.5)/.5));
   return [ ...spine.map(bn=>[bn,'x',.2*k]), [neck,'x',.15*k], [head,'x',.2*k], [jaw,'x',.35*Math.max(0,k)], [armL,'x',-.7*k], [armR,'x',-.7*k], [foreL,'x',-.3*Math.max(0,k)], [foreR,'x',-.3*Math.max(0,k)],
     [thL,'x',.15*k], [thR,'x',-.1*k], ...wave(tail,p,.15,'y'), ...(snake?[[spine[spine.length-1],'x',.35*k]]:[]) ]; });
 // special: carga más larga (brazos hacia fuera y arriba) y lanzamiento al 55 %
 C.special=make('special',.8,p=>{ const ch=p<.45?ease(p/.45):p<.6?1-ease((p-.45)/.15):0, rel=bump(p,.45,.85);
   return [ ...spine.map(bn=>[bn,'x',-.25*ch+.3*rel]), [head,'x',-.3*ch+.25*rel], [jaw,'x',.45*rel],
     [armL,'z',out(armL)*(.9*ch)], [armR,'z',out(armR)*(.9*ch)], [armL,'x',-.9*rel], [armR,'x',-.9*rel],
     ...wave(tail,p,.25*ch,'y',.5), ...wingL.map(bn=>[bn,'z',.6*ch]), ...wingR.map(bn=>[bn,'z',-.6*ch]) ]; });
 // hit: retroceso corto de cabeza y torso
 C.hit=make('hit',.3,p=>{ const k=bump(p,0,1); return [ ...spine.map(bn=>[bn,'x',-.18*k]), [neck,'x',-.12*k], [head,'x',-.25*k], [jaw,'x',.15*k], [armL,'x',.2*k], [armR,'x',.2*k] ]; });
 // faint: cae de lado y se queda quieto (la cadera gira el cuerpo entero)
 if(hips) C.faint=make('faint',1,p=>{ const k=ease(p/.65); return [ [hips,'z',(snake?.6:1.35)*k], ...spine.map(bn=>[bn,'x',.25*k]), [head,'x',.5*k], [thL,'x',-.5*k], [thR,'x',-.5*k], [armL,'x',.4*k], [armR,'x',.4*k], ...wave(tail,0,.0,'y') ]; });
 // victory: brazos arriba por su lado, cabeza alta y dos botes
 C.victory=make('victory',1.5,p=>{ const up=ease(p/.25)*(1-ease((p-.8)/.2)), hop=Math.abs(S(p*Math.PI*3))*up;
   return [ [armL,'z',out(armL)*1.0*up], [armR,'z',out(armR)*1.0*up], [armL,'x',-.4*hop], [armR,'x',-.4*hop], ...spine.map(bn=>[bn,'x',-.15*up]), [head,'x',-.3*up], [head,'y',.25*S(p*TAU2*2)*up],
     [thL,'x',-.25*hop], [thR,'x',-.25*hop], ...wave(tail,p*3,.3*up,'y',.5), ...wingL.map(bn=>[bn,'z',.5*hop]), ...wingR.map(bn=>[bn,'z',-.5*hop]) ]; });
 return C;
}

/* ---------- pose y movimiento por código (modelos sin animaciones) ---------- */
// Muchos modelos llegan sin animaciones, en la pose de montaje (a veces en T). Por el nombre de los huesos
// (Hips, Spine, Head, LArm, Tail…) se bajan los brazos, se enrosca la cola de las serpientes y se les da un
// vaivén suave (respirar, cabecear, mover la cola) para que no parezcan estatuas.
const boneName=o=>o.name.replace(/^\d+\s+/,'').replace(/_\d+$/,'');
const COIL=new Set([147,148,384]); // Dratini, Dragonair y Rayquaza: cuerpo enroscado como una serpiente
const _q=new THREE.Quaternion(), _v=new THREE.Vector3();
// loose: también quita prefijos como "004_" (Growlithe y otros); solo lo usan las animaciones por estados
// Nombres de Escarlata/Púrpura y Pokémon HOME (left_arm_01, tail_03, left_wing_a_02…) → los de arriba, para generar los clips que falten
function svName(n){ let m;
 if(n==='hips') return 'Hips'; if(n==='waist') return 'Waist'; if(n==='head') return 'Head';
 if((m=n.match(/^spine_0?(\d+)$/))) return 'Spine'+m[1]; if(/^neck(_0?1)?$/.test(n)) return 'Neck';
 if(/^(lower_)?jaw(_0?1|_a)?$/.test(n)) return 'Jaw'; if(n==='tail') return 'Tail1'; if((m=n.match(/^tail_0?(\d+)$/))) return 'Tail'+m[1];
 if(!(m=n.match(/^(left|right)_(.+)$/))) return null; const s=m[1]==='left'?'L':'R', r=m[2];
 if(/^ear(_0?1)?$/.test(r)) return s+'Ear'; if(/^arm(_0?1)?$/.test(r)) return s+'Arm'; if(/^arm_0?2$/.test(r)) return s+'ForeArm';
 if(/^leg(_0?1)?$/.test(r)) return s+'Thigh'; if(/^leg_0?2$/.test(r)) return s+'Leg'; if((m=r.match(/^wing(_a)?_0?(\d+)$/))) return s+'Feeler'+m[2];
 return null; }
function bonesOf(root,loose){ const B={}; root.traverse(o=>{ if(o.isBone){ const n=loose?boneName(o).replace(/^\d+_/,''):boneName(o); if(!B[n]) B[n]=o; const a=loose&&svName(o.name.replace(/^\d+\s+/,'')); if(a&&!B[a]) B[a]=o; } }); // con el nombre entero: boneName quita el _01 de left_wing_01
 if(loose&&!B.Hips&&B.Waist) B.Hips=B.Waist; return B; }
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

// Variocolor: lleva los tonos azules (y cian) de la textura al rojo, sin tocar blancos, cremas ni grises (como el Gyarados variocolor)
function shinyMat(mt){
 mt.onBeforeCompile=sh=>{ sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
  { vec3 c=diffuseColor.rgb; float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)), d=mx-mn, s=mx>0.?d/mx:0.;
    float h=0.; if(d>1e-4){ if(mx==c.r) h=mod((c.g-c.b)/d,6.); else if(mx==c.g) h=(c.b-c.r)/d+2.; else h=(c.r-c.g)/d+4.; h/=6.; }
    float w=smoothstep(.42,.5,h)*(1.-smoothstep(.74,.8,h))*smoothstep(.12,.3,s);
    vec3 red=vec3(mx,mx*(1.-s*.82),mx*(1.-s*.9));
    diffuseColor.rgb=mix(c,red*1.08,w); }`); };
 mt.customProgramCacheKey=()=>'shiny'; mt.needsUpdate=true;
}
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
 // 'shiny:130' = el mismo modelo con los azules teñidos de rojo (Pokemon-3D-api no tiene todos los variocolor)
 setDex(dex){
   if(dex===this.dex) return; this.dex=dex; this.clearModel(); this.m=wantModel(String(dex).replace(/^shiny:/,''));
 }
 clearModel(){ this.sm=null; this.noKo=false; if(this.ball){ this.body.remove(this.ball); this.ball=null; } if(this.model){ this.body.remove(this.model); poolPut(this); this.model=null; this.smActs=null; this.mixer=null; this.cur=null; this.mats=null; this.acts=null; this.proc=null; } if(this.sprite){ this.body.remove(this.sprite); this.sprite=null; } }
 ensure(){
   const m=this.m; if(!m) return;
   if(m.status==='ok'&&!this.model){
     if(this.sprite){ this.body.remove(this.sprite); this.sprite=null; }
     if(this.ball){ this.body.remove(this.ball); this.ball=null; }
     const kk=this.fitH&&m.kh?Math.min(m.kh,m.k*1.6):m.k, pk=this.dex+'|'+kk, pooled=poolGet(pk);
     if(pooled){ Object.assign(this,pooled); this.poolKey=pk; this.body.add(this.model); this.alpha=undefined; if(m.sm&&this.smActs){ this.sm={st:'',act:null,atkStarted:-1,castSeen:this.lastCast,flash:0,won:false}; this.go('idle'); } else this.play('idle',true); return; }
     const inst=SkeletonUtils.clone(m.scene); const holder=new THREE.Group(); inst.position.copy(m.off); holder.add(inst); holder.scale.setScalar(kk); holder.userData.k=kk; this.poolKey=pk;
     const shiny=String(this.dex).startsWith('shiny:');
     this.mats=[]; inst.traverse(o=>{ if(o.isMesh){ o.material=Array.isArray(o.material)?o.material.map(x=>x.clone()):o.material.clone(); for(const mt of [].concat(o.material)){ mt.userData.wasT=mt.transparent; if(mt.emissive) mt.userData.e0=mt.emissive.clone(); if(shiny) shinyMat(mt); this.mats.push(mt); } } });
     this.model=holder; this.body.add(holder); this.mixer=new THREE.AnimationMixer(inst); this.acts={};
     // Movimiento por código: cada hueso oscila alrededor de su pose de reposo
     this.proc=m.proc?m.proc.map(p=>{ const b=inst.getObjectByName(p.n); return b&&{b,rest:b.quaternion.clone(),ax:new THREE.Vector3().fromArray(p.ax),amp:p.amp,f:p.f,ph:p.ph,w:p.w}; }).filter(Boolean):null;
     for(const k in m.clips) if(m.clips[k]) this.acts[k]=this.mixer.clipAction(m.clips[k]);
     if(m.sm){ this.sm={st:'',act:null,atkStarted:-1,castSeen:this.lastCast,flash:0,won:false}; this.smActs={}; for(const n in m.sm.clips){ this.smActs[n]=this.mixer.clipAction(m.sm.clips[n]); if(m.sm.alt[n]) this.smActs[n+"~"]=this.mixer.clipAction(m.sm.alt[n]); } this.proc=null; this.go('idle'); }
      else this.play('idle',true);
   } else if(m.status!=='ok'&&!this.ball){ this.ball=pokeBall(); this.body.add(this.ball); } // cargando o sin modelo: Poké Ball, nunca un sprite 2D
 }
 // Cambia de estado con un fundido de 0,15 s (nunca de golpe). once: se reproduce una vez y se queda en el último fotograma
 go(name,o={}){ let a=this.smActs&&this.smActs[name]; if(!a) return false; const S=this.sm;
   if(S.st===name&&!o.restart){ if(o.ts&&S.act) S.act.timeScale=o.ts; return true; }
   if(S.act===a&&this.smActs[name+"~"]) a=this.smActs[name+"~"];
   const once=name!=='idle'&&name!=='run'; a.reset(); a.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity); a.clampWhenFinished=once; a.timeScale=o.ts||1; if(o.start) a.time=o.start; a.enabled=true;
   if(S.act&&S.act!==a) a.crossFadeFrom(S.act,name==='faint'?.35:.15,false); a.play(); S.act=a; S.st=name; S.once=once; return true; }
 // Máquina de estados: faint > victory > special/attack (con el impacto alineado al daño) > hit > run/idle
 smUpdate(spec,dt,movedSpeed){
   if(this.sm.frozen) return; this.sm.spec={dead:!!spec.dead,win:!!spec.win,atkIn:spec.atkIn,atk:spec.atk,cast:spec.cast};
   const S=this.sm, M=this.m.sm, C=M.clips, spd=spec.spd||1, dur=n=>C[n]?C[n].duration:0;
   const busy=S.once&&S.act&&S.act.isRunning();
   if(spec.dead){ if(S.st!=='faint'&&!this.go('faint')) this.noKo=true; return; }
   if(spec.win&&!S.won&&!busy){ S.won=true; if(this.go('victory')) return; }
   // Habilidad: cuando sube el contador, el lanzamiento empieza justo antes del impacto
   if((spec.cast||0)>S.castSeen){ S.castSeen=spec.cast; if(C.special){ this.go('special',{restart:true,start:Math.max(0,M.hit.special*dur('special')-.12),ts:1}); return; } }
   // Ataque: arranca antes del golpe para que su fotograma de impacto coincida con el daño de la simulación
   const nextAtk=(spec.atk||0)+1;
   if(C.attack&&spec.atkIn!=null&&S.atkStarted<nextAtk&&!(busy&&S.st==='special')){
     const ts=Math.max(1,dur('attack')/Math.max(.2,(spec.atkP||1)*.95)), lead=M.hit.attack*dur('attack')/ts;
     if(spec.atkIn<=lead){ S.atkStarted=nextAtk; this.go('attack',{restart:true,ts,start:Math.max(0,(lead-spec.atkIn)*ts)}); return; } }
   // Golpe que llegó sin anticipar (primer ataque, cambios de objetivo): se ve desde el impacto
   if(C.attack&&(spec.atk||0)>=S.atkStarted&&(spec.atk||0)>this.lastAtkSm){ this.lastAtkSm=spec.atk; if(S.atkStarted<spec.atk){ S.atkStarted=spec.atk; this.go('attack',{restart:true,start:M.hit.attack*dur('attack')}); return; } }
   this.lastAtkSm=Math.max(this.lastAtkSm||0,spec.atk||0);
   // Recibir daño: destello + clip hit (sin cortar un ataque o una habilidad)
   const fl=spec.flash||0; if(fl>S.flash+.05&&!busy){ S.flash=fl; if(this.go('hit',{restart:true})) return; } S.flash=fl;
   if(busy) return;
   // Correr a la velocidad real (los pies no patinan) o esperar
   if(this.moveT>0&&C.run) this.go('run',{ts:Math.min(1.7,Math.max(.7,movedSpeed/2.2))}); else this.go('idle');
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
   // Solo se gira al caminar: los quietos (tablero y banquillo) miran siempre al frente y un salto grande (soltar una ficha, reajuste del tablero) es un teletransporte
   const dd=this.lastPos?Math.hypot(p.x-this.lastPos.x,p.z-this.lastPos.z):0; this.lastSpeed=dt>0?(this.lastSpeed||0)*.7+.3*(dd/dt):0; const _=0, jump=dd>1.2, moving=!spec.still&&!jump&&dd>.004; this.moveT=moving?.15:(spec.still||jump)?0:Math.max(0,this.moveT-dt);
   if(moving&&!spec.drag){ const dx=p.x-this.lastPos.x, dz=p.z-this.lastPos.z; this.face=Math.atan2(dx,dz); }
   else if(spec.tx!=null&&!this.moveT){ const q=W3(spec.tx,spec.ty); this.face=Math.atan2(q.x-p.x,q.z-p.z); }
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
   const full=!spec.dead&&spec.charge>=.85; this.ring.material.color.set(full?spec.glowCol:ccol(spec.ring||'#ffffff')); this.ring.visible=!spec.hideRing; this.ring.scale.setScalar(spec.sel?1.25+.06*Math.sin(t*8):full?1.08+.07*Math.sin(t*9):1);
   // ataque y habilidad (contadores que suben en la simulación)
   if(this.sm){ this.lastAtk=spec.atk||0; this.lastCast=spec.cast||0; } else if((spec.atk||0)>this.lastAtk){ this.lastAtk=spec.atk; this.atkT=0; if(!this.play('attack',false)) this.atkT=0; }
   if((spec.cast||0)>this.lastCast){ this.lastCast=spec.cast; this.castT=0; this.play('cast',false); }
   this.atkT+=dt; this.castT+=dt;
   let lift=TOP, lean=0, fwd=0, breath=0, sway=0;
   if(spec.dead){
     if(this.deadT<0){ this.deadT=0; if(this.sm) this.smUpdate(spec,dt,0); else if(!this.play('ko',false)) this.noKo=true; }
     this.deadT+=dt; const k=clamp(this.deadT/1.1,0,1);
     if(this.noKo) lean=k*1.35; lift-=Math.max(0,this.deadT-.6)*.6;
     this.setAlpha(1-clamp((this.deadT-.5)/.7,0,1)); this.root.visible=this.deadT<1.3;
   } else {
     if(this.sm) this.smUpdate(spec,dt,this.lastSpeed||0);
     else { if(this.cur&&!this.cur.isRunning()&&this.curName!=='idle'&&this.curName!=='walk'){ this.cur.stop(); this.cur=null; }
       if(!this.cur||this.curName==='idle'||this.curName==='walk'){ if(this.moveT>0&&this.acts&&this.acts.walk) this.play('walk',true); else this.play('idle',true); } }
     // Cuerpo a cuerpo: se echa atrás (anticipación), embiste y vuelve. A distancia: pequeño culatazo hacia atrás.
     if(this.atkT<.32){ const a=this.atkT; fwd=spec.ranged?(a<.06?-a/.06*.1:-.1*(1-(a-.06)/.26)):(a<.07?-a/.07*.12:a<.17?lerp(-.12,.42,(a-.07)/.1):.42*(1-(a-.17)/.15)); }
     if(this.castT<.5){ lift+=Math.sin(this.castT/.5*Math.PI)*.35; }
     if(!this.acts||!this.acts.idle){ const ph=t+this.root.id; lift+=(Math.sin(ph*2.2)*.5+.5)*(this.proc?.04:.07); breath=Math.sin(ph*2.6)*(this.proc?.03:.05); lean=Math.sin(ph*1.3)*(this.proc?.02:.05); }
     if(this.moveT>0&&!(this.acts&&this.acts.walk)) lift+=Math.abs(Math.sin(t*13.2))*(this.proc?.07:.12);
     if(spec.drag) lift+=.5;
     this.setAlpha(spec.alpha!=null?spec.alpha:1);
   }
   let hx=0,hz=0,sq=0; if(this.hitT!=null&&this.hitT<.28&&!spec.dead){ this.hitT+=dt; const e=Math.max(0,1-this.hitT/.28), k=this.hitK*e*e; hx=this.hitDx*.16*k; hz=this.hitDz*.16*k; sq=.1*k; } else this.hitT=null;
   this.body.position.set(Math.sin(this.face)*fwd+hx,lift,Math.cos(this.face)*fwd+hz); this.body.rotation.x=0; this.body.rotation.z=lean; if(this.model) this.model.rotation.y=sway;
   if(this.sprite){ this.sprite.material.rotation=-lean; }
   if(this.ball){ this.ball.rotation.y=t*3; this.ball.position.y=.25+Math.abs(Math.sin(t*4))*.12; }
   // destello al recibir daño y brillo al lanzar
   const fl=clamp((spec.flash||0)/.12,0,1), gl=spec.glow||0, hf=this.hitT!=null?Math.max(0,1-this.hitT/.14)*.55*this.hitK:0;
   // Habilidad casi cargada: el Pokémon brilla suavemente con el color de su tipo (se ve qué va a lanzar pronto)
   const ch=!spec.dead&&spec.charge>=.85?(.12+.1*Math.sin(t*9)):0;
   const eW=Math.max(fl*.12,hf,evoGlow*.9), eC=Math.max(gl*.3,ch), e=Math.max(eW,eC), w=eW>=eC;
   if(this.mats&&(e>0||this.eOn)){ this.eOn=e>0; for(const mt of this.mats) if(mt.emissive){ const e0=mt.userData.e0; mt.emissive.setRGB(e0.r+e*(w?1:spec.glowCol.r),e0.g+e*(w?1:spec.glowCol.g),e0.b+e*(w?1:spec.glowCol.b)); } }
   if(this.model&&sq) this.model.scale.set(this.model.userData.k*(1+sq*.5),this.model.userData.k*(1-sq),this.model.userData.k*(1+sq*.5));
   if(this.mixer) this.mixer.update(dt*(this.sm?(spec.spd||1):1)*(spec.stun>0&&!spec.dead?.15:1));
   // Peso de la animación de andar: sube al moverse y baja al pararse, sin saltos
   this.wf=lerp(this.wf||0,this.moveT>0&&!spec.dead?1:0,Math.min(1,dt*8));
   if(this.proc&&!spec.dead){ const k=spec.stun>0?.2:1, wf=this.wf; for(const p of this.proc){ const a=p.w?p.amp*wf*Math.sin(t*p.f*Math.PI+p.ph):p.amp*k*(1-wf*.6)*Math.sin(t*p.f*Math.PI+p.ph+this.root.id); p.b.quaternion.copy(p.rest).multiply(_q.setFromAxisAngle(p.ax,a)); } }
   if(this.model&&!sq) this.model.scale.set(this.model.userData.k,this.model.userData.k*(1+breath),this.model.userData.k);
   // escudo, aturdimiento
   if(spec.shield>0&&!spec.dead){ if(!this.shieldM){ this.shieldM=new THREE.Mesh(shieldGeo,new THREE.MeshStandardMaterial({color:'#bfe6ff',emissive:'#3a7bd5',emissiveIntensity:.4,transparent:true,opacity:.22,depthWrite:false})); this.root.add(this.shieldM); }
     this.shieldM.visible=true; this.shieldM.scale.set(.85*sc*1.1,.9*sc*1.1,.85*sc*1.1); this.shieldM.position.y=TOP+.55*sc; this.shieldM.material.opacity=.18+.06*Math.sin(t*5); }
   else if(this.shieldM) this.shieldM.visible=false;
   if(spec.stun>0&&!spec.dead){ if(!this.stars){ this.stars=new THREE.Group(); for(let i=0;i<3;i++){ const s=new THREE.Mesh(starGeo,new THREE.MeshBasicMaterial({color:'#ffe066'})); s.position.set(Math.cos(i/3*TAU)*.35,0,Math.sin(i/3*TAU)*.35); this.stars.add(s); } this.root.add(this.stars); }
     this.stars.visible=true; this.stars.position.y=TOP+this.h*1.05; this.stars.rotation.y=t*4; for(const s of this.stars.children) s.material.color.set(spec.sleep>0?'#c9a7ff':'#ffe066'); }
   else if(this.stars) this.stars.visible=false;
   if(this.evoFx) this.stepEvo(dt);
   this.blob.visible=!spec.dead; if(!spec.dead) this.root.visible=true;
 }
 // Subida de estrellas: pilar de luz dorada, estallido de chispas y estrellas que suben girando (más cuantas más estrellas)
 evolve(star,big){ evoN++;
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
 synFx(list,dt,t){
   const L=list||[], cls=L.find(x=>SYN_CL[x]&&x!=='Guardián'), ph=t*2.2+this.root.id;
   if(cls){ if(!this.synRing){ this.synRing=new THREE.Mesh(new THREE.RingGeometry(.6,.86,48),addMat('#ffffff')); this.synRing.rotation.x=-Math.PI/2; this.synRing.position.y=TOP+.03; this.root.add(this.synRing); }
     const k=.5+.5*Math.sin(ph); this.synRing.visible=true; this.synRing.material.color.set(SYN_CL[cls]); this.synRing.material.opacity=.16+.2*k; this.synRing.scale.setScalar(1+.05*k); }
   else if(this.synRing) this.synRing.visible=false;
   if(L.includes('Guardián')){
     if(!this.synShield){ const g=new THREE.Group(), face=new THREE.Mesh(new THREE.CircleGeometry(.5,6),addMat('#7fd0ff')), edge=new THREE.Mesh(new THREE.RingGeometry(.46,.55,6),addMat('#d8f4ff'));
       face.material.opacity=.16; edge.material.opacity=.7; face.rotation.z=edge.rotation.z=Math.PI/6; g.add(face,edge); this.root.add(g); this.synShield=g; }
     const g=this.synShield, k=.5+.5*Math.sin(ph*.8); g.visible=true; g.position.set(.28,TOP+.72+.04*Math.sin(ph),.55); g.quaternion.copy(camera.quaternion); g.children[0].material.opacity=.1+.1*k; g.children[1].material.opacity=.45+.35*k; g.scale.setScalar(.95+.05*k); }
   else if(this.synShield) this.synShield.visible=false;
   const el=L.find(x=>SYN_EL[x]); if(!el) return; const E=SYN_EL[el], P=this.root.position;
   this.synAcc=(this.synAcc||0)+dt*E.rate;
   while(this.synAcc>=1){ this.synAcc--; const a=Math.random()*TAU, c=E.c[Math.random()<.6?0:1], rr=(rad)=>[P.x+Math.cos(a)*rad,P.z+Math.sin(a)*rad];
     switch(E.k){
       case 'flame': { const [x,z]=rr(.32+Math.random()*.12); emit({p:new THREE.Vector3(x,TOP+.04,z),v:[0,.55+Math.random()*.35,0],col:c,size:.22,size1:.03,life:.7,g:-.25,drag:1}); break; }
       case 'bubble': { const [x,z]=rr(.25+Math.random()*.25); emit({p:new THREE.Vector3(x,TOP+.15,z),v:[rnd(.05),.45+Math.random()*.2,rnd(.05)],col:c,size:.1,size1:.17,life:1.5,alpha:.75}); break; }
       case 'leaf': { const [x,z]=rr(.35+Math.random()*.25); emit({p:new THREE.Vector3(x,TOP+1.2+Math.random()*.3,z),v:[rnd(.25),-.22,rnd(.25)],col:c,size:.15,size1:.12,life:2.2,add:false,drag:.4}); break; }
       case 'spark': { const [x,z]=rr(.2+Math.random()*.2); emit({p:new THREE.Vector3(x,TOP+.35+Math.random()*.7,z),v:[rnd(.9),rnd(.9),rnd(.9)],col:c,size:.1,size1:.02,life:.22}); break; }
       case 'orb': { const b2=t*1.6+this.root.id; emit({p:new THREE.Vector3(P.x+Math.cos(b2)*.5,TOP+.75+.15*Math.sin(b2*2),P.z+Math.sin(b2)*.5),v:[0,.05,0],col:c,size:.14,size1:.02,life:.55}); break; }
       case 'twinkle': { const [x,z]=rr(Math.random()*.5); emit({p:new THREE.Vector3(x,TOP+.2+Math.random()*1,z),v:[0,.08,0],col:c,size:.15,size1:0,life:.5}); break; }
       case 'wisp': { const [x,z]=rr(.25+Math.random()*.15); emit({p:new THREE.Vector3(x,TOP+.05,z),v:[0,.8,0],col:c,size:.19,size1:.04,life:.85,drag:.8}); break; }
       case 'mist': { const [x,z]=rr(.3+Math.random()*.2); emit({p:new THREE.Vector3(x,TOP+.05,z),v:[rnd(.08),.22,rnd(.08)],col:c,size:.28,size1:.42,life:1.5,add:false,alpha:.45}); break; }
       case 'dust': { const [x,z]=rr(.3+Math.random()*.2); emit({p:new THREE.Vector3(x,TOP+.05,z),v:[rnd(.18),.3,rnd(.18)],col:c,size:.09,size1:.07,life:.8,add:false,g:.6}); break; }
     } }
 }
 // Se coloca una ficha que comparte sinergia: estallido de una vez (la ficha nueva, fuerte; las que comparten con ella, más suave) y destellos entre ellas
 joinFx(spec){ if(!spec.joinN||spec.joinN===this.lastJoin) return; this.lastJoin=spec.joinN; if(performance.now()-spec.joinT>600) return;
   const tr=spec.joinTraits||[], el=tr.find(x=>SYN_EL[x])||tr[0]; if(!el) return; const P=this.root.position, strong=!spec.joinFrom;
   joinBurst(P,el,strong); const cl=tr.find(x=>SYN_CL[x]&&x!==el); if(cl) shock(new THREE.Vector3(P.x,TOP+.06,P.z),SYN_CL[cl],.3,strong?1.9:1.3,.6);
   if(spec.joinTo) for(const q of spec.joinTo){ const w=W3(q[0],q[1],0); joinTrail(P,w,el); } }
 dispose(){ scene.remove(this.root); if(this.model){ this.body.remove(this.model); poolPut(this); } else if(this.mats) for(const m of this.mats) m.dispose(); this.model=null; if(this.shieldM) this.shieldM.material.dispose(); this.ring.material.dispose(); }
 // Reacción al recibir un golpe: retroceso en la dirección del impacto, aplastamiento y destello blanco
 hitReact(dx,dz,k,crit){ this.hitT=0; const L=Math.hypot(dx,dz)||1; this.hitDx=dx/L; this.hitDz=dz/L; this.hitK=Math.min(1.4,(.45+.55*k)*(crit?1.35:1)); }
}

/* ---------- efectos ---------- */
const fxVis=new Map();
// Pool de modelos por especie y escala (máx. 10 copias guardadas de cada una)
const POOL={};
function poolPut(a){ if(!a.model||!a.poolKey) return; const L=POOL[a.poolKey]=POOL[a.poolKey]||[]; if(a.mixer) a.mixer.stopAllAction();
 if(a.proc) for(const p of a.proc) p.b.quaternion.copy(p.rest);
 if(a.mats) for(const mt of a.mats){ if(mt.emissive&&mt.userData.e0) mt.emissive.copy(mt.userData.e0); mt.opacity=1; mt.transparent=mt.userData.wasT; mt.depthWrite=true; }
 if(L.length<10) L.push({model:a.model,mixer:a.mixer,acts:a.acts,smActs:a.smActs,mats:a.mats,proc:a.proc,cur:null,curName:null}); else if(a.mats) for(const mt of a.mats) mt.dispose(); }
function poolGet(k){ const L=POOL[k]; return L&&L.length?L.pop():null; }
// Geometrías compartidas de los efectos (no se liberan al acabar cada efecto)
const GEO={}; const geoS=(k,f)=>{ if(!GEO[k]){ GEO[k]=f(); GEO[k].userData.shared=true; } return GEO[k]; };
// Efectos cortos de impacto (anillos de onda) gestionados aquí, sin pasar por la simulación
const TRANS=[];
function shock(p,c,r0,r1,life,flat=true){ const m=new THREE.Mesh(geoS('ring',()=>new THREE.RingGeometry(.86,1,40)),addMat(c)); m.rotation.x=flat?-Math.PI/2:0; m.position.copy(p); if(!flat) m.lookAt(camera.position); m.renderOrder=11; scene.add(m); TRANS.push({m,t:0,life,r0,r1}); }
// Bola de fuego de la minileyenda de Charmander (tecla H): sale de su boca, sube en arco con estela de llamas y estalla en el campo rival
const PROJ=[];
function fireball(x1,y1,x2,y2,delay=0){ const a=W3(x1,y1,0), b=W3(x2,y2,0); PROJ.push({a,b,t:-delay,T:Math.max(.5,Math.hypot(b.x-a.x,b.z-a.z)/11)}); }
function stepProj(dt){
 for(let i=PROJ.length-1;i>=0;i--){ const o=PROJ[i]; o.t+=dt; if(o.t<0) continue; const k=Math.min(1,o.t/o.T), arc=Math.sin(k*Math.PI)*1.1;
   const p=new THREE.Vector3(lerp(o.a.x,o.b.x,k),TOP+.9+(1-k)*.2+arc,lerp(o.a.z,o.b.z,k));
   for(let n=0;n<7;n++) emit({p:p.clone().add(new THREE.Vector3(rnd(.18),rnd(.18),rnd(.18))),v:[rnd(.6),rnd(.6)+.2,rnd(.6)],col:n%2?'#ff7a1f':'#ffcf4a',size:1,size1:.08,life:.5,g:-.5,drag:1,alpha:.95});
   emit({p:p.clone(),col:'#fff6c8',size:1.5,size1:1,life:.08,alpha:1}); emit({p:p.clone(),col:'#ff9a2a',size:2.2,size1:1.6,life:.08,alpha:.45});
   if(Math.random()<.5) emit({p:p.clone(),v:[rnd(.6),.4,rnd(.6)],col:'#ffe08a',size:.1,size1:.02,life:.6,g:2});
   if(k>=1){ const e=o.b.clone().setY(TOP+.25); impactFx(EL.Fuego,'Fuego',e,true); shock(e.clone().setY(TOP+.06),'#ff8a2a',.3,2.4,.5); shock(e.clone().setY(TOP+.06),'#ffe08a',.15,1.4,.35); burst(e.clone().setY(TOP+.5),['#ff5a1a','#ffb02e','#fff0a0'],26,3.6,{up:4,size:.4,size1:.03,life:.8,g:-1}); shake=Math.max(shake,.1); PROJ.splice(i,1); } }
}
function stepTrans(dt){ for(let i=TRANS.length-1;i>=0;i--){ const o=TRANS[i]; o.t+=dt; const k=o.t/o.life; if(k>=1){ scene.remove(o.m); o.m.material.dispose(); TRANS.splice(i,1); continue; } o.m.scale.setScalar(lerp(o.r0,o.r1,1-(1-k)*(1-k))); o.m.material.opacity=1-k; } }
// Impacto con identidad por tipo: chispas, salpicaduras, polvo, ondas…
function impactFx(el,f,p,big){ const C=el.c, n=big?18:9;
 switch(f){
  case 'Agua': elBurst(el,p,n+6,2.6,{up:2.4,size:.2}); shock(p.clone().setY(TOP+.05),C[2],.2,big?1.1:.75,.35); break;
  case 'Eléctrico': for(let i=0;i<n;i++){ const a=Math.random()*TAU; emit({p:p.clone(),v:[Math.cos(a)*6,rnd(3),Math.sin(a)*6],col:C[i%3],size:.14,size1:.02,life:.16,drag:6}); } shock(p,C[1],.15,big?.9:.6,.18,false); break;
  case 'Roca': case 'Acero': burst(p,el.c,n,2.4,{up:2,g:8,add:el.add,size:.2,size1:.14,life:.6}); shock(p.clone().setY(TOP+.05),C[2],.25,big?1.2:.8,.3); break;
  case 'Lucha': case 'Normal': shock(p,'#ffffff',.2,big?1.1:.7,.2,false); elBurst(el,p,n,3,{size:.2}); break;
  case 'Psíquico': case 'Hada': shock(p,C[1],.1,big?1.2:.8,.4,false); elBurst(el,p,n,1.6,{size:.22}); break;
  case 'Fantasma': case 'Siniestro': burst(p,C,n,1.4,{up:.6,add:false,size:.35,size1:.55,life:.7,drag:3}); break;
  case 'Planta': burst(p,C,n,2,{up:1.5,g:1.5,add:false,size:.2,size1:.16,life:.8}); break;
  default: elBurst(el,p,n,big?3:2.2,{size:big?.3:.2});
 } }
const addMat=c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
// Para marcas en el suelo: mezcla normal, que se lee bien también sobre la hierba clara
const flatMat=c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:1,depthWrite:false,side:THREE.DoubleSide});
const glowSprite=(c,s)=>{ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:c,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})); sp.scale.set(s,s,1); return sp; };
let shake=0, shakeOn=!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
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
  case 'proj': { const g=new THREE.Group(); const solid=f.el==='Roca'||f.el==='Acero'||f.el==='Hielo', leaf=f.el==='Planta', dark=f.el==='Fantasma'||f.el==='Siniestro';
    if(solid){ const m=new THREE.Mesh(geoS(f.el==='Roca'?'rock':'shard',()=>f.el==='Roca'?new THREE.DodecahedronGeometry(.17,0):new THREE.OctahedronGeometry(.16,0)),new THREE.MeshStandardMaterial({color:C[1],emissive:C[0],emissiveIntensity:f.el==='Roca'?0:.35,flatShading:true,roughness:.6,metalness:f.el==='Acero'?.7:.1})); if(f.el!=='Roca') m.scale.set(.7,1.5,.7); g.add(m,glowSprite(C[2],.45)); g.userData.spin=m; }
    else if(leaf){ const m=new THREE.Mesh(geoS('leaf',()=>new THREE.CircleGeometry(.17,6)),new THREE.MeshBasicMaterial({color:C[1],side:THREE.DoubleSide,transparent:true})); m.scale.set(1,.45,1); g.add(m); g.userData.spin=m; }
    else { const core=glowSprite(dark?C[2]:C[2],f.big?.9:f.atk?.42:.5), halo=glowSprite(C[1],f.big?1.6:f.atk?.75:.9); if(dark){ halo.material.blending=THREE.NormalBlending; halo.material.color.set(C[0]); halo.material.opacity=.85; } g.add(halo,core); }
    v.obj=g; v.a=fxPos(cp,f.fc,f.fr,.6); v.b=fxPos(cp,f.tc,f.tr,.55); break; }
  case 'beam': { const g=new THREE.Group(); const a=fxPos(cp,f.fc,f.fr,.6), b=fxPos(cp,f.tc,f.tr,.6); const d=b.clone().sub(a); d.y=0; d.normalize(); const e=a.clone().addScaledVector(d,16);
    const outer=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,1,12,1,true),addMat(C[1])), inner=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,1,8,1,true),addMat('#ffffff'));
    placeSeg(outer,a,e); placeSeg(inner,a,e); g.add(outer,inner); v.obj=g; v.a=a; v.d=d; break; }
  case 'zap': { v.obj=boltMesh(7,C[1],.07); v.a=fxPos(cp,f.fc,f.fr,.6); v.b=fxPos(cp,f.tc,f.tr,.55); break; }
  case 'area': { const g=new THREE.Group(), [x,y]=cp(f.c,f.r), p=W3(x,y,TOP+.03); const disc=new THREE.Mesh(new THREE.CircleGeometry(1,40),addMat(C[1])); disc.rotation.x=-Math.PI/2; const ring=new THREE.Mesh(new THREE.RingGeometry(.9,1,48),addMat(C[2])); ring.rotation.x=-Math.PI/2; g.add(disc,ring); g.position.copy(p); v.obj=g; v.p=p; v.rad=f.rad*1.73; if(f.thin) disc.visible=false;
    elBurst(el,p.clone().add(new THREE.Vector3(0,.2,0)),Math.min(60,14+f.rad*14),2.2+f.rad*1.4,{up:1.5,spread:f.rad*.5}); break; }
  case 'meteor': { const g=new THREE.Group(); g.add(glowSprite(C[1],1.4),glowSprite(C[2],.7)); v.obj=g; v.b=fxPos(cp,f.c,f.r,.2); v.a=v.b.clone().add(new THREE.Vector3(2.2,7,-1.5)); break; }
  case 'swing': { const a=fxPos(cp,f.c,f.r,.55), b=fxPos(cp,f.tc,f.tr,.55); const m=new THREE.Mesh(geoS('swing',()=>new THREE.RingGeometry(.55,.72,16,1,-.9,1.8)),addMat(f.el?C[2]:'#ffffff')); const core=new THREE.Mesh(geoS('swing2',()=>new THREE.RingGeometry(.6,.66,16,1,-.7,1.4)),addMat('#ffffff')); m.add(core); m.position.copy(a.clone().lerp(b,.6)); m.lookAt(a); v.obj=m; v.b=b; v.el=f.el; break; }
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
  case 'hit': { const a=actors.get(f.u), s=f.src&&actors.get(f.src); if(a&&!f.u.dead){ const dx=s?a.root.position.x-s.root.position.x:0, dz=s?a.root.position.z-s.root.position.z:1; a.hitReact(dx,dz,f.k||0,f.crit); if(f.crit){ shock(a.head().setY(a.body.position.y+.6),'#ffd24a',.2,1.1,.25,false); shake=Math.max(shake,.05); } } v.done=true; break; }
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
  case 'proj': { const q=Math.min(1,p*1.15), pos=v.a.clone().lerp(v.b,q); pos.y+=Math.sin(q*Math.PI)*(f.big?.6:f.atk?.18:.35); v.obj.position.copy(pos); const sp=v.obj.userData.spin; if(sp){ sp.rotation.x+=dt*14; sp.rotation.z+=dt*9; } else if(v.obj.children[0].material.rotation!=null) v.obj.children[0].material.rotation+=dt*6;
    if(!f.atk||Math.random()<.6) emit({p:pos,v:[rnd(.3),rnd(.3)-el.g*.05,rnd(.3)],col:C[Math.random()*3|0],size:f.big?.38:f.atk?.16:.22,size1:.04,life:el.life*(f.atk?.4:.6),add:el.add!==false?true:false,g:el.g*.3});
    if(q>=1&&!v.hit){ v.hit=true; v.obj.visible=false; impactFx(el,f.el,v.b,!!f.big); } break; }
  case 'beam': { const w=1-p; v.obj.children[0].scale.x=v.obj.children[0].scale.z=w*(1+.15*Math.sin(f.t*60)); v.obj.children[1].scale.x=v.obj.children[1].scale.z=w; fade(v.obj);
    for(let i=0;i<4;i++){ const d=Math.random()*12; emit({p:v.a.clone().addScaledVector(v.d,d).add(new THREE.Vector3(rnd(.3),rnd(.3),rnd(.3))),v:[rnd(1),rnd(1)+(-el.g*.2),rnd(1)],col:C[Math.random()*3|0],size:.3,size1:.05,life:.4}); } break; }
  case 'zap': { layBolt(v.obj,v.a,v.b,.28); fade(v.obj); if(!v.hit){ v.hit=true; elBurst(el,v.b,12,3,{size:.18}); } break; }
  case 'area': { const r=v.rad*(.35+.65*Math.min(1,p*1.6)); v.obj.scale.set(r,1,r); v.obj.children[0].material.opacity=(1-p)*.5; v.obj.children[1].material.opacity=1-p; break; }
  case 'meteor': { const q=Math.min(1,p*1.6); v.obj.position.copy(v.a.clone().lerp(v.b,q)); emit({p:v.obj.position.clone(),v:[rnd(.4),rnd(.4),rnd(.4)],col:C[Math.random()*3|0],size:.55,size1:.05,life:.45});
    if(q>=1&&!v.hit){ v.hit=true; v.obj.visible=false; elBurst(el,v.b,30,3.5,{up:2.5,size:.32}); shake=Math.max(shake,.12);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),addMat(C[1])); ring.rotation.x=-Math.PI/2; ring.position.copy(v.b).setY(TOP+.03); scene.add(ring); v.ring=ring; }
    if(v.ring){ const k=(p-.62)/.38; v.ring.scale.setScalar(.3+k*1.6); v.ring.material.opacity=1-k; } break; }
  case 'swing': { v.obj.material.opacity=1-p; v.obj.children[0].material.opacity=1-p; v.obj.rotateZ(dt*10); if(!v.hit&&p>.35){ v.hit=true; impactFx(el,v.el||'Normal',v.b,false); } break; }
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
function killFx(v){ for(const o of [v.obj,v.ring]) if(o&&o.parent){ scene.remove(o); o.traverse(m=>{ if(m.geometry&&m.geometry!==shieldGeo&&!m.geometry.userData.shared) m.geometry.dispose(); if(m.material) m.material.dispose(); }); } }

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
// En la arena «glade» van dentro de las 10 hornacinas (gladeNiches: [x, z, orden desde el banquillo]); en las demás, en fila junto al banquillo
let totem=null; const crystals=[], gladeNiches=[];
function buildProps(){
 const g=new THREE.Group(), gold=new THREE.MeshStandardMaterial({color:'#e8b84a',metalness:.75,roughness:.3,emissive:'#4a3000',emissiveIntensity:.3});
 const stone=new THREE.MeshStandardMaterial({color:'#3a3f5c',roughness:.7}), gem=new THREE.MeshStandardMaterial({color:'#b9a6ff',emissive:'#6a4bff',emissiveIntensity:.8,roughness:.2,metalness:.2});
 // pedestal: zócalo de piedra en dos escalones con filos dorados, columna con dos anillos y una copa que sostiene la ball
 const stoneL=new THREE.MeshStandardMaterial({color:'#4a5070',roughness:.65});
 const base=new THREE.Group(), add=(geo,mat,y,rx=0)=>{ const m=new THREE.Mesh(geo,mat); m.position.y=y; m.rotation.x=rx; base.add(m); return m; };
 add(new THREE.CylinderGeometry(.56,.62,.16,32),stone,.08); add(new THREE.TorusGeometry(.56,.03,8,40),gold,.16,Math.PI/2);
 add(new THREE.CylinderGeometry(.42,.48,.14,32),stoneL,.23); add(new THREE.TorusGeometry(.42,.025,8,40),gold,.3,Math.PI/2);
 const col=new THREE.Mesh(new THREE.CylinderGeometry(.15,.2,1.05,16),stone); col.position.y=.82;
 add(new THREE.TorusGeometry(.2,.03,8,28),gold,.42,Math.PI/2); add(new THREE.TorusGeometry(.16,.025,8,28),gold,1.0,Math.PI/2);
 const ring=new THREE.Mesh(new THREE.CylinderGeometry(.3,.16,.16,24,1,true),gold); ring.position.y=1.38; ring.material.side=THREE.DoubleSide;
 // Master Ball: mitad morada con dos bultos rosas y la "M", mitad blanca, franja negra y botón
 const top=new THREE.Group(), mb=(c)=>new THREE.MeshStandardMaterial({color:c,roughness:.3,metalness:.1});
 const up=new THREE.Mesh(new THREE.SphereGeometry(.34,28,14,0,TAU,0,Math.PI/2),mb('#6a2fb8')), dn=new THREE.Mesh(new THREE.SphereGeometry(.34,28,14,0,TAU,Math.PI/2,Math.PI/2),mb('#f4f4f4'));
 const band=new THREE.Mesh(new THREE.CylinderGeometry(.345,.345,.05,28),mb('#15151c')), btn=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.06,18),mb('#f4f4f4')); btn.rotation.x=Math.PI/2; btn.position.z=.34;
 for(const sx of [-1,1]){ const bump=new THREE.Mesh(new THREE.SphereGeometry(.09,14,10),mb('#ff6fb0')); bump.position.set(sx*.17,.21,.21); bump.scale.set(1,.7,.7); top.add(bump); }
 const mTex=canvasTex(64,64,(g2)=>{ g2.fillStyle='#fff'; g2.font='900 46px system-ui'; g2.textAlign='center'; g2.textBaseline='middle'; g2.fillText('M',32,36); },false);
 const mLogo=new THREE.Mesh(new THREE.PlaneGeometry(.2,.2),new THREE.MeshBasicMaterial({map:mTex,transparent:true,depthWrite:false})); mLogo.position.set(0,.2,.29); mLogo.rotation.x=-.6;
 top.add(up,dn,band,btn,mLogo); top.position.y=1.72; top.rotation.y=-.35; top.rotation.x=.12; // quieta, girada un poco hacia la cámara
 const halo=glowSprite('#c9a2ff',1.6); halo.position.y=1.72;
 g.add(base,col,ring,top,halo); g.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); g.userData.top=top; scene.add(g); totem=g;
 const cg=new THREE.OctahedronGeometry(.26,0);
 for(let i=0;i<10;i++){ const m=new THREE.Mesh(cg,new THREE.MeshStandardMaterial({color:'#4a6c9a',emissive:'#000000',roughness:.25,metalness:.2,transparent:true,opacity:.65})); m.scale.y=1.9; const h=glowSprite('#7fe0ff',1.3); h.visible=false; const c=new THREE.Group(); c.add(m,h); c.userData={m,h}; scene.add(c); crystals.push(c); }
}
function stepProps(F,now){
 if(!totem) buildProps();
 const T=F.totem; totem.visible=!!T; if(T){ const p=flatH?flatWorld(FLAT_IMG.totem,0):W3(T.x,T.y,0); totem.position.set(p.x,flatH?0:TOP-.05,p.z); } // la ball se queda quieta
 const I=F.interest, flat=!!flatH, inNiche=flat||(curArena==='glade'&&gladeNiches.length===10);
 crystals.forEach((c,j)=>{ c.visible=!!I&&(flat?j<5:inNiche||j<5); if(!c.visible) return;
   // en las hornacinas, los dos lados muestran lo mismo y se encienden desde el banquillo hacia el fondo
   const i=flat?4-j%5:inNiche?gladeNiches[j][2]:j, bob=i<I.n?Math.sin(now*2.5+i)*.05:0;
   if(flat){ const w=flatWorld(FLAT_IMG.holes[j],0); c.position.set(w.x,.52+bob,w.z); } // la punta de abajo (0,5 por debajo del centro) queda en el hueco pintado
   else if(inNiche) c.position.set(gladeNiches[j][0],1.2+bob,gladeNiches[j][1]); else { const p=W3(I.x,I.y+i*I.dy,0); c.position.set(p.x,TOP+.25+bob,p.z); }
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
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:FLAT,powerPreference:'high-performance'}); if(FLAT) renderer.setClearColor(0x000000,0);
 renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
 renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate=false; renderer.shadowMap.needsUpdate=true;
 scene=new THREE.Scene();
 camera=new THREE.PerspectiveCamera(30,1,.1,200);
 hemi=new THREE.HemisphereLight('#ffffff','#5a6a40',1.5); scene.add(hemi);
 sun=new THREE.DirectionalLight('#ffffff',2.4); sun.position.set(-6,14,8); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:1,far:40}); sun.shadow.bias=-.0006; sun.shadow.normalBias=.02; scene.add(sun,sun.target);
 PA=makeParticles(true); PN=makeParticles(false); PB=makeParticles('bubble'); scene.add(PA.pts,PN.pts,PB.pts);
 setQuality(guessQuality());
 ready=true; setTimeout(warmFx,50);
}
// Compila de antemano los materiales de los efectos (rocas, olas, monedas, escudos…): sin esto, la primera vez que
// aparece cada uno el navegador compila su shader en mitad del combate y el juego se congela 100-200 ms
function warmFx(){ try{ const g=new THREE.Group(), box=new THREE.BoxGeometry(.01,.01,.01), add=(mt,sh)=>{ const m=new THREE.Mesh(box,mt); m.castShadow=!!sh; g.add(m); };
  add(new THREE.MeshStandardMaterial({flatShading:true}),true); add(new THREE.MeshStandardMaterial({flatShading:true,emissive:'#222',metalness:.7}));
  add(new THREE.MeshStandardMaterial({color:'#fff',emissive:'#222',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));
  add(new THREE.MeshStandardMaterial({emissive:'#222',metalness:.8,roughness:.3}),true); add(new THREE.MeshStandardMaterial({emissive:'#222',transparent:true}));
  add(addMat('#fff')); add(flatMat('#fff')); add(new THREE.MeshBasicMaterial({color:'#fff'})); add(new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true}));
  g.add(glowSprite('#fff',.1)); g.position.y=-50; scene.add(g);
  const done=()=>{ scene.remove(g); g.traverse(o=>{ if(o.material) o.material.dispose(); }); box.dispose(); };
  if(renderer.compileAsync) renderer.compileAsync(g,camera,scene).then(done,done); else { renderer.compile(scene,camera); done(); } }catch(e){} }
function setQuality(l){
 qLevel=clamp(l|0,0,2); Q=QL[qLevel]; if(!renderer) return;
 // Al apagar la sombra del sol, three.js recompila los materiales solo (cambia el estado de las luces)
 sun.castShadow=Q.shadow>0; renderer.shadowMap.needsUpdate=true;
 if(Q.shadow&&sun.shadow.mapSize.x!==Q.shadow){ sun.shadow.mapSize.set(Q.shadow,Q.shadow); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; } }
 renderer.setPixelRatio(Math.min(dpr0,Q.pr)); if(board.G){ renderer.setSize(M.W,M.H,false); partScale(); }
}
// Vigila los FPS reales en tramos de 2 s; dos tramos seguidos por debajo de 32 bajan un nivel de calidad
const perf={acc:0,n:0,bad:0,fps:0}; let autoQ=true;
function watchPerf(dt){
 if(!autoQ||document.hidden||dt<=0||dt>.25) return; // pestaña oculta o tirón suelto (al cargar un modelo): no cuenta
 perf.acc+=dt; perf.n++; if(perf.acc<2) return;
 perf.fps=perf.n/perf.acc; perf.acc=0; perf.n=0;
 if(perf.fps<45&&qLevel>0){ if(++perf.bad>=2){ perf.bad=0; setQuality(qLevel-1); } } else perf.bad=0;
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
 sun.target.position.set(0,0,tz); sun.position.set(-6,14,tz+8); renderer.shadowMap.needsUpdate=true;
 partScale();
}
// Tamaño de las partículas en píxeles del búfer (depende del alto y de la densidad de píxeles)
function partScale(){ const s=renderer.getSize(new THREE.Vector2()); for(const P of [PA,PN,PB]) P.mat.uniforms.uScale.value=s.y*renderer.getPixelRatio()/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)); }
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
// Pokémon en el tablero / máximo escrito en el suelo, en perspectiva como las casillas (un plano con textura sobre el tablero rival)
let cntMesh=null, cntCv=null, cntTex=null, cntKey='';
function stepCount(c,now){
 if(!c){ if(cntMesh) cntMesh.visible=false; return; }
 if(!cntMesh){ cntCv=document.createElement('canvas'); cntCv.width=1024; cntCv.height=384; cntTex=new THREE.CanvasTexture(cntCv); cntTex.colorSpace=THREE.SRGBColorSpace; cntTex.anisotropy=8;
   cntMesh=new THREE.Mesh(new THREE.PlaneGeometry(11,4.125),new THREE.MeshBasicMaterial({map:cntTex,transparent:true,depthWrite:false})); cntMesh.rotation.x=-Math.PI/2; cntMesh.renderOrder=3; scene.add(cntMesh); }
 const key=c.txt+(c.full?'f':'');
 if(key!==cntKey){ cntKey=key; const g=cntCv.getContext('2d'), W=1024, H=384; g.clearRect(0,0,W,H); g.textAlign='center'; g.textBaseline='middle'; g.lineJoin='round';
   const fs=250, tx=W*.58, ty=H*.52; g.font='900 '+fs+'px Nunito, system-ui, sans-serif';
   if(c.full){ g.fillStyle='rgba(120,130,150,.55)'; g.strokeStyle='rgba(10,14,24,.5)'; }
   else { const gr=g.createLinearGradient(0,ty-fs/2,0,ty+fs/2); gr.addColorStop(0,'#e4fbff'); gr.addColorStop(.5,'#58d8ff'); gr.addColorStop(1,'#2a7bff'); g.fillStyle=gr; g.strokeStyle='#0a3a66'; g.shadowColor='rgba(80,220,255,.9)'; g.shadowBlur=34; }
   g.lineWidth=26; g.strokeText(c.txt,tx,ty); g.shadowBlur=c.full?0:24; g.fillText(c.txt,tx,ty); g.shadowBlur=0;
   // Poké Ball a la izquierda del número
   const bx=W*.13, by=ty, r=112; g.lineWidth=18; g.strokeStyle=c.full?'rgba(20,24,36,.7)':'#0a2a4a';
   g.beginPath(); g.arc(bx,by,r,Math.PI,0); g.fillStyle=c.full?'rgba(70,76,92,.7)':'#ff5a4a'; g.fill(); g.beginPath(); g.arc(bx,by,r,0,Math.PI); g.fillStyle=c.full?'rgba(110,118,136,.7)':'#f6f6f6'; g.fill();
   g.beginPath(); g.arc(bx,by,r,0,Math.PI*2); g.moveTo(bx-r,by); g.lineTo(bx+r,by); g.stroke(); g.beginPath(); g.arc(bx,by,r*.3,0,Math.PI*2); g.fillStyle=c.full?'rgba(110,118,136,.7)':'#f6f6f6'; g.fill(); g.stroke();
   cntTex.needsUpdate=true; }
 const p=W3(c.x,c.y,0); cntMesh.position.set(p.x,TOP+.04,p.z); cntMesh.visible=true; cntMesh.material.opacity=c.full?.7:.82+.18*Math.sin(now*3);
}
function render(F){
 if(!ready) return;
 const now=performance.now()/1000, raw=lastT?now-lastT:0, dt=Math.min(.1,raw); lastT=now;
 watchPerf(raw); if(F.car) M.car=F.car; setArena(F.arena); stepFlat();
 if(arenas[curArena]) for(const a of arenas[curArena].userData.anim) a(now);
 // casillas resaltadas al arrastrar
 for(let i=0;i<56;i++){ const mine=i>=28, hi=F.cells&&F.cells.drop&&mine, on=F.cells&&F.cells.hover===i; hexMesh.setColorAt(i,ccol(on?'#ffffff':hi?(Math.sin(now*6)>0?'#9cc8ff':'#b8d8ff'):mine?'#cfe2ff':'#ffd9cf')); }
 hexMesh.instanceColor.needsUpdate=true; hexMesh.material.opacity=F.cells&&F.cells.drop?.7:.38;
 for(let i=0;i<9;i++) benchPads.setColorAt(i,ccol(F.benchHover===i?'#c8d8ff':FLAT&&curArena==='glade'?'#dfe8ff':curArena==='stadium'?'#262638':(curArena.startsWith('temple')||curArena==='river'||curArena==='glade')?'#6a6478':'#583018')); benchPads.instanceColor.needsUpdate=true;
 // escenario plano: las casillas del banquillo son las losas de la imagen; las 3D solo se intuyen al arrastrar una ficha
 if(FLAT&&curArena==='glade'){ benchPads.visible=!!(F.cells&&F.cells.drop); benchPads.material.transparent=true; benchPads.material.opacity=.3; benchPads.material.depthWrite=false; }
 hexMesh.visible=hexRing.visible=F.arena!=='plaza'&&!!(F.cells&&F.cells.drop);
 stepCount(F.floorCount,now);
 // actores
 const pt0=performance.now(); const seen=new Set();
 for(const s of F.actors){
   let a=actors.get(s.key); if(!a){ a=new Actor(s); actors.set(s.key,a); madeN++; }
   a.setDex(s.dex); s.glowCol=s.glowCol||ccol(s.glowColor||'#ffffff'); a.update(s,dt,now); a.synFx(s.syn,dt,now); a.joinFx(s); seen.add(s.key);
   s.anchor=projectV(a.head()); s.base=projectV(a.root.position.clone().setY(TOP));
 }
 for(const [k,a] of actors) if(!seen.has(k)){ a.dispose(); actors.delete(k); }
 const pt1=performance.now(); // efectos
 const fseen=new Set(), born=[];
 for(const f of F.fx){ if(f.t<0){ continue; } let v=fxVis.get(f); if(v===undefined){ v=makeFx(f,F); fxVis.set(f,v); born.push(f.type+(f.el?':'+f.el:'')); } if(v){ fseen.add(f); if(!v.done) updFx(f,v,F,dt); } }
 stepTrans(dt); stepProj(dt);
 for(const [f,v] of fxVis) if(!fseen.has(f)){ if(v) killFx(v); fxVis.delete(f); }
 stepOrbs(F.orbs,now); stepProps(F,now); stepBubbles(F.bubbles,now); stepPads(F.pads); stepLinks(F.links,now);
 stepParticles(PA,dt); stepParticles(PN,dt); stepParticles(PB,dt);
 const pt2=performance.now(); // temblor de cámara en los impactos fuertes
 const base=camera.position.clone(); if(shake>0&&shakeOn){ camera.position.x+=rnd(shake); camera.position.y+=rnd(shake); } shake=Math.max(0,shake-dt*.6);
 renderer.render(scene,camera); camera.position.copy(base);
 const pt3=performance.now(); const prg0=PT.progs; PT.progs=renderer.info.programs?renderer.info.programs.length:0; PT.a+=pt1-pt0; PT.f+=pt2-pt1; PT.g+=pt3-pt2; PT.n++;
 // Telemetría: fotogramas lentos (más de 40 ms) con su desglose y los efectos que nacieron en ellos
 if(pt3-pt0>40){ SLOW.push({ms:+(pt3-pt0).toFixed(1),actores:+(pt1-pt0).toFixed(1),efectos:+(pt2-pt1).toFixed(1),gpu:+(pt3-pt2).toFixed(1),nuevos:born.slice(0,12),progs:renderer.info.programs?renderer.info.programs.length:0,progsAntes:prg0}); if(SLOW.length>20) SLOW.shift(); }
}
const PT={a:0,f:0,g:0,n:0}, SLOW=[]; let madeN=0, evoN=0; // actores creados (diagnóstico: si sube sin parar, se están recreando)
// Estallido de una sinergia al colocar una ficha: cada elemento a su manera (llamas con brasas, burbujas que suben y se hinchan, hojas en espiral, chispas, polvo…)
const emitBig=(o,k=1.3)=>emit({...o,size:o.size*k,size1:o.size1!=null?o.size1*k:o.size*k*.3});
function joinBurst(P,trait,strong){
 const E=SYN_EL[trait], k=strong?1:.7, n=v=>Math.max(3,Math.round(v*k)), base=new THREE.Vector3(P.x,TOP+.05,P.z), at=(r,y)=>{ const a=Math.random()*TAU; return [new THREE.Vector3(P.x+Math.cos(a)*r,TOP+y,P.z+Math.sin(a)*r),a]; };
 if(!E){ const c=SYN_CL[trait]||'#ffffff'; shock(base,c,.3,strong?1.9:1.3,.6); shock(base,'#ffffff',.2,strong?1.2:.8,.35);
   for(let i=0;i<n(18);i++){ const [p,a]=at(.2+Math.random()*.4,.1); emitBig({p,v:[Math.cos(a)*.5,1+Math.random()*1.8,Math.sin(a)*.5],col:i%3?c:'#ffffff',size:.24,size1:0,life:1.1,drag:.5}); } return; }
 const C=E.c, c=i=>C[i%2];
 switch(E.k){
  case 'flame': shock(base,C[0],.3,1.9,.55); shock(base,C[1],.15,1.1,.4);
   for(let i=0;i<n(18);i++){ const a=i/n(18)*TAU+Math.random()*.3, r=.5+Math.random()*.12; emitBig({p:new THREE.Vector3(P.x+Math.cos(a)*r,TOP+.04,P.z+Math.sin(a)*r),v:[-Math.cos(a)*.3,1.3+Math.random()*1.2,-Math.sin(a)*.3],col:i%2?C[0]:C[1],size:.5,size1:.05,life:1.1+Math.random()*.4,g:-.5,drag:.7,alpha:.8}); }
   for(let i=0;i<n(12);i++){ const [p,a]=at(Math.random()*.22,.05); emitBig({p,v:[Math.cos(a)*.2,2.3+Math.random()*1.3,Math.sin(a)*.2],col:i%3?C[1]:'#ffe9a0',size:.38,size1:.03,life:1+Math.random()*.4,g:-.4,drag:.8,alpha:.9}); }
   for(let i=0;i<n(20);i++){ const [p,a]=at(.1+Math.random()*.35,.2); emitBig({p,v:[Math.cos(a)*1.1,2.6+Math.random()*2,Math.sin(a)*1.1],col:'#ffd27a',size:.1,size1:.02,life:1.4,g:2.6}); } break;
  case 'bubble': shock(base,C[0],.25,1.5,.65); shock(base,C[1],.1,.9,.45);
   for(let i=0;i<n(22);i++){ const [p]=at(.1+Math.random()*.5,.1), s0=.13+Math.random()*.14; emitBig({bub:true,p,v:[rnd(.35),.8+Math.random()*1.2,rnd(.35)],col:c(i),size:s0,size1:s0*1.6,life:1.4+Math.random()*.7,alpha:.95,drag:.3}); }
   for(let i=0;i<n(10);i++){ const a=Math.random()*TAU; emitBig({p:base.clone().setY(TOP+.2),v:[Math.cos(a)*1.5,2.2+Math.random()*1.3,Math.sin(a)*1.5],col:'#ffffff',size:.08,size1:.02,life:.55,g:6,alpha:.7}); } break;
  case 'leaf': shock(base,C[0],.3,1.4,.55);
   for(let i=0;i<n(20);i++){ const [p,a]=at(.5,.1); emitBig({p,v:[Math.cos(a)*.4-Math.sin(a)*1.2,.9+Math.random()*.9,Math.sin(a)*.4+Math.cos(a)*1.2],col:c(i),size:.16,size1:.1,life:1.6,add:false,drag:.2,g:.4}); }
   for(let i=0;i<n(12);i++){ const [p]=at(.1+Math.random()*.4,.1); emitBig({p,v:[0,.7+Math.random()*.7,0],col:'#e8ffb0',size:.12,size1:0,life:1}); } break;
  case 'spark': shock(base.clone().setY(TOP+.5),C[1],.2,1.5,.28,false); shock(base,C[0],.2,1.3,.3);
   for(let i=0;i<n(22);i++){ const a=Math.random()*TAU, sp=4+Math.random()*2.5; emitBig({p:base.clone().setY(TOP+.35+Math.random()*.5),v:[Math.cos(a)*sp,rnd(2.5),Math.sin(a)*sp],col:c(i),size:.18,size1:.02,life:.24,drag:3}); } break;
  case 'orb': shock(base,C[1],.3,1.6,.6); shock(base,C[0],.15,1,.4);
   for(let i=0;i<n(18);i++){ const [p,a]=at(.55,.15); emitBig({p,v:[Math.cos(a)*.9,.6+Math.random()*.9,Math.sin(a)*.9],col:c(i),size:.24,size1:.03,life:.95}); }
   for(let i=0;i<n(6);i++) emitBig({p:base.clone().setY(TOP+.2),v:[0,1+Math.random(),0],col:'#ffffff',size:.2,size1:.02,life:.8}); break;
  case 'twinkle': shock(base,C[1],.3,1.5,.5);
   for(let i=0;i<n(26);i++){ const [p]=at(Math.random()*.6,.1+Math.random()*1.1); emitBig({p,v:[0,.2+Math.random()*.4,0],col:c(i),size:.28,size1:0,life:1.1+Math.random()*.4}); } break;
  case 'wisp': shock(base,C[0],.3,1.5,.55);
   for(let i=0;i<n(20);i++){ const [p,a]=at(.4,.05); emitBig({p,v:[-Math.sin(a)*1.5,1.6+Math.random()*1.2,Math.cos(a)*1.5],col:c(i),size:.32,size1:.05,life:1,drag:.5}); } break;
  case 'mist': shock(base,C[1],.3,1.5,.6);
   for(let i=0;i<n(11);i++){ const [p]=at(.1+Math.random()*.4,.1); emitBig({p,v:[rnd(.5),.4+Math.random()*.4,rnd(.5)],col:c(i),size:.4,size1:.85,life:1.4,add:false,alpha:.55}); }
   for(let i=0;i<n(10);i++){ const [p,a]=at(.3,.05); emitBig({p,v:[-Math.sin(a)*1,1.2+Math.random(),Math.cos(a)*1],col:C[1],size:.22,size1:.04,life:.9}); } break;
  case 'dust': shock(base,C[1],.3,1.6,.4);
   for(let i=0;i<n(16);i++){ const [p,a]=at(.2,.05); emitBig({p,v:[Math.cos(a)*1.4,.6+Math.random()*.8,Math.sin(a)*1.4],col:c(i),size:.22,size1:.34,life:.9,add:false,alpha:.8,g:.2}); }
   for(let i=0;i<n(9);i++){ const [p,a]=at(.2,.1); emitBig({p,v:[Math.cos(a)*1.2,2.6+Math.random()*1.4,Math.sin(a)*1.2],col:C[0],size:.13,size1:.1,life:.7,add:false,g:9}); } break;
 } }
// Destello en arco entre la ficha que se coloca y cada una con la que comparte la sinergia
function joinTrail(a,b,trait){ const E=SYN_EL[trait], c=E?E.c[0]:(SYN_CL[trait]||'#ffffff'), dx=b.x-a.x, dz=b.z-a.z, len=Math.hypot(dx,dz)||1, N=Math.max(8,Math.round(len*3.2));
 for(let i=0;i<N;i++){ const s=i/(N-1), h=TOP+.5+Math.sin(s*Math.PI)*.55; emit({p:new THREE.Vector3(a.x+dx*s,h,a.z+dz*s),v:[dx/len*1.4,.25,dz/len*1.4],col:i%3?c:'#ffffff',size:.2,size1:.02,life:.55+.25*s}); } }
const SYN_EL={Fuego:{k:'flame',c:['#ff6a2a','#ffb347'],rate:9},Agua:{k:'bubble',c:['#9fd8ff','#e6f7ff'],rate:4},Planta:{k:'leaf',c:['#5fc24a','#b8f07a'],rate:3},Eléctrico:{k:'spark',c:['#ffe14a','#ffffff'],rate:7},
 Psíquico:{k:'orb',c:['#ff7ad0','#ffd6f2'],rate:9},Hada:{k:'twinkle',c:['#ffb0da','#ffffff'],rate:4},Dragón:{k:'wisp',c:['#8a7bff','#c9c2ff'],rate:5},Fantasma:{k:'mist',c:['#9b6ad8','#d2b8ff'],rate:3},
 Siniestro:{k:'mist',c:['#3a2350','#7a5a9e'],rate:3},Roca:{k:'dust',c:['#b09060','#d9c39a'],rate:3},Acero:{k:'twinkle',c:['#d4dde8','#ffffff'],rate:4},Lucha:{k:'wisp',c:['#ff7043','#ffd2a8'],rate:5}};
const SYN_CL={Guardián:'#7fd0ff',Coloso:'#ffb347',Tirador:'#ffe07a',Hechicero:'#b48cff',Asesino:'#ff5a7a',Sanador:'#7dffb0',Cazatesoros:'#ffd23a',Depredadores:'#ff8a3a','Potencial Evolutivo':'#9dff7a','Team Rocket':'#ff4d6d',Legendario:'#fff2a0'};
// Bandas de luz en el suelo entre los Coloso del tablero (aura compartida)
const linkTex=canvasTex(4,64,(g)=>{ const gr=g.createLinearGradient(0,0,0,64); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(.5,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,4,64); },false);
const linkPool=[];
function stepLinks(list,now){
 const L=list||[];
 for(let i=0;i<Math.max(L.length,linkPool.length);i++){
   let m=linkPool[i]; const k=L[i];
   if(!k){ if(m) m.visible=false; continue; }
   if(!m){ const pl=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:linkTex,color:'#ffb347',transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})); pl.rotation.x=-Math.PI/2; m=new THREE.Group(); m.add(pl); scene.add(m); linkPool[i]=m; }
   const a=W3(k[0],k[1],0), c=W3(k[2],k[3],0), dx=c.x-a.x, dz=c.z-a.z, len=Math.hypot(dx,dz); m.visible=true;
   m.position.set((a.x+c.x)/2,TOP+.05,(a.z+c.z)/2); m.rotation.y=Math.atan2(-dz,dx); m.children[0].scale.set(len,.55,1);
   m.children[0].material.opacity=.35+.2*Math.sin(now*2.4+i);
   if(Math.random()<.25*Q.part){ const s=Math.random(); emit({p:new THREE.Vector3(a.x+dx*s,TOP+.08,a.z+dz*s),v:[0,.5,0],col:'#ffd08a',size:.14,size1:.02,life:.7}); }
 }
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
// Depuración: congela los Pokémon de un número de Pokédex en un clip y un instante (0–1) para revisarlos
function debugPose(dex,clip,frac){ let n=0; for(const [,ac] of actors){ if(String(ac.dex)!==String(dex)||!ac.sm||!ac.smActs[clip]) continue; ac.mixer.stopAllAction(); const x=ac.smActs[clip]; x.reset(); x.setEffectiveWeight(1); x.play(); x.time=frac*x.getClip().duration; x.paused=true; ac.mixer.update(0); ac.sm.act=x; ac.sm.st=clip; ac.sm.frozen=true; n++; } return n; }
// Depuración: foto de cerca de un Pokémon (en el clip e instante indicados), para revisar las poses
// Depuración: foto desde cualquier punto del mundo mirando a otro (para revisar el decorado)
function debugView(px,py,pz,tx,ty,tz,S=300){ const cam=new THREE.PerspectiveCamera(40,1,.1,200); cam.position.set(px,py,pz); cam.lookAt(tx,ty,tz); cam.updateMatrixWorld();
 const rt=new THREE.WebGLRenderTarget(S,S,{samples:4}); rt.texture.colorSpace=THREE.SRGBColorSpace; renderer.setRenderTarget(rt); renderer.render(scene,cam); const px2=new Uint8Array(S*S*4); renderer.readRenderTargetPixels(rt,0,0,S,S,px2); renderer.setRenderTarget(null); rt.dispose();
 const c=document.createElement("canvas"); c.width=c.height=S; const g=c.getContext("2d"), im=g.createImageData(S,S); for(let y=0;y<S;y++) im.data.set(px2.subarray((S-1-y)*S*4,(S-y)*S*4),y*S*4); g.putImageData(im,0,0); return c.toDataURL(); }
function debugShot(dex,clip,frac,S=220,D=3.4){ const ac=[...actors.values()].find(x=>String(x.dex)===String(dex)&&x.sm); if(!ac) return null; if(clip) debugPose(dex,clip,frac);
 const p=ac.root.position, h=Math.max(.8,ac.h), cam=new THREE.PerspectiveCamera(28,1,.1,100); cam.position.set(p.x+h*.9*D/3.4,TOP+h*(.8+.3*D/3.4),p.z+h*D); cam.lookAt(p.x,TOP+h*.55,p.z);
 const rt=new THREE.WebGLRenderTarget(S,S,{samples:4}); rt.texture.colorSpace=THREE.SRGBColorSpace; renderer.setRenderTarget(rt); renderer.render(scene,cam); const px=new Uint8Array(S*S*4); renderer.readRenderTargetPixels(rt,0,0,S,S,px); renderer.setRenderTarget(null); rt.dispose();
 const c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d'), im=g.createImageData(S,S); for(let y=0;y<S;y++) im.data.set(px.subarray((S-1-y)*S*4,(S-y)*S*4),y*S*4); g.putImageData(im,0,0); return c.toDataURL(); }
// Diagnóstico (banco de rendimiento): qué se dibuja y de dónde sale cada llamada de dibujo
function debugInfo(){ const c={mallas:0,piel:0,actores:0,efectos:0,escenario:0,sprites:0,puntos:0,materiales:new Set()}, inFx=new Set(); for(const v of fxVis.values()) if(v) for(const o of [v.obj,v.ring]) if(o) o.traverse(m=>inFx.add(m));
 const act=new Set(); for(const a of actors.values()) a.root.traverse(m=>act.add(m));
 scene.traverseVisible(o=>{ if(o.isMesh||o.isSprite||o.isPoints){ c.mallas++; if(o.isSkinnedMesh) c.piel++; if(o.isSprite) c.sprites++; if(o.isPoints) c.puntos++; if(inFx.has(o)) c.efectos++; else if(act.has(o)) c.actores++; else c.escenario++; for(const m of [].concat(o.material)) c.materiales.add(m); } });
 c.materiales=c.materiales.size; c.programas=renderer.info.programs?renderer.info.programs.length:0; c.sombras=sun.castShadow; return c; }
window.B3={init,debugInfo,debugView,fireball,get made(){ return madeN; },get evos(){ return evoN; },dropQueue,debugPose,debugShot,get smDebug(){ const o=[]; for(const [,ac] of actors) if(ac.m&&ac.m.sm) o.push({dex:ac.dex,sm:!!ac.sm,acts:ac.smActs?Object.keys(ac.smActs):null,clips:Object.keys(ac.m.sm.clips),model:!!ac.model,body:ac.m.sm.body,bones:(()=>{ const n=[]; ac.m.scene.traverse(x=>{ if(x.isBone||/Thigh|Arm|Head|Hips/.test(x.name)) n.push((x.isBone?'B:':x.type+':')+x.name); }); return n.slice(0,12); })()}); return o; }, get smInfo(){ const o={}; for(const [k,ac] of actors) if(ac.sm){ const x=ac.sm.act; (o[ac.dex]=o[ac.dex]||[]).push({key:k,ry:+ac.body.rotation.y.toFixed(2),face:+ac.face.toFixed(2),estado:ac.sm.st,t:x?+(x.time/x.getClip().duration).toFixed(2):null,run:x?x.isRunning():null,paused:x?x.paused:null,spec:ac.sm.spec,started:ac.sm.atkStarted}); } return o; },setAuto:b=>{ autoQ=!!b; },get slow(){ return SLOW.splice(0); },setShake:b=>{ shakeOn=!!b; },get shakeOn(){ return shakeOn; },resize,render,project,unproject,preload,modelStatus,setQuality,portrait,totemTop,get info(){ const n=PT.n||1, o={actorsMs:+(PT.a/n).toFixed(2),fxMs:+(PT.f/n).toFixed(2),glMs:+(PT.g/n).toFixed(2)}; PT.a=PT.f=PT.g=PT.n=0; return renderer?{...o,calls:renderer.info.render.calls,tris:renderer.info.render.triangles,geo:renderer.info.memory.geometries,tex:renderer.info.memory.textures}:null; },get quality(){ return qLevel; },get fps(){ return perf.fps; },get ready(){ return ready; }};
window.dispatchEvent(new Event('b3ready'));

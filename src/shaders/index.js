// ── Shared GLSL helpers ──────────────────────────────────
export const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.);}`;

export const HSV = `
  vec3 hsv2rgb(vec3 c){
    vec4 K=vec4(1.,2./3.,1./3.,3.);
    vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
    return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
  }`;

export const NOISE_GLSL = `
  vec3 _h3(vec2 p){return fract(sin(vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9))))*43758.5453);}
  float _ns(vec2 p){vec2 i=floor(p),f=fract(p);f*=f*(3.-2.*f);float a=_h3(i).x,b=_h3(i+vec2(1,0)).x,c0=_h3(i+vec2(0,1)).x,d=_h3(i+vec2(1,1)).x;return mix(mix(a,b,f.x),mix(c0,d,f.x),f.y);}
  float _fbm(vec2 p){float v=0.,amp=0.5;for(int i=0;i<5;i++){v+=amp*_ns(p);p*=2.1;amp*=0.5;}return v;}
`;

export const ASPECT_FIX = `
  vec2 fixUV(vec2 uv, vec2 res) {
    float aspect = res.x / res.y;
    if(aspect < 1.0) { uv.y /= aspect; } else { uv.x *= aspect; }
    return uv;
  }
`;

// ── Post-processing shaders ───────────────────────────────
export const FRAG_BLACK    = `precision highp float; void main(){ gl_FragColor=vec4(0.,0.,0.,1.);}`;
export const FRAG_BLUR_H   = `precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform vec2 res; uniform float radius; void main(){ vec2 px=vec2(radius/res.x,0.); vec3 col=vec3(0.); float w=0.; for(int i=-8;i<=8;i++){float g=exp(-float(i*i)*.08);col+=texture2D(tMap,vUv+float(i)*px).rgb*g;w+=g;} gl_FragColor=vec4(col/w,1.);}`;
export const FRAG_BLUR_V   = `precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform vec2 res; uniform float radius; void main(){ vec2 px=vec2(0.,radius/res.y); vec3 col=vec3(0.); float w=0.; for(int i=-8;i<=8;i++){float g=exp(-float(i*i)*.08);col+=texture2D(tMap,vUv+float(i)*px).rgb*g;w+=g;} gl_FragColor=vec4(col/w,1.);}`;
export const FRAG_COMPOSITE= `precision highp float; varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tBloom; uniform float bloomStr; void main(){ vec3 scene=texture2D(tScene,vUv).rgb; vec3 bloom=texture2D(tBloom,vUv).rgb; gl_FragColor=vec4(scene+max(bloom-0.1,0.0)*bloomStr,1.);}`;
export const FRAG_CROSSFADE= `precision highp float; varying vec2 vUv; uniform sampler2D tNew; uniform sampler2D tOld; uniform float t; void main(){ gl_FragColor=vec4(mix(texture2D(tOld,vUv).rgb,texture2D(tNew,vUv).rgb,t),1.);}`;

// ── Mode fragment shaders ──────────────────────────────────
const UNIFORMS_DECL = `precision highp float; varying vec2 vUv;
  uniform float time,pulse,flash,energy,swirl,distort,bpmPhase,anticipate,kick;
  uniform vec3 c1,c2,c3; uniform vec2 res;`;

export const FRAG = {
PLASMA: `${UNIFORMS_DECL}
  ${NOISE_GLSL} ${ASPECT_FIX}
  float plasma(vec2 p,float t){
    float k=kick*sin(length(p)*18.-time*6.)*0.3;
    return sin(p.x*swirl+t)+sin(p.y*swirl*.8+t*1.3)
          +sin((p.x+p.y)*swirl*.6+t*.9)+sin(length(p)*swirl*1.2-t*1.1)+k;
  }
  void main(){
    vec2 uv=(vUv-.5)*2.; uv=fixUV(uv,res);
    uv*=1.0+anticipate*0.08-pulse*0.06;
    vec2 q=vec2(_fbm(uv+time*.12),_fbm(uv+vec2(1.7,9.2)));
    vec2 wp=uv+(distort+pulse*0.04)*(1.+pulse*5.)*vec2(_fbm(uv+2.*q+time*.08),_fbm(uv+2.*q))*6.;
    float pv=plasma(wp*(0.55+pulse*.3),time*.55)*.5+.5;
    float rad=length(uv);
    float ring=sin(atan(uv.y,uv.x)*4.+time*.8+rad*swirl)*.5+.5*smoothstep(1.6,.2,rad)*(0.15+pulse*.45);
    vec3 pc=mix(c1,c3,sin(bpmPhase*3.14159)*.5+.5);
    vec3 col=mix(pc,c2,pv); col=mix(col,c3,ring);
    col=mix(col,c1,_ns(wp*3.+time*.2)*pulse*.6);
    col*=1.-smoothstep(.5,1.4,rad)*.9+.05;
    col+=flash*.45*vec3(.9,.85,1.)+kick*.35*vec3(1.,0.9,0.8);
    gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(.85)),1.);
  }`,

TUNNEL: `${UNIFORMS_DECL}
  ${NOISE_GLSL} ${ASPECT_FIX}
  void main(){
    vec2 uv=(vUv-.5)*2.; uv=fixUV(uv,res);
    float r=length(uv)+.001, a=atan(uv.y,uv.x);
    float spd=.22*(1.+energy*2.2)+anticipate*.2+kick*.18;
    float tx=a/3.14159+time*.08, ty=1./r*.2-time*spd;
    tx+=_ns(vec2(tx,ty)*2.)*(distort+pulse*0.05)*3.;
    float stripe=sin(tx*swirl*3.+time)*.5+.5;
    float depth=sin(ty*18.+pulse*12.)*.5+.5;
    vec3 col=mix(c1,c2,stripe*(.4+depth*.6));
    col=mix(col,c3,sin(ty*8.-time*1.3)*.5+.5);
    col*=(.1+smoothstep(1.8,.05,r));
    col+=smoothstep(.4,0.,r)*(pulse*1.4+kick*.8+anticipate*.5)*.8*c1;
    col+=flash*.5*vec3(1.,.9,.8)+kick*.3*vec3(1.,0.85,0.7);
    gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(.8)),1.);
  }`,

MILKDROP: `${UNIFORMS_DECL}
  ${NOISE_GLSL} ${HSV} ${ASPECT_FIX}
  #define TAU 6.28318530
  #define PI  3.14159265

  // IQ-style 3-layer domain warp
  vec2 warp(vec2 p, float t){
    vec2 q=vec2(_fbm(p+vec2(t*.19,0.)), _fbm(p+vec2(0.,t*.17)));
    vec2 r=vec2(_fbm(p+4.*q+vec2(1.7+t*.11,9.2)), _fbm(p+4.*q+vec2(9.2,t*.09)));
    vec2 s=vec2(_fbm(p+6.*r+q*2.+vec2(t*.07,2.4)), _fbm(p+6.*r-q+vec2(3.1,t*.05)));
    return q*0.45+r*0.35+s*0.20;
  }

  // Cheap IFS attractor
  vec2 fold(vec2 p, float t){
    for(int i=0;i<5;i++){
      p=abs(p)-vec2(.5+_ns(vec2(float(i),t*.08))*.3);
      float a=t*.07+float(i)*.37;
      p=vec2(p.x*cos(a)-p.y*sin(a), p.x*sin(a)+p.y*cos(a));
    }
    return p;
  }

  void main(){
    vec2 uv=(vUv-.5)*2.; uv=fixUV(uv,res);
    float t=time*0.18;

    // Audio-reactive zoom that pulses inward on beat
    float zoomPulse=1.0+energy*.3+anticipate*.1-kick*.08;
    vec2 p=uv*zoomPulse;

    // 3-level cascaded warp — the core of Milkdrop
    float warpAmt=2.2+pulse*4.+energy*2.8+kick*5.;
    vec2 w=warp(p, t);
    vec2 wp=p+warpAmt*w;

    // IFS fold for crystalline structure
    vec2 fp=fold(wp*.6, t);
    float flen=length(fp);

    // Distance field of warped space
    float df0=_fbm(wp*1.2+vec2(t*.08));
    float df1=_fbm(wp*.55-vec2(t*.06,t*.04));
    float df2=_fbm(wp*2.8+vec2(-t*.1,t*.07)+w);
    float df3=_fbm(fp*1.4+vec2(t*.05));

    // Acid spiral — rotates faster with energy
    float ang=atan(wp.y,wp.x);
    float spd=1.3+energy*2.5+kick*1.5;
    float sp1=sin(ang*7.+length(wp)*swirl*2.2-time*spd+bpmPhase*TAU)*.5+.5;
    float sp2=sin(ang*3.-length(wp)*swirl*1.1+time*spd*.6)*.5+.5;
    float spiral=pow(sp1*sp2, 0.8+energy*.6);

    // Shockwaves that emanate from center on every beat
    float rad=length(uv);
    float shock=0.;
    for(int i=0;i<4;i++){
      float phase=bpmPhase-float(i)*.25;
      if(phase<0.) phase+=1.;
      float r=phase*.9;
      shock+=smoothstep(.06,.0,abs(rad-r))*(1.-float(i)*.2)
            *(kick*3.+anticipate*1.5);
    }

    // Chromatic hue that shifts with BPM phase
    float hue=fract(df0*.6+df1*.3+spiral*.3+bpmPhase*.4+time*.035+kick*.15);
    float sat=0.85+pulse*.15+energy*.1;
    float val=clamp((df0*.5+df2*.3+spiral*.4+df3*.2)
              *(1.-smoothstep(.3,1.3,rad)*.9)
              *(.5+energy*.8+pulse*.6+anticipate*.3+kick*.5), 0.,1.);

    vec3 hsvCol=hsv2rgb(vec3(hue,sat,val));

    // Blend with palette for color coherence
    vec3 palCol=mix(c1,c2,df0); palCol=mix(palCol,c3,df1);
    vec3 col=mix(hsvCol,palCol,0.3+_ns(fp*.5+vec2(t*.04))*.2);

    // IFS glow
    col+=mix(c1,c3,.5)*exp(-flen*1.8)*(0.4+energy*.8+kick*.6);

    // Beat shockwave in palette color
    col+=mix(c1,c2,hue)*shock;

    // Flash + vignette
    col+=flash*.6*vec3(.95,.88,1.);
    col*=1.-smoothstep(.25,1.2,rad)*.88;

    gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(.78)),1.);
  }`,

LISSAJOUS: `${UNIFORMS_DECL}
  ${ASPECT_FIX}
  float curve(vec2 uv,float ax,float ay,float px,float py,float thick){
    return smoothstep(thick,0.,length(uv-vec2(sin(ax*time*.4+px)*(.6+pulse*.4),sin(ay*time*.4+py)*(.6+pulse*.4))));
  }
  void main(){
    vec2 uv=(vUv-.5)*2.; uv=fixUV(uv,res);
    float thick=.018+distort*2.+pulse*.016+anticipate*.025+kick*.02;
    float v=curve(uv,3.,2.,0.,1.5708,thick)
           +curve(uv,5.,4.,.3,0.,thick)*.85
           +curve(uv,2.,3.,1.,.8,thick)*.7
           +curve(uv,7.,6.,.6,1.2,thick*.8)*.5;
    float hue=fract(time*.04+length(uv)*.1+bpmPhase*.1);
    vec3 col=mix(mix(c1,c2,hue),c3,1.-hue)*v;
    col*=1.0+pulse*0.8+kick*0.5;
    col+=mix(c1,c3,.5)*energy*.06;
    col+=flash*.6*vec3(.9,.85,1.)+kick*.4*c1;
    gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(.75)),1.);
  }`,

FRACTAL: `${UNIFORMS_DECL}
  ${ASPECT_FIX}
  void main(){
    vec2 uv=(vUv-.5)*2.; uv=fixUV(uv,res);
    float zoom=1.1+0.5*sin(time*.09)+energy*0.4+anticipate*0.25+kick*0.35;
    uv*=zoom;
    vec2 c=vec2(-0.7+0.12*sin(time*.031)+pulse*0.25+kick*0.12,
                 0.27+0.10*cos(time*.027)+energy*0.14);
    vec2 z=uv; float n=0.;
    for(int i=0;i<80;i++){if(dot(z,z)>4.)break;z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;n+=1.;}
    float escaped=step(n,79.);
    float t=clamp((n-escaped*log2(max(log(length(z)),1e-4)))/40.,0.,1.);
    float shift=bpmPhase*0.25+kick*0.15;
    vec3 col=mix(c1,c2,fract(t*2.+shift)); col=mix(col,c3,fract(t*3.+shift+.3));
    col*=escaped*(.4+t*.6)+(1.-escaped)*.04;
    col*=0.8+pulse*0.9+anticipate*0.4+kick*0.6;
    col+=flash*.4*vec3(.9,.85,1.)+kick*.3*vec3(1.,0.9,0.8);
    gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(.85)),1.);
  }`,

PSYCHO: `${UNIFORMS_DECL}
  #define TAU 6.28318530
  #define PI  3.14159265
  ${HSV} ${ASPECT_FIX}
  vec2 rot(vec2 p,float a){ float s=sin(a),c=cos(a); return vec2(p.x*c-p.y*s,p.x*s+p.y*c); }
  vec2 kfold(vec2 p,float n){ float a=atan(p.y,p.x),r=length(p),seg=TAU/n; a=mod(a,seg); a=abs(a-seg*.5); return vec2(cos(a),sin(a))*r; }
  float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
  float fbm(vec2 p){ float v=0.,a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){v+=a*vnoise(p);p=m*p;a*=.45;} return v; }
  void main(){
    vec2 uv=(vUv-.5)*2.; uv=fixUV(uv,res);
    float spd=0.5+energy*2.2+anticipate*0.8+kick*0.6;
    float warp=1.4+pulse*4.5+energy*2.0+kick*2.5;
    float nsym=3.0+floor(energy*6.0);
    float hshift=time*0.07+bpmPhase*0.6+kick*0.2;
    uv*=(1.0-kick*0.12);
    vec2 p=kfold(uv,nsym); p=rot(p,time*0.06*spd);
    float t1=time*0.11*spd;
    vec2 q=vec2(fbm(p+vec2(t1,0.)),fbm(p+vec2(0.,t1+1.7)));
    vec2 w=p+warp*q; float t2=time*0.07*spd;
    vec2 r2=vec2(fbm(w+2.*q+vec2(t2,9.2)),fbm(w+2.*q+vec2(5.4,t2)));
    w+=warp*0.55*r2; w=kfold(w,nsym*0.5+1.0); w=rot(w,-time*0.04*spd);
    float rad=length(uv);
    float f0=sin(w.x*(3.5+swirl*0.4)+time*spd*0.9)*.5+.5;
    float f1=sin(w.y*(2.8+energy*2.5)-time*spd*0.7+PI*0.4)*.5+.5;
    float f2=sin(length(w)*(5.0+pulse*6.)-time*spd*1.2)*.5+.5;
    float f3=sin(dot(w,vec2(0.707,0.707))*(4.0+energy*3.)+time*spd*0.5)*.5+.5;
    float shape=fract(f0*f1+f1*f2+f2*f3+fbm(w*1.2+time*0.04)*0.35);
    float hue=fract(shape*2.2+hshift+rad*0.2);
    float sat=0.82+pulse*0.18+kick*0.1;
    float val=clamp((0.4+shape*0.7)*(1.-smoothstep(0.5,1.5,rad))*(0.7+energy*0.7+anticipate*0.5+kick*0.5),0.,1.);
    vec3 rainbowCol=hsv2rgb(vec3(hue,sat,val));
    float blend=fbm(w*0.7+time*0.03);
    vec3 palcol=mix(mix(c1,c2,fract(hue+0.2)),c3,fract(hue*1.6+0.5));
    vec3 col=mix(rainbowCol,palcol,0.28+blend*0.2);
    float shock=smoothstep(0.04,0.,abs(rad-kick*1.2))*kick;
    col+=shock*vec3(1.,0.95,0.9)*1.5;
    col+=flash*0.6*vec3(1.,0.92,0.88)*(1.-rad*0.6);
    col+=anticipate*0.3*c1*smoothstep(0.9,0.0,rad);
    gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(0.85)),1.);
  }`,

MELANCHOLY: `${UNIFORMS_DECL}
  ${NOISE_GLSL} ${ASPECT_FIX}
  void main(){
    vec2 uv=(vUv-.5)*2.; uv=fixUV(uv,res);
    float slowT=time*0.18;
    vec2 warp1=vec2(_fbm(uv*1.2+vec2(slowT,0.3)),_fbm(uv*1.2+vec2(0.7,slowT+1.1)));
    vec2 wp=uv+warp1*(0.45+energy*0.6);
    float streakX=_fbm(vec2(wp.x*6.0,0.0));
    float streakY=fract(wp.y*3.5+slowT*0.9+streakX*0.5);
    float streak=pow(1.0-streakY,5.0+energy*4.0)*0.7;
    streak*=smoothstep(0.35,0.08,abs(fract(wp.x*5.0+streakX)-0.5));
    float rad=length(uv);
    float pool=sin(rad*(6.0+energy*3.0)-slowT*1.4)*0.5+0.5;
    pool*=smoothstep(1.3,0.0,rad);
    float wave=sin(uv.x*4.0+slowT+_ns(wp)*2.0)*0.5+0.5;
    wave*=(0.12+energy*0.25)*smoothstep(0.8,0.0,abs(uv.y));
    vec3 midnight=mix(vec3(0.03,0.04,0.12),c1*0.3,0.5);
    vec3 steel=mix(vec3(0.18,0.28,0.52),c2*0.6,0.5);
    vec3 tearWhite=mix(vec3(0.72,0.80,0.95),c3*0.9+vec3(0.1),0.4);
    vec3 col=mix(midnight,steel,pool*0.7+wave);
    col=mix(col,tearWhite,streak*(0.6+energy*0.5));
    col=mix(col,c1*0.35+c2*0.2,0.15+energy*0.1);
    col*=(0.75+sin(slowT*0.7)*0.12+energy*0.22);
    col*=1.0-smoothstep(0.5,1.4,rad)*0.85;
    col+=flash*0.18*tearWhite;
    gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(0.9)),1.);
  }`,

SMOKE: `${UNIFORMS_DECL}
  ${NOISE_GLSL} ${HSV} ${ASPECT_FIX}
  #define PI  3.14159265
  #define TAU 6.28318530

  // Smoke layer: warped fbm con luz interna simulada
  float smokeLayer(vec2 p, float t, float freq, float speed){
    vec2 q=vec2(_fbm(p*freq + vec2(t*speed, 0.)),
                _fbm(p*freq + vec2(0., t*speed*1.1)+3.7));
    vec2 r=vec2(_fbm(p*freq + 2.*q + vec2(t*speed*.7, 1.7)),
                _fbm(p*freq + 2.*q + vec2(9.2, t*speed*.6)));
    return _fbm(p*freq + 3.*r + vec2(t*speed*.4));
  }

  void main(){
    vec2 uv=(vUv-.5)*2.; uv=fixUV(uv,res);
    float t=time*.14;

    // Audio shake sutil
    float shk=kick*.018+energy*.008;
    uv+=vec2(_ns(vec2(time*2.1,.0))-0.5,
             _ns(vec2(.0,time*1.9))-0.5)*shk;

    // Luz principal — se mueve con el audio
    vec2 lightPos=vec2(
      sin(t*.4+bpmPhase*TAU)*.35*(1.+energy*.4),
      cos(t*.3+bpmPhase*PI*.5)*.25+kick*.1
    );

    // Luz secundaria — complementaria
    vec2 light2Pos=vec2(
      cos(t*.35+PI)*.3,
      sin(t*.28+PI*.7)*.2
    );

    // ── 4 capas de humo independientes ────────────────────
    // Cada capa tiene freq, velocidad y offset distintos
    // para dar sensación de profundidad z

    // Capa 1 — más lejana, lenta, grande
    float s1=smokeLayer(uv*.7+vec2(.3,.1), t, .9, .4);
    // Capa 2 — media
    float s2=smokeLayer(uv*.95+vec2(-.2,.4), t, 1.2, .55);
    // Capa 3 — más cercana, rápida
    float s3=smokeLayer(uv*1.3+vec2(.5,-.3), t, 1.6, .7);
    // Capa 4 — detalles finos, muy reactiva al audio
    float s4=smokeLayer(uv*2.1+vec2(-.4,.2), t, 2.2, .9+energy*.4);

    // Threshold y reshape para que parezca nube, no ruido
    s1=smoothstep(.38,.75,s1);
    s2=smoothstep(.40,.78,s2);
    s3=smoothstep(.42,.80,s3);
    s4=smoothstep(.45,.82,s4)*(energy*.6+pulse*.4+kick*.5);

    // ── Luz interna por capa ───────────────────────────────
    // Distancia al centro de luz para cada capa
    float d1=1.-smoothstep(.0,.9,length(uv-lightPos*.8));
    float d2=1.-smoothstep(.0,.7,length(uv-lightPos));
    float d3=1.-smoothstep(.0,1.1,length(uv-light2Pos));
    float d4=1.-smoothstep(.0,.5,length(uv)); // luz central

    // Iluminación: la luz se dispersa dentro del humo
    float lit1=s1*(d1*.6+d3*.3+.05);
    float lit2=s2*(d2*.8+d4*.2+.04)*(1.+pulse*.3);
    float lit3=s3*(d2*.9+d3*.4+.03)*(1.+energy*.4+kick*.3);
    float lit4=s4*(d4*1.2+d2*.5)*(1.+kick*.8+anticipate*.5);

    // ── Color por capa ─────────────────────────────────────
    // Luz 1: color de paleta que rota con BPM
    float hueShift=bpmPhase*.3+time*.025;
    vec3 lCol1=mix(c1,c3, sin(hueShift*TAU)*.5+.5);
    lCol1=mix(lCol1,c2, energy*.3);

    // Luz 2: complementaria, más fría
    vec3 lCol2=mix(c2,c1*.5+vec3(.1,.05,.2), .4+energy*.2);

    // Humo base: muy oscuro, casi negro con tinte
    vec3 smokeBase=mix(vec3(.02,.01,.03), c1*.08+c2*.05, .3);

    // ── Composición por capas (front to back) ─────────────
    vec3 col=smokeBase;

    // Capa 1 — fondo, color frío
    vec3 c1col=mix(smokeBase, lCol2*.7, lit1);
    col=mix(col, c1col, s1*.55);

    // Capa 2 — media, color cálido
    vec3 c2col=mix(smokeBase, lCol1*.9, lit2);
    col=mix(col, c2col, s2*.65);

    // Capa 3 — frente, más brillante
    vec3 c3col=mix(smokeBase, mix(lCol1,lCol2,.4)*1.1, lit3);
    col=mix(col, c3col, s3*.7);

    // Capa 4 — detalles, muy luminosos en beat
    vec3 c4col=mix(lCol1*.5, lCol1*1.4+lCol2*.3, lit4);
    col+=c4col*s4*.5;

    // ── Glow de la fuente de luz ───────────────────────────
    // Punto brillante donde está la luz, difuminado por el humo
    float glow1=exp(-length(uv-lightPos)*4.)*(1.5+pulse*2.+kick*3.+anticipate*1.5);
    float glow2=exp(-length(uv-light2Pos)*5.)*(.8+energy*1.2);
    col+=lCol1*glow1*(s1*.3+s2*.5+s3*.4+.1);
    col+=lCol2*glow2*(s1*.2+s2*.3+.08);

    // ── Translucidez extra — capas que se ven a través ────
    // Simula que el humo es semitransparente
    float transp=s2*s3*.4*(1.+energy*.3);
    col+=mix(c1,c3,.5)*transp*.15;

    // ── Beat: explosión de luz desde el centro ─────────────
    float beatFlash=kick*2.5+anticipate*.8;
    float beatGlow=exp(-length(uv)*2.5)*beatFlash;
    col+=mix(lCol1,vec3(1.,.95,.9),.3)*beatGlow;

    // Shockwave
    float shockR=kick*.7+anticipate*.08;
    float shock=smoothstep(.04,.0,abs(length(uv)-shockR))*(kick*2.+anticipate*1.2);
    col+=lCol1*shock*.8;

    // ── Vignette ───────────────────────────────────────────
    col*=1.-smoothstep(.4,1.2,length(uv))*.7;

    // Flash global
    col+=flash*.5*mix(lCol1,vec3(1.,.95,.92),.4);

    // Grano analógico sutil
    float grain=(_ns(uv*350.+vec2(time*67.,time*43.))-.5)*.035;
    col+=grain;

    gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(.80)),1.);
  }`,

SCOPE:  FRAG_BLACK,
RIPPLE: FRAG_BLACK,
};

export const MODES = ['PLASMA','TUNNEL','MILKDROP','LISSAJOUS','SCOPE','PSYCHO','RIPPLE','FRACTAL','MELANCHOLY','SMOKE'];
export const MODES_2D = new Set(['SCOPE','RIPPLE']);

/* Trójwymiarowy wir proceduralny. Bez obrazków: każda klatka powstaje w shaderze.
   Jeśli WebGL nie działa, następny skrypt uruchamia wcześniejszy renderer 2D. */
(function () {
  "use strict";
  var base = document.getElementById("portal-scene");
  var door = document.getElementById("portal-door");
  if (!base || !door) return;
  var canvas = document.createElement("canvas");
  canvas.className = "portal-scene";
  canvas.setAttribute("aria-hidden", "true");
  var gl;
  try { gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" }); }
  catch (e) { return; }
  if (!gl) return;

  var vertex = 'attribute vec2 p; void main(){gl_Position=vec4(p,0.0,1.0);}';
  var fragment = [
    'precision highp float;',
    'uniform vec2 resolution;',
    'uniform vec2 origin;',
    'uniform float radius;',
    'uniform float clock;',
    'uniform float journey;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){',
    '  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);',
    '}',
    'float clouds(vec2 p){return .57*noise(p)+.28*noise(p*2.04+4.7)+.15*noise(p*4.1-3.1);}',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/resolution;',
    '  vec2 screen=(gl_FragCoord.xy-.5*resolution)/resolution.y;',
    '  vec2 center=mix(origin,.5*resolution,smoothstep(0.0,.38,journey));',
    '  float zoom=1.0+7.5*pow(smoothstep(0.0,.48,journey),2.0);',
    '  vec2 p=(gl_FragCoord.xy-center)/(radius*zoom);',
    '  float r=length(p);',
    '  float a=atan(p.y,p.x);',
    '  float t=clock;',
    // Odległe gwiazdy i mgławica, bez fotografii.
    '  vec2 field=uv*vec2(resolution.x/resolution.y,1.0);',
    '  float space=clouds(field*4.0+vec2(t*.007,-t*.01));',
    '  vec3 color=vec3(.003,.006,.018)+vec3(.016,.013,.04)*space;',
    '  vec2 grid=field*155.0; vec2 cell=floor(grid); vec2 sub=fract(grid)-.5;',
    '  float starSeed=hash(cell);',
    '  float star=smoothstep(.055,.0,length(sub)) * step(.987,starSeed);',
    '  color+=vec3(.5,.65,1.0)*star*(.6+.4*sin(t*1.8+starSeed*100.));',
    // Wnętrze nie jest powierzchnią: współrzędna 1/r daje głęboki tunel.
    '  float depth=1.0/(r+.11);',
    '  float twist=a*3.0-log(r+.06)*4.5+t*.52;',
    '  vec2 flow=vec2(cos(a),sin(a))*2.7 + vec2(r*1.6-t*.13,r*.9+t*.08);',
    '  float mist=clouds(flow);',
    '  float veins=pow(.5+.5*cos(twist+(mist-.5)*1.8),7.0);',
    '  float folds=pow(.5+.5*cos(twist*.55-mist*2.0),5.0);',
    '  float into=smoothstep(.12,.55,journey);',
    '  float travel=log(r+.045)*14.0-t*2.0-journey*13.0;',
    '  float bands=pow(.5+.5*cos(travel+(mist-.5)*1.5),18.0)*smoothstep(.035,.18,r);',
    '  vec3 deep=vec3(.002,.006,.020)+vec3(.012,.020,.060)*mist;',
    '  vec3 smoke=mix(vec3(.065,.025,.18),vec3(.02,.29,.38),mist);',
    '  vec3 inside=deep + smoke*(.20+mist*.28) + veins*vec3(.06,.32,.40)*(0.4+mist);',
    '  inside+=folds*vec3(.08,.11,.30)*.25;',
    '  inside+=bands*vec3(.10,.55,.66)*(.12+into*.52);',
    '  float vanishing=exp(-r*22.0);',
    '  inside+=vec3(.45,.85,1.0)*vanishing*(.9+.1*sin(t));',
    // Organiczna, żywa krawędź; ziarno plazmy i nieregularny płomień.
    '  float edgeNoise=clouds(vec2(cos(a)*3.8+t*.15,sin(a)*3.8-t*.1)+r*2.0);',
    '  float rim=1.0+(.5-edgeNoise)*.11;',
    '  float edge=exp(-abs(r-rim)*31.0);',
    '  float halo=exp(-abs(r-rim)*7.0);',
    '  float flame=pow(max(0.0,edgeNoise-.38),1.7)*exp(-abs(r-rim)*8.0);',
    '  vec3 teal=vec3(.10,.80,.86), purple=vec3(.48,.20,.90), gold=vec3(1.0,.39,.13);',
    '  vec3 plasma=mix(teal,purple,smoothstep(.35,.8,edgeNoise));',
    '  plasma=mix(plasma,gold,smoothstep(.61,.79,edgeNoise)*.6);',
    '  float aperture=1.0-smoothstep(rim-.035,rim+.025,r);',
    '  color=mix(color,inside,aperture);',
    '  color+=plasma*(edge*(.8+edgeNoise*.9)+halo*.18+flame*1.6);',
    // Cząstki i światła poruszają się po głębi tunelu w kierunku kamery.
    '  vec2 lane=vec2((a+3.14159265)*8.0,log(r+.035)*4.0-t*1.4-journey*8.0);',
    '  vec2 laneId=floor(lane); vec2 lanePos=fract(lane)-.5;',
    '  float dustSeed=hash(laneId);',
    '  float speck=1.0-smoothstep(.04,.12,length(lanePos*vec2(1.0,.32)));',
    '  color+=vec3(.45,.86,1.0)*speck*step(.86,dustSeed)*aperture*(.12+into*.9)*smoothstep(.02,.2,r);',
    '  float streak=pow(.5+.5*cos(a*34.0),50.0);',
    '  float pulse=pow(max(0.0,sin(log(r+.05)*8.0-t*3.0-journey*10.0)),8.0);',
    '  color+=vec3(.15,.55,.75)*streak*pulse*into*aperture*.2;',
    '  color*=1.0-.22*smoothstep(.25,1.1,length(screen));',
    '  color=1.0-exp(-color*1.45);',
    '  color=pow(max(color,0.0),vec3(.83));',
    '  gl_FragColor=vec4(color,1.0);',
    '}'
  ].join('\n');
  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    return shader;
  }
  var vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return;
  var program = gl.createProgram();
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return; }
  gl.useProgram(program);
  var buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
  var attr = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(attr);
  gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
  var uniforms = {};
  ["resolution", "origin", "radius", "clock", "journey"].forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, name); });
  base.parentNode.insertBefore(canvas, base.nextSibling);

  var media = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var width = 0, height = 0, scale = 1, rect = null;
  var previous = null, lastDraw = 0, time = 0, elapsed = 0, duration = 4200, flying = false, frame = 0, stopped = false;
  function measure() {
    var b = door.getBoundingClientRect();
    rect = { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
  }
  function draw() {
    if (!rect || stopped) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.origin, rect.x * scale, canvas.height - rect.y * scale);
    gl.uniform1f(uniforms.radius, Math.max(1, rect.r * scale));
    gl.uniform1f(uniforms.clock, time);
    gl.uniform1f(uniforms.journey, flying ? Math.min(1, elapsed / duration) : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    // Ograniczamy liczbę pikseli, aby koszt sceny nie rósł z rozdzielczością ekranu.
    scale = Math.min(window.devicePixelRatio || 1, 1, Math.sqrt(700000 / Math.max(1, width * height)));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    measure(); if (media && media.matches) draw();
  }
  function tick(now) {
    frame = 0;
    if (document.hidden || stopped) { previous = null; return; }
    if (previous !== null) {
      var dt = Math.max(0, now - previous);
      time += dt / 1000;
      if (flying) elapsed += dt;
    }
    previous = now;
    if (!lastDraw || now - lastDraw >= 33) { draw(); lastDraw = now; }
    if (!(media && media.matches)) frame = requestAnimationFrame(tick);
  }
  function wake() {
    previous = null; lastDraw = 0;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!document.hidden && !stopped) {
      if (media && media.matches) draw(); else frame = requestAnimationFrame(tick);
    }
  }
  function scroll() { measure(); if (media && media.matches) draw(); }
  var api = {
    start: function (ms) { measure(); duration = ms; elapsed = 0; flying = true; wake(); },
    reset: function () { flying = false; elapsed = 0; measure(); wake(); }
  };
  window.RJPortalScene = api;
  canvas.addEventListener("webglcontextlost", function (event) {
    event.preventDefault(); stopped = true;
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize); window.removeEventListener("scroll", scroll);
    document.removeEventListener("visibilitychange", wake);
    if (media && media.removeEventListener) media.removeEventListener("change", wake);
    else if (media && media.removeListener) media.removeListener(wake);
    canvas.remove(); document.body.classList.remove("scene-ready");
    if (window.RJPortalScene === api) delete window.RJPortalScene;
    // Nawigacja jest niezależna od sceny; po utracie GPU przywracamy canvas 2D.
    var fallback = document.createElement("script"); fallback.src = "/js/portal-scene.js?v=2";
    fallback.onload = function () {
      if (flying && window.RJPortalScene) window.RJPortalScene.start(Math.max(1, duration - elapsed));
    };
    document.head.appendChild(fallback);
  }, false);
  document.body.classList.add("scene-ready");
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", scroll, { passive: true });
  document.addEventListener("visibilitychange", wake);
  if (media) {
    if (media.addEventListener) media.addEventListener("change", wake);
    else if (media.addListener) media.addListener(wake);
  }
  resize(); wake();
})();

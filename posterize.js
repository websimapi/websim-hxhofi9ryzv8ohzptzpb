export function applyPosterizeToImage(canvas, image, levels = 5.0, edgeMix = 0.12) {
  const gl = canvas.getContext('webgl');
  if (!gl) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const resize = () => {
    const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
      draw();
    }
  };

  const vsSrc = `
  attribute vec2 aPos;
  attribute vec2 aUV;
  varying vec2 vUV;
  void main(){ vUV=aUV; gl_Position=vec4(aPos,0.0,1.0); }`;

  const fsSrc = `
  precision highp float;
  uniform sampler2D uTex0;
  uniform vec2 uTexel;
  uniform float uLevels;
  uniform float uEdgeMix;
  varying vec2 vUV;

  float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 posterize(vec3 c, float lv){ return floor(c*lv)/lv; }

  void main(){
    vec3 col = texture2D(uTex0, vUV).rgb;
    col = pow(col, vec3(1.0/2.2));
    vec3 post = posterize(col, uLevels);
    post = pow(post, vec3(2.2));

    // Sobel edge on gamma-corrected luminance
    float tl=luma(texture2D(uTex0, vUV+uTexel*vec2(-1.0,-1.0)).rgb);
    float tc=luma(texture2D(uTex0, vUV+uTexel*vec2( 0.0,-1.0)).rgb);
    float tr=luma(texture2D(uTex0, vUV+uTexel*vec2( 1.0,-1.0)).rgb);
    float ml=luma(texture2D(uTex0, vUV+uTexel*vec2(-1.0, 0.0)).rgb);
    float mr=luma(texture2D(uTex0, vUV+uTexel*vec2( 1.0, 0.0)).rgb);
    float bl=luma(texture2D(uTex0, vUV+uTexel*vec2(-1.0, 1.0)).rgb);
    float bc=luma(texture2D(uTex0, vUV+uTexel*vec2( 0.0, 1.0)).rgb);
    float br=luma(texture2D(uTex0, vUV+uTexel*vec2( 1.0, 1.0)).rgb);

    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
    float edge = clamp(length(vec2(gx, gy))*0.9, 0.0, 1.0);
    vec3 edgeCol = vec3(1.0 - edge); // dark lines

    vec3 finalCol = mix(post, post*edgeCol, uEdgeMix);
    gl_FragColor = vec4(finalCol, 1.0);
 }`;

  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); }
    return s;
  };
  const prog = gl.createProgram(); 
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc)); 
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc)); 
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const quad = new Float32Array([
    -1,-1, 0,1,
     1,-1, 1,1,
    -1, 1, 0,0,
     1, 1, 1,0
  ]);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aUV  = gl.getAttribLocation(prog, 'aUV'); 
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aUV,  2, gl.FLOAT, false, 16, 8); gl.enableVertexAttribArray(aUV);

  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  const uTexel = gl.getUniformLocation(prog, 'uTexel');
  const uLevels = gl.getUniformLocation(prog, 'uLevels');
  const uEdgeMix = gl.getUniformLocation(prog, 'uEdgeMix');

  function draw() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.uniform2f(uTexel, 1.0 / image.naturalWidth, 1.0 / image.naturalHeight);
    gl.uniform1f(uLevels, levels);
    gl.uniform1f(uEdgeMix, edgeMix);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  resize(); 
  draw(); 
  window.addEventListener('resize', resize, { passive: true });
}
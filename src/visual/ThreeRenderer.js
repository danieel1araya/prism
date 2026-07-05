import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { VERT, FRAG_BLUR_H, FRAG_BLUR_V, FRAG_COMPOSITE, FRAG_CROSSFADE, FRAG, MODES_2D } from '../shaders/index.js';

// ── ThreeRenderer ─────────────────────────────────────────
// Manages the Three.js scene, bloom pipeline, and mode crossfade.

export class ThreeRenderer {
  constructor(canvas) {
    this.canvas  = canvas;
    this.renderer= null;
    this.scene   = null;
    this.camera  = null;
    this.mesh    = null;

    // Render targets
    this.rtScene = null; this.rtA = null; this.rtB = null; this.rtPrev = null;

    // Bloom / composite meshes
    this._blurHMesh = null;
    this._blurHMat  = null;
    this._blurVMat  = null;
    this._compositeMesh = null;
    this._crossfadeMesh = null;
    this._bloomScene    = null;
    this._compositeScene= null;
    this._crossfadeScene= null;
    this._bloomCam      = null;

    this.crossfade = 1.0;
  }

  init() {
    const W = innerWidth, H = innerHeight;

    this.scene  = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.autoClear = false;

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._buildMat('PLASMA'));
    this.scene.add(this.mesh);

    this.rtScene = this._makeRT(W, H);
    this.rtA     = this._makeRT(W >> 1, H >> 1);
    this.rtB     = this._makeRT(W >> 1, H >> 1);
    this.rtPrev  = this._makeRT(W, H);

    this._bloomCam       = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._bloomScene     = new THREE.Scene();
    this._compositeScene = new THREE.Scene();
    this._crossfadeScene = new THREE.Scene();

    const res = new THREE.Vector2(W >> 1, H >> 1);
    this._blurHMat = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, res: { value: res.clone() }, radius: { value: 1.5 } }, vertexShader: VERT, fragmentShader: FRAG_BLUR_H });
    this._blurVMat = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, res: { value: res.clone() }, radius: { value: 1.5 } }, vertexShader: VERT, fragmentShader: FRAG_BLUR_V });
    this._blurHMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._blurHMat);
    this._bloomScene.add(this._blurHMesh);

    const compMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: this.rtScene.texture }, tBloom: { value: this.rtB.texture }, bloomStr: { value: 1.0 } }, vertexShader: VERT, fragmentShader: FRAG_COMPOSITE });
    this._compositeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compMat);
    this._compositeScene.add(this._compositeMesh);

    const cfMat = new THREE.ShaderMaterial({ uniforms: { tNew: { value: this.rtScene.texture }, tOld: { value: this.rtPrev.texture }, t: { value: 1.0 } }, vertexShader: VERT, fragmentShader: FRAG_CROSSFADE });
    this._crossfadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cfMat);
    this._crossfadeScene.add(this._crossfadeMesh);
  }

  /** Switch to a new shader mode with crossfade */
  setMode(modeName, wasMode2D) {
    if (this.renderer && this.mesh && !wasMode2D) {
      this.renderer.setRenderTarget(this.rtPrev);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.crossfade = 0.0;
    } else {
      this.crossfade = 1.0;
    }
    if (this.mesh) this.mesh.material = this._buildMat(modeName);
  }

  /** Update uniforms and render bloom composite */
  render(time, audio, palette, bloomStr, dt = 1 / 60) {
    if (!this.renderer || !this.mesh) return;

    // 0.035/frame @60fps ≈ a 0.476s crossfade — expressed as a duration
    // so it takes the same real time regardless of refresh rate.
    this.crossfade = Math.min(1, this.crossfade + dt / 0.476);

    const u = this.mesh.material.uniforms;
    u.time.value      = time;
    u.pulse.value     = audio.bassPulse;
    u.flash.value     = audio.flash;
    u.kick.value      = audio.beatKick;
    u.energy.value    = audio.energy;
    u.swirl.value     = audio.swirl;
    u.distort.value   = 0.008 + audio.energy * 0.025;
    u.bpmPhase.value  = audio.bpmPhase;
    u.anticipate.value= audio.anticipate;
    u.res.value.set(innerWidth, innerHeight);
    palette.applyToUniforms(u);

    this._renderBloom(bloomStr, audio);
  }

  resize() {
    if (!this.renderer) return;
    const W = innerWidth, H = innerHeight;
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    if (this.mesh) this.mesh.material.uniforms.res.value.set(W, H);
    this.rtScene?.setSize(W, H);
    this.rtPrev?.setSize(W, H);
    this.rtA?.setSize(W >> 1, H >> 1);
    this.rtB?.setSize(W >> 1, H >> 1);
  }

  _buildMat(mode) {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }, pulse: { value: 0 }, flash: { value: 0 }, kick: { value: 0 },
        energy: { value: 0 }, swirl: { value: 4 }, distort: { value: 0.01 },
        bpmPhase: { value: 0 }, anticipate: { value: 0 },
        c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() },
        res: { value: new THREE.Vector2(innerWidth, innerHeight) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG[mode] || FRAG.PLASMA,
    });
  }

  _makeRT(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    });
  }

  _renderBloom(bloomStr, audio) {
    const { renderer, scene, camera, rtScene, rtA, rtB, rtPrev,
            _blurHMesh: blurH, _blurHMat: matH, _blurVMat: matV,
            _compositeMesh: compMesh, _crossfadeMesh: cfMesh,
            _bloomScene: bScene, _compositeScene: cScene, _crossfadeScene: xScene, _bloomCam: bcam } = this;
    const W = innerWidth, H = innerHeight;

    renderer.setRenderTarget(rtScene); renderer.clear(); renderer.render(scene, camera);

    const applyBlur = (src, dst, mat) => {
      mat.uniforms.tMap.value = src.texture;
      mat.uniforms.res.value.set(W >> 1, H >> 1);
      blurH.material = mat;
      renderer.setRenderTarget(dst); renderer.clear(); renderer.render(bScene, bcam);
    };

    applyBlur(rtScene, rtA, matH);
    applyBlur(rtA,     rtB, matH);
    applyBlur(rtB,     rtA, matV);
    applyBlur(rtA,     rtB, matH);
    applyBlur(rtB,     rtA, matV);

    const finalBloom = bloomStr ?? (0.9 + audio.bassPulse * 0.6 + audio.anticipate * 0.3 + audio.beatKick * 0.8);
    compMesh.material.uniforms.tScene.value  = rtScene.texture;
    compMesh.material.uniforms.tBloom.value  = rtA.texture;
    compMesh.material.uniforms.bloomStr.value = finalBloom;

    if (this.crossfade < 1.0) {
      renderer.setRenderTarget(rtB); renderer.clear(); renderer.render(cScene, bcam);
      cfMesh.material.uniforms.tNew.value = rtB.texture;
      cfMesh.material.uniforms.tOld.value = rtPrev.texture;
      cfMesh.material.uniforms.t.value    = this.crossfade;
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(xScene, bcam);
    } else {
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(cScene, bcam);
    }
  }
}

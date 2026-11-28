import { useRef, useEffect, useState } from 'react';
import { Renderer, Program, Mesh, Triangle, Vec2 } from 'ogl';
import { hexToOklab, mixOklab, oklabToRgb01, type Oklab } from '@/lib/palette';
import { motionDuration } from '@/lib/motion';
import { breathValue } from '@/hooks/useScrollBreath';
import type { SectionMeshBlob } from '@/lib/sections';
import { createFrameWindowSampler, type FrameWindowStats } from '@/lib/device-performance';
import './DarkVeil.css';

/** Film-grain amplitude when ambient mesh/noise are folded into the shader. */
const FOLDED_NOISE = 0.035;
/** Soft secondary-blob wash strength (dark → light). */
const TINT_B_AMOUNT = { dark: 0.28, light: 0.12 } as const;

const vertex = `
attribute vec2 position;
void main(){gl_Position=vec4(position,0.0,1.0);}
`;

const vertexWebgl2 = `#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0.0,1.0);}
`;

const fragment = `
#ifdef GL_ES
precision lowp float;
#endif
uniform vec2 uResolution;
uniform float uTime;
uniform float uHueShift;
uniform float uNoise;
uniform float uScan;
uniform float uScanFreq;
uniform float uWarp;
/** Section identity colour the field drifts toward, gamma-encoded sRGB 0-1. */
uniform vec3 uTint;
/** How far the raw CPPN palette is pulled toward uTint. */
uniform float uTintAmount;
/** Secondary mesh blob colour (soft radial), gamma-encoded sRGB 0-1. */
uniform vec3 uTintB;
/** Secondary blob centre in UV space (origin bottom-left, 0-1). */
uniform vec2 uTintPos;
/** How far the radial wash pulls toward uTintB (0 = off). */
uniform float uTintBAmount;
/** 0 = ink-on-night, 1 = ink-on-paper. Drives the light-section wash. */
uniform float uLightMix;
#define iTime uTime
#define iResolution uResolution

vec4 buf[8];
float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}

mat3 rgb2yiq=mat3(0.299,0.587,0.114,0.596,-0.274,-0.322,0.211,-0.523,0.312);
mat3 yiq2rgb=mat3(1.0,0.956,0.621,1.0,-0.272,-0.647,1.0,-1.106,1.703);

vec3 hueShiftRGB(vec3 col,float deg){
    vec3 yiq=rgb2yiq*col;
    float rad=radians(deg);
    float cosh=cos(rad),sinh=sin(rad);
    vec3 yiqShift=vec3(yiq.x,yiq.y*cosh-yiq.z*sinh,yiq.y*sinh+yiq.z*cosh);
    return clamp(yiq2rgb*yiqShift,0.0,1.0);
}

vec4 sigmoid(vec4 x){return 1./(1.+exp(-x));}

vec4 cppn_fn(vec2 coordinate,float in0,float in1,float in2){
    buf[6]=vec4(coordinate.x,coordinate.y,0.3948333106474662+in0,0.36+in1);
    buf[7]=vec4(0.14+in2,sqrt(coordinate.x*coordinate.x+coordinate.y*coordinate.y),0.,0.);
    buf[0]=mat4(vec4(6.5404263,-3.6126034,0.7590882,-1.13613),vec4(2.4582713,3.1660357,1.2219609,0.06276096),vec4(-5.478085,-6.159632,1.8701609,-4.7742867),vec4(6.039214,-5.542865,-0.90925294,3.251348))*buf[6]+mat4(vec4(0.8473259,-5.722911,3.975766,1.6522468),vec4(-0.24321538,0.5839259,-1.7661959,-5.350116),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(0.21808943,1.1243913,-1.7969975,5.0294676);
    buf[1]=mat4(vec4(-3.3522482,-6.0612736,0.55641043,-4.4719114),vec4(0.8631464,1.7432913,5.643898,1.6106541),vec4(2.4941394,-3.5012043,1.7184316,6.357333),vec4(3.310376,8.209261,1.1355612,-1.165539))*buf[6]+mat4(vec4(5.24046,-13.034365,0.009859298,15.870829),vec4(2.987511,3.129433,-0.89023495,-1.6822904),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-5.9457836,-6.573602,-0.8812491,1.5436668);
    buf[0]=sigmoid(buf[0]);buf[1]=sigmoid(buf[1]);
    buf[2]=mat4(vec4(-15.219568,8.095543,-2.429353,-1.9381982),vec4(-5.951362,4.3115187,2.6393783,1.274315),vec4(-7.3145227,6.7297835,5.2473326,5.9411426),vec4(5.0796127,8.979051,-1.7278991,-1.158976))*buf[6]+mat4(vec4(-11.967154,-11.608155,6.1486754,11.237008),vec4(2.124141,-6.263192,-1.7050359,-0.7021966),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-4.17164,-3.2281182,-4.576417,-3.6401186);
    buf[3]=mat4(vec4(3.1832156,-13.738922,1.879223,3.233465),vec4(0.64300746,12.768129,1.9141049,0.50990224),vec4(-0.049295485,4.4807224,1.4733979,1.801449),vec4(5.0039253,13.000481,3.3991797,-4.5561905))*buf[6]+mat4(vec4(-0.1285731,7.720628,-3.1425676,4.742367),vec4(0.6393625,3.714393,-0.8108378,-0.39174938),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-1.1811101,-21.621881,0.7851888,1.2329718);
    buf[2]=sigmoid(buf[2]);buf[3]=sigmoid(buf[3]);
    buf[4]=mat4(vec4(5.214916,-7.183024,2.7228765,2.6592617),vec4(-5.601878,-25.3591,4.067988,0.4602802),vec4(-10.57759,24.286327,21.102104,37.546658),vec4(4.3024497,-1.9625226,2.3458803,-1.372816))*buf[0]+mat4(vec4(-17.6526,-10.507558,2.2587414,12.462782),vec4(6.265566,-502.75443,-12.642513,0.9112289),vec4(-10.983244,20.741234,-9.701768,-0.7635988),vec4(5.383626,1.4819539,-4.1911616,-4.8444734))*buf[1]+mat4(vec4(12.785233,-16.345072,-0.39901125,1.7955981),vec4(-30.48365,-1.8345358,1.4542528,-1.1118771),vec4(19.872723,-7.337935,-42.941723,-98.52709),vec4(8.337645,-2.7312303,-2.2927687,-36.142323))*buf[2]+mat4(vec4(-16.298317,3.5471997,-0.44300047,-9.444417),vec4(57.5077,-35.609753,16.163465,-4.1534753),vec4(-0.07470326,-3.8656476,-7.0901804,3.1523974),vec4(-12.559385,-7.077619,1.490437,-0.8211543))*buf[3]+vec4(-7.67914,15.927437,1.3207729,-1.6686112);
    buf[5]=mat4(vec4(-1.4109162,-0.372762,-3.770383,-21.367174),vec4(-6.2103205,-9.35908,0.92529047,8.82561),vec4(11.460242,-22.348068,13.625772,-18.693201),vec4(-0.3429052,-3.9905605,-2.4626114,-0.45033523))*buf[0]+mat4(vec4(7.3481627,-4.3661838,-6.3037653,-3.868115),vec4(1.5462853,6.5488915,1.9701879,-0.58291394),vec4(6.5858274,-2.2180402,3.7127688,-1.3730392),vec4(-5.7973905,10.134961,-2.3395722,-5.965605))*buf[1]+mat4(vec4(-2.5132585,-6.6685553,-1.4029363,-0.16285264),vec4(-0.37908727,0.53738135,4.389061,-1.3024765),vec4(-0.70647055,2.0111287,-5.1659346,-3.728635),vec4(-13.562562,10.487719,-0.9173751,-2.6487076))*buf[2]+mat4(vec4(-8.645013,6.5546675,-6.3944063,-5.5933375),vec4(-0.57783127,-1.077275,36.91025,5.736769),vec4(14.283112,3.7146652,7.1452246,-4.5958776),vec4(2.7192075,3.6021907,-4.366337,-2.3653464))*buf[3]+vec4(-5.9000807,-4.329569,1.2427121,8.59503);
    buf[4]=sigmoid(buf[4]);buf[5]=sigmoid(buf[5]);
    buf[6]=mat4(vec4(-1.61102,0.7970257,1.4675229,0.20917463),vec4(-28.793737,-7.1390953,1.5025433,4.656581),vec4(-10.94861,39.66238,0.74318546,-10.095605),vec4(-0.7229728,-1.5483948,0.7301322,2.1687684))*buf[0]+mat4(vec4(3.2547753,21.489103,-1.0194173,-3.3100595),vec4(-3.7316632,-3.3792162,-7.223193,-0.23685838),vec4(13.1804495,0.7916005,5.338587,5.687114),vec4(-4.167605,-17.798311,-6.815736,-1.6451967))*buf[1]+mat4(vec4(0.604885,-7.800309,-7.213122,-2.741014),vec4(-3.522382,-0.12359311,-0.5258442,0.43852118),vec4(9.6752825,-22.853785,2.062431,0.099892326),vec4(-4.3196306,-17.730087,2.5184598,5.30267))*buf[2]+mat4(vec4(-6.545563,-15.790176,-6.0438633,-5.415399),vec4(-43.591583,28.551912,-16.00161,18.84728),vec4(4.212382,8.394307,3.0958717,8.657522),vec4(-5.0237565,-4.450633,-4.4768,-5.5010443))*buf[3]+mat4(vec4(1.6985557,-67.05806,6.897715,1.9004834),vec4(1.8680354,2.3915145,2.5231109,4.081538),vec4(11.158006,1.7294737,2.0738268,7.386411),vec4(-4.256034,-306.24686,8.258898,-17.132736))*buf[4]+mat4(vec4(1.6889864,-4.5852966,3.8534803,-6.3482175),vec4(1.3543309,-1.2640043,9.932754,2.9079645),vec4(-5.2770967,0.07150358,-0.13962056,3.3269649),vec4(28.34703,-4.918278,6.1044083,4.085355))*buf[5]+vec4(6.6818056,12.522166,-3.7075126,-4.104386);
    buf[7]=mat4(vec4(-8.265602,-4.7027016,5.098234,0.7509808),vec4(8.6507845,-17.15949,16.51939,-8.884479),vec4(-4.036479,-2.3946867,-2.6055532,-1.9866527),vec4(-2.2167742,-1.8135649,-5.9759874,4.8846445))*buf[0]+mat4(vec4(6.7790847,3.5076547,-2.8191125,-2.7028968),vec4(-5.743024,-0.27844876,1.4958696,-5.0517144),vec4(13.122226,15.735168,-2.9397483,-4.101023),vec4(-14.375265,-5.030483,-6.2599335,2.9848232))*buf[1]+mat4(vec4(4.0950394,-0.94011575,-5.674733,4.755022),vec4(4.3809423,4.8310084,1.7425908,-3.437416),vec4(2.117492,0.16342592,-104.56341,16.949184),vec4(-5.22543,-2.994248,3.8350096,-1.9364246))*buf[2]+mat4(vec4(-5.900337,1.7946124,-13.604192,-3.8060522),vec4(6.6583457,31.911177,25.164474,91.81147),vec4(11.840538,4.1503043,-0.7314397,6.768467),vec4(-6.3967767,4.034772,6.1714606,-0.32874924))*buf[3]+mat4(vec4(3.4992442,-196.91893,-8.923708,2.8142626),vec4(3.4806502,-3.1846354,5.1725626,5.1804223),vec4(-2.4009497,15.585794,1.2863957,2.0252278),vec4(-71.25271,-62.441242,-8.138444,0.50670296))*buf[4]+mat4(vec4(-12.291733,-11.176166,-7.3474145,4.390294),vec4(10.805477,5.6337385,-0.9385842,-4.7348723),vec4(-12.869276,-7.039391,5.3029537,7.5436664),vec4(1.4593618,8.91898,3.5101583,5.840625))*buf[5]+vec4(2.2415268,-6.705987,-0.98861027,-2.117676);
    buf[6]=sigmoid(buf[6]);buf[7]=sigmoid(buf[7]);
    buf[0]=mat4(vec4(1.6794263,1.3817469,2.9625452,0.),vec4(-1.8834411,-1.4806935,-3.5924516,0.),vec4(-1.3279216,-1.0918057,-2.3124623,0.),vec4(0.2662234,0.23235129,0.44178495,0.))*buf[0]+mat4(vec4(-0.6299101,-0.5945583,-0.9125601,0.),vec4(0.17828953,0.18300213,0.18182953,0.),vec4(-2.96544,-2.5819945,-4.9001055,0.),vec4(1.4195864,1.1868085,2.5176322,0.))*buf[1]+mat4(vec4(-1.2584374,-1.0552157,-2.1688404,0.),vec4(-0.7200217,-0.52666044,-1.438251,0.),vec4(0.15345335,0.15196142,0.272854,0.),vec4(0.945728,0.8861938,1.2766753,0.))*buf[2]+mat4(vec4(-2.4218085,-1.968602,-4.35166,0.),vec4(-22.683098,-18.0544,-41.954372,0.),vec4(0.63792,0.5470648,1.1078634,0.),vec4(-1.5489894,-1.3075932,-2.6444845,0.))*buf[3]+mat4(vec4(-0.49252132,-0.39877754,-0.91366625,0.),vec4(0.95609266,0.7923952,1.640221,0.),vec4(0.30616966,0.15693925,0.8639857,0.),vec4(1.1825981,0.94504964,2.176963,0.))*buf[4]+mat4(vec4(0.35446745,0.3293795,0.59547555,0.),vec4(-0.58784515,-0.48177817,-1.0614829,0.),vec4(2.5271258,1.9991658,4.6846647,0.),vec4(0.13042648,0.08864098,0.30187556,0.))*buf[5]+mat4(vec4(-1.7718065,-1.4033192,-3.3355875,0.),vec4(3.1664357,2.638297,5.378702,0.),vec4(-3.1724713,-2.6107926,-5.549295,0.),vec4(-2.851368,-2.249092,-5.3013067,0.))*buf[6]+mat4(vec4(1.5203838,1.2212278,2.8404984,0.),vec4(1.5210563,1.2651345,2.683903,0.),vec4(2.9789467,2.4364579,5.2347264,0.),vec4(2.2270417,1.8825914,3.8028636,0.))*buf[7]+vec4(-1.5468478,-3.6171484,0.24762098,0.);
    buf[0]=sigmoid(buf[0]);
    return vec4(buf[0].x,buf[0].y,buf[0].z,1.);
}

void mainImage(out vec4 fragColor,in vec2 fragCoord){
    vec2 uv=fragCoord/uResolution.xy*2.-1.;
    uv.y*=-1.;
    uv+=uWarp*vec2(sin(uv.y*6.283+uTime*0.5),cos(uv.x*6.283+uTime*0.5))*0.05;
    fragColor=cppn_fn(uv,0.1*sin(0.3*uTime),0.1*sin(0.69*uTime),0.1*sin(0.44*uTime));
}

/**
 * Recolours the CPPN field into the active section's palette.
 * Both branches are evaluated and mixed so a section change can cross the
 * night/paper boundary as one continuous morph rather than a cross-fade.
 * Secondary mesh colour is sampled as a soft radial at uTintPos.
 */
vec3 applyTheme(vec3 col,vec2 uv){
    float lum=dot(col,vec3(0.299,0.587,0.114));
    // Night: keep the field's structure, bias its hue toward the section tint.
    vec3 ink=mix(col,uTint*(0.35+lum*1.5),uTintAmount);
    // Paper: subtractive wash so bright field areas read as a faint stain.
    // The colour layer above sits at ~0.8 opacity, so this stays well clear of
    // anything that could compromise text contrast.
    vec3 paper=vec3(1.0)-(vec3(1.0)-uTint)*(0.10+lum*0.45);
    vec3 themed=mix(ink,paper,uLightMix);
    float dist2=dot(uv-uTintPos,uv-uTintPos);
    float radial=exp(-dist2*5.5)*uTintBAmount;
    vec3 wash=mix(uTintB*(0.35+lum*1.5),vec3(1.0)-(vec3(1.0)-uTintB)*(0.10+lum*0.45),uLightMix);
    return mix(themed,wash,radial);
}

void main(){
    vec4 col;mainImage(col,gl_FragCoord.xy);
    col.rgb=hueShiftRGB(col.rgb,uHueShift);
    col.rgb=applyTheme(col.rgb,gl_FragCoord.xy/uResolution.xy);
    float scanline_val=sin(gl_FragCoord.y*uScanFreq)*0.5+0.5;
    col.rgb*=1.-(scanline_val*scanline_val)*uScan;
    col.rgb+=(rand(gl_FragCoord.xy+uTime)-0.5)*uNoise;
    gl_FragColor=vec4(clamp(col.rgb,0.0,1.0),1.0);
}
`;

const fragmentWebgl2 = fragment
  .trimStart()
  .replace(
    '#ifdef GL_ES\nprecision lowp float;\n#endif',
    '#version 300 es\nprecision lowp float;\nout vec4 fragOutput;',
  )
  .replace('gl_FragColor=', 'fragOutput=');

export interface DarkVeilProps {
  hueShift?: number;
  /** Degrees per second of continuous hue drift (lucid mode). */
  hueCycle?: number;
  noiseIntensity?: number;
  scanlineIntensity?: number;
  speed?: number;
  scanlineFrequency?: number;
  warpAmount?: number;
  resolutionScale?: number;
  frameRate?: number;
  dprCap?: number;
  staticFrame?: boolean;
  /**
   * 实测帧耗时窗口上报（设备性能轴动态降档的信号源）：非静态模式下每
   * ~2s 窗口回调一次；`expectedIntervalMs` 由当前 frameRate 预算推导，
   * 消费方以「超出预算间隔」判定，刻意节流（过渡期 30fps）不会误报。
   */
  onFrameWindow?: (stats: FrameWindowStats) => void;
  /** Final motion decision from the caller, including manual overrides. */
  reducedMotion?: boolean;
  /** Section identity colour (hex) the field drifts toward. */
  tint?: string;
  /** 0 keeps the raw CPPN palette, 1 fully adopts `tint`. */
  tintAmount?: number;
  /** 0 = ink-on-night, 1 = ink-on-paper. */
  lightMix?: number;
  /** Seconds for the tint / paper-mix morph to settle. */
  morphSeconds?: number;
  /** Section mesh blobs — primary → uTint, secondary → uTintB/uTintPos. */
  mesh?: readonly SectionMeshBlob[];
}

const DEFAULT_TINT = '#1B3055';

/**
 * Dev-only, once-per-stage diagnostic so the silent `setWebglError` fallback
 * stays debuggable: each failure branch reports which stage broke, at most
 * once per page load, and production output stays untouched.
 */
const warnedStages = new Set<string>();
function reportWebglFailure(stage: string, error?: unknown) {
  if (!import.meta.env.DEV || warnedStages.has(stage)) return;
  warnedStages.add(stage);
  console.warn(`[DarkVeil] WebGL fallback (${stage})`, error ?? '');
}

export default function DarkVeil({
  hueShift = 0,
  hueCycle = 0,
  noiseIntensity = 0,
  scanlineIntensity = 0,
  speed = 1,
  scanlineFrequency = 0,
  warpAmount = 0.4,
  resolutionScale = 0.75,
  frameRate = 60,
  dprCap = 2,
  staticFrame = false,
  onFrameWindow,
  reducedMotion,
  tint = DEFAULT_TINT,
  tintAmount = 0.62,
  lightMix = 0,
  morphSeconds = motionDuration.veilMorph,
  mesh,
}: DarkVeilProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [webglError, setWebglError] = useState(false);
  // Bumped when the device pixel ratio changes so the renderer rebuilds with
  // the new DPR, just like resolutionScale / dprCap changes do.
  const [dprRev, setDprRev] = useState(0);

  // Ambient mesh/noise are always folded into the shader (foldAmbient was a
  // permanent-true prop before being removed).
  const primaryBlob = mesh?.[0];
  const secondaryBlob = mesh?.[1];
  const effectiveTint = primaryBlob?.color ?? tint;
  const effectiveNoise = noiseIntensity > 0 ? noiseIntensity : FOLDED_NOISE;
  const tintBAmount = secondaryBlob
    ? lightMix > 0.5
      ? TINT_B_AMOUNT.light
      : TINT_B_AMOUNT.dark
    : 0;
  // CSS top-left % → WebGL UV (origin bottom-left).
  const tintPosTarget: readonly [number, number] = secondaryBlob
    ? [secondaryBlob.x / 100, 1 - secondaryBlob.y / 100]
    : [0.5, 0.5];

  // Every visual parameter travels through a ref so a section change never
  // recreates the WebGL context — only `resolutionScale` / `dprCap` / DPR do,
  // because they resize the drawing buffer. `breath` 由模块级 breathValue
  // 订阅写入（见下方 effect），不参与 props 传递，避免滚动时逐帧重渲染。
  const liveRef = useRef({
    hueShift,
    hueCycle,
    noiseIntensity: effectiveNoise,
    scanlineIntensity,
    scanlineFrequency,
    warpAmount,
    speed,
    breath: 1,
    frameRate,
    staticFrame,
    tintAmount,
    lightMix,
    morphSeconds,
    tintBAmount,
    reducedMotion: reducedMotion ?? false,
    onFrameWindow,
  });
  Object.assign(liveRef.current, {
    hueShift,
    hueCycle,
    noiseIntensity: effectiveNoise,
    scanlineIntensity,
    scanlineFrequency,
    warpAmount,
    speed,
    frameRate,
    staticFrame,
    tintAmount,
    lightMix,
    morphSeconds,
    tintBAmount,
    reducedMotion: reducedMotion ?? false,
    onFrameWindow,
  });

  // 「墨与光的呼吸」：订阅模块级 breath motion value，rAF 循环期间每帧
  // 写入 liveRef —— 滚动不再触发任何 React 重渲染。订阅前先 seed 当前值：
  // App 的 rAF 循环可能在 lazy chunk 加载完成前就把 breath 衰减到 0.85
  // 基线并休眠，直接订阅会错过基线，渲染循环以 1.0 的 tempo 空跑一帧。
  useEffect(() => {
    liveRef.current.breath = breathValue.get();
    return breathValue.on('change', (next) => {
      liveRef.current.breath = next;
    });
  }, []);

  const targetLabRef = useRef<Oklab>(hexToOklab(effectiveTint));
  targetLabRef.current = hexToOklab(effectiveTint);
  const targetLabBRef = useRef<Oklab>(hexToOklab(secondaryBlob?.color ?? effectiveTint));
  targetLabBRef.current = hexToOklab(secondaryBlob?.color ?? effectiveTint);
  const targetPosRef = useRef<readonly [number, number]>(tintPosTarget);
  targetPosRef.current = tintPosTarget;
  /** Bumped whenever a still frame needs repainting outside the render loop. */
  const repaintRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let frame = 0;
    let renderer: Renderer | null = null;

    try {
      renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio, dprCap),
        canvas,
      });
    } catch (error) {
      reportWebglFailure('renderer-create', error);
      setWebglError(true);
      return;
    }

    const gl = renderer.gl;
    if (!gl) {
      reportWebglFailure('gl-context-missing');
      setWebglError(true);
      return;
    }

    const prefersReducedMotion =
      reducedMotion === undefined && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let program: Program | undefined;
    let geometry: Triangle | undefined;
    let mesh: Mesh | undefined;
    const originalWarn = console.warn;
    try {
      // OGL 1.0.11 treats a browser's `null` shader info log as a warning.
      // Filter only that synchronous false-positive while compiling.
      console.warn = (...args: unknown[]) => {
        const message = args[0];
        if (message === null || (typeof message === 'string' && message.startsWith('null\n')))
          return;
        originalWarn(...args);
      };
      geometry = new Triangle(gl);
      program = new Program(gl, {
        vertex: renderer.isWebgl2 ? vertexWebgl2 : vertex,
        fragment: renderer.isWebgl2 ? fragmentWebgl2 : fragment,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new Vec2() },
          uHueShift: { value: liveRef.current.hueShift },
          uNoise: { value: liveRef.current.noiseIntensity },
          uScan: { value: liveRef.current.scanlineIntensity },
          uScanFreq: { value: liveRef.current.scanlineFrequency },
          uWarp: { value: liveRef.current.warpAmount },
          uTint: { value: [...oklabToRgb01(targetLabRef.current)] },
          uTintAmount: { value: liveRef.current.tintAmount },
          uTintB: { value: [...oklabToRgb01(targetLabBRef.current)] },
          uTintPos: { value: new Vec2(targetPosRef.current[0], targetPosRef.current[1]) },
          uTintBAmount: { value: liveRef.current.tintBAmount },
          uLightMix: { value: liveRef.current.lightMix },
        },
      });
      if (!program.uniformLocations) throw new Error('WebGL shader program failed to link');
      mesh = new Mesh(gl, { geometry, program });
    } catch (error) {
      console.warn = originalWarn;
      reportWebglFailure('program-compile', error);
      try {
        program?.remove();
        geometry?.remove();
      } catch {
        // Objects may already be invalid after a failed shader compile.
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      setWebglError(true);
      return;
    } finally {
      console.warn = originalWarn;
    }

    let dirty = true;
    let lastRender = 0;
    let lastTick = 0;
    // 帧耗时采样器（性能轴动态降档的信号源）：窗口策略在 lib（可单测）；
    // 回调是稳定模块函数 reportFrameWindow，挂载时创建一次即可。
    const sampler = liveRef.current.onFrameWindow
      ? createFrameWindowSampler(liveRef.current.onFrameWindow)
      : null;
    /** Field time, accumulated so speed changes never jump the animation. */
    let fieldTime = 0;
    let hueDrift = 0;
    let currentLab: Oklab = { ...targetLabRef.current };
    let currentLabB: Oklab = { ...targetLabBRef.current };
    let currentPos: [number, number] = [targetPosRef.current[0], targetPosRef.current[1]];
    let currentTintAmount = liveRef.current.tintAmount;
    let currentLightMix = liveRef.current.lightMix;
    let currentTintBAmount = liveRef.current.tintBAmount;

    /**
     * Eases the palette uniforms toward their targets and reports whether
     * anything actually moved, so still frames can skip redundant draws.
     * `deltaSeconds = Infinity` snaps (reduced motion / static frames).
     */
    const applyTheme = (deltaSeconds: number) => {
      if (!program) return false;
      const {
        tintAmount: targetAmount,
        lightMix: targetMix,
        morphSeconds,
        tintBAmount: targetBAmount,
      } = liveRef.current;
      const targetLab = targetLabRef.current;
      const targetLabB = targetLabBRef.current;
      const targetPos = targetPosRef.current;
      const step =
        Number.isFinite(deltaSeconds) && morphSeconds > 0
          ? 1 - Math.exp((-deltaSeconds * 4) / morphSeconds)
          : 1;

      const nextLab = mixOklab(currentLab, targetLab, step);
      const nextLabB = mixOklab(currentLabB, targetLabB, step);
      const nextPos: [number, number] = [
        currentPos[0] + (targetPos[0] - currentPos[0]) * step,
        currentPos[1] + (targetPos[1] - currentPos[1]) * step,
      ];
      const nextAmount = currentTintAmount + (targetAmount - currentTintAmount) * step;
      const nextMix = currentLightMix + (targetMix - currentLightMix) * step;
      const nextBAmount = currentTintBAmount + (targetBAmount - currentTintBAmount) * step;

      const settled =
        Math.abs(nextLab.l - targetLab.l) < 0.0015 &&
        Math.abs(nextLab.a - targetLab.a) < 0.0015 &&
        Math.abs(nextLab.b - targetLab.b) < 0.0015 &&
        Math.abs(nextLabB.l - targetLabB.l) < 0.0015 &&
        Math.abs(nextLabB.a - targetLabB.a) < 0.0015 &&
        Math.abs(nextLabB.b - targetLabB.b) < 0.0015 &&
        Math.abs(nextPos[0] - targetPos[0]) < 0.002 &&
        Math.abs(nextPos[1] - targetPos[1]) < 0.002 &&
        Math.abs(nextAmount - targetAmount) < 0.002 &&
        Math.abs(nextMix - targetMix) < 0.002 &&
        Math.abs(nextBAmount - targetBAmount) < 0.002;

      currentLab = settled ? { ...targetLab } : nextLab;
      currentLabB = settled ? { ...targetLabB } : nextLabB;
      currentPos = settled ? [targetPos[0], targetPos[1]] : nextPos;
      currentTintAmount = settled ? targetAmount : nextAmount;
      currentLightMix = settled ? targetMix : nextMix;
      currentTintBAmount = settled ? targetBAmount : nextBAmount;

      const [r, g, b] = oklabToRgb01(currentLab);
      const [rB, gB, bB] = oklabToRgb01(currentLabB);
      const uTint = program.uniforms.uTint.value as number[];
      const uTintB = program.uniforms.uTintB.value as number[];
      const uTintPos = program.uniforms.uTintPos.value as Vec2;
      const moved =
        Math.abs(uTint[0] - r) > 0.0005 ||
        Math.abs(uTint[1] - g) > 0.0005 ||
        Math.abs(uTint[2] - b) > 0.0005 ||
        Math.abs(uTintB[0] - rB) > 0.0005 ||
        Math.abs(uTintB[1] - gB) > 0.0005 ||
        Math.abs(uTintB[2] - bB) > 0.0005 ||
        Math.abs(uTintPos.x - currentPos[0]) > 0.001 ||
        Math.abs(uTintPos.y - currentPos[1]) > 0.001 ||
        Math.abs((program.uniforms.uTintAmount.value as number) - currentTintAmount) > 0.001 ||
        Math.abs((program.uniforms.uLightMix.value as number) - currentLightMix) > 0.001 ||
        Math.abs((program.uniforms.uTintBAmount.value as number) - currentTintBAmount) > 0.001;

      uTint[0] = r;
      uTint[1] = g;
      uTint[2] = b;
      uTintB[0] = rB;
      uTintB[1] = gB;
      uTintB[2] = bB;
      uTintPos.set(currentPos[0], currentPos[1]);
      program.uniforms.uTintAmount.value = currentTintAmount;
      program.uniforms.uLightMix.value = currentLightMix;
      program.uniforms.uTintBAmount.value = currentTintBAmount;
      return moved;
    };

    const draw = () => {
      if (!program || !mesh || !renderer) return false;
      const live = liveRef.current;
      program.uniforms.uHueShift.value = live.hueShift + hueDrift;
      program.uniforms.uNoise.value = live.noiseIntensity;
      program.uniforms.uScan.value = live.scanlineIntensity;
      program.uniforms.uScanFreq.value = live.scanlineFrequency;
      program.uniforms.uWarp.value = live.warpAmount;
      try {
        renderer!.render({ scene: mesh });
        return true;
      } catch (error) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        reportWebglFailure('render-loop', error);
        setWebglError(true);
        return false;
      }
    };

    const loop = (now: number) => {
      if (!program) return;
      const live = liveRef.current;
      const still = live.staticFrame || live.reducedMotion || prefersReducedMotion;
      const frameInterval = 1000 / Math.max(live.frameRate, 1);

      if (now - lastRender >= frameInterval) {
        const prevRender = lastRender;
        lastRender = now - ((now - lastRender) % frameInterval);
        const deltaSeconds = lastTick ? Math.min((now - lastTick) / 1000, 0.25) : 0;
        lastTick = now;

        const themeMoved = applyTheme(still ? Infinity : deltaSeconds);
        if (still) {
          // Freeze the field, but a palette change must still reach the screen.
          program.uniforms.uTime.value = 0;
          if (!themeMoved && !dirty) {
            // Frozen and settled: park the loop until something wakes it.
            frame = 0;
            return;
          }
        } else {
          fieldTime += deltaSeconds * live.speed * live.breath;
          hueDrift = (hueDrift + deltaSeconds * live.hueCycle) % 360;
          program.uniforms.uTime.value = fieldTime;
        }

        dirty = false;
        if (!draw()) return;

        // 帧耗时采样：仅非静态模式。document.hidden 时循环已暂停，天然
        // 不采样；staticFrame / reduced 下 field 静止无实测意义（reduced
        // 为终态，性能轴不触碰）。消费方以「超出预算间隔」判定，过渡期
        // 30fps 节流 excess ≈ 0。
        if (!still && sampler) {
          sampler.record(now - prevRender, frameInterval);
        }
      }

      frame = requestAnimationFrame(loop);
    };

    /** Marks the canvas stale and restarts the loop if it has parked. */
    const wake = () => {
      dirty = true;
      lastTick = 0;
      if (!frame && !document.hidden) frame = requestAnimationFrame(loop);
    };

    const resize = () => {
      if (!program) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w === 0 || h === 0) return;
      // ogl's setSize writes both the drawing buffer and inline canvas style.
      // With resolutionScale < 1 the inline style would shrink the canvas to a
      // fraction of the parent (clipping it to the top-left), so we override the
      // style back to 100% afterwards and feed the actual buffer size to the
      // shader so UV mapping stays correct.
      renderer!.setSize(w * resolutionScale, h * resolutionScale);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      program.uniforms.uResolution.value.set(gl.drawingBufferWidth, gl.drawingBufferHeight);
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);
    resize();

    applyTheme(Infinity);
    draw();
    repaintRef.current = wake;
    frame = requestAnimationFrame(loop);

    const handleVisibility = () => {
      if (document.hidden) {
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      } else {
        lastRender = 0;
        wake();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      // webglError 变化不会触发本 effect 的 cleanup（依赖只有缓冲相关 prop），
      // 这里同步拆掉所有挂载物，避免 canvas 移除后监听与 rAF 仍存活。
      repaintRef.current = null;
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      dprQuery.removeEventListener?.('change', handleDprChange);
      reportWebglFailure('context-lost');
      setWebglError(true);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);

    const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const handleDprChange = () => setDprRev((n) => n + 1);
    dprQuery.addEventListener?.('change', handleDprChange);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      repaintRef.current = null;
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      dprQuery.removeEventListener?.('change', handleDprChange);
      // Explicitly tear down OGL objects before asking the browser to discard
      // the context; loseContext is kept as a last-resort fallback.
      try {
        program?.remove();
        geometry?.remove();
      } catch {
        // Objects may already be invalid if the context was lost.
      }
      program = undefined;
      mesh = undefined;
      geometry = undefined;
      const loseCtx = gl.getExtension('WEBGL_lose_context');
      loseCtx?.loseContext();
    };
    // Only buffer-shaping props belong here; the rest are read from `liveRef`
    // inside the loop so the GL context survives every section change.
  }, [dprCap, dprRev, resolutionScale]);

  // The loop parks itself once a frozen frame has settled, so it cannot notice
  // prop changes on its own. Waking on every commit keeps that correct without
  // having to enumerate every visual prop; it is a no-op while the loop runs.
  useEffect(() => {
    repaintRef.current?.();
  });

  if (webglError) {
    return <div className="darkveil-fallback" data-paper={lightMix > 0.5 ? '' : undefined} />;
  }
  return <canvas ref={ref} className="darkveil-canvas" />;
}

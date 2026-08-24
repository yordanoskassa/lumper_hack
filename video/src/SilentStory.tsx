import React from "react";
import {loadFont as loadInter} from "@remotion/google-fonts/Inter";
import {loadFont as loadGeistMono} from "@remotion/google-fonts/GeistMono";
import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {C} from "./design";

const {fontFamily: INTER} = loadInter("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
const {fontFamily: GEIST_MONO} = loadGeistMono("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const FPS = 30;
const sec = (n: number) => Math.round(n * FPS);
const clamp = {extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const};
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const TIMELINE = [
  {from: 0, duration: 8, component: ColdOpen},
  {from: 8, duration: 12, component: Pressure},
  {from: 20, duration: 12, component: BackOffice},
  {from: 32, duration: 20, component: Fraud},
  {from: 52, duration: 12, component: Detention},
  {from: 64, duration: 8, component: Impact},
  {from: 72, duration: 10, component: FourAgents},
  {from: 82, duration: 20, component: Product},
  {from: 102, duration: 8, component: Close},
] as const;

const appear = (frame: number, start = 0, duration = 18) => ({
  opacity: interpolate(frame, [start, start + duration], [0, 1], {...clamp, easing: ease}),
  translate: `0 ${interpolate(frame, [start, start + duration], [24, 0], {...clamp, easing: ease})}px`,
});

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

const WordReveal = ({
  text,
  start = 0,
  step = 10,
  fontSize = 72,
  color,
  accent = [],
  align = "left",
  lineHeight = 1.05,
  fontWeight = 700,
  letterSpacing = "-.052em",
}: {
  text: string;
  start?: number;
  step?: number;
  fontSize?: number;
  color?: string;
  accent?: string[];
  align?: "left" | "center";
  lineHeight?: number;
  fontWeight?: number;
  letterSpacing?: string;
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{fontSize, fontWeight, letterSpacing, lineHeight, color, textAlign: align}}>
      {text.split(" ").map((word, index) => {
        const at = start + index * step;
        const clean = word.replace(/[^A-Za-z0-9−$]/g, "").toLowerCase();
        const mode = index % 3;
        return (
          <span
            key={`${word}-${index}`}
            style={{
              display: "inline-block",
              marginRight: "0.23em",
              color: accent.includes(clean) ? C.orange : undefined,
              opacity: interpolate(frame, [at, at + 22], [0, 1], {...clamp, easing: ease}),
              filter: `blur(${interpolate(frame, [at, at + 24], [mode === 1 ? 13 : 8, 0], {...clamp, easing: ease})}px)`,
              translate: `${interpolate(frame, [at, at + 24], [mode === 2 ? 24 : mode === 1 ? -16 : 0, 0], {...clamp, easing: ease})}px ${interpolate(frame, [at, at + 24], [mode === 0 ? 30 : 12, 0], {...clamp, easing: ease})}px`,
              scale: interpolate(frame, [at, at + 24], [mode === 1 ? 1.08 : 0.96, 1], {...clamp, easing: ease}),
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

const SceneFade = ({children, duration, noFadeIn = false}: {children: React.ReactNode; duration: number; noFadeIn?: boolean}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: noFadeIn
          ? interpolate(frame, [duration - 15, duration], [1, 0], {...clamp, easing: ease})
          : interpolate(frame, [0, 13, duration - 15, duration], [0, 1, 1, 0], {...clamp, easing: ease}),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Logo = ({size = 58}: {size?: number}) => (
  <Img
    src={staticFile("icon.svg")}
    style={{width: size, height: size, borderRadius: size * 0.22, boxShadow: "0 8px 24px rgba(0,0,0,.16)"}}
  />
);

const AppBrand = ({light = false}: {light?: boolean}) => (
  <div style={{display: "flex", alignItems: "center", gap: 17, color: light ? C.paper : C.ink}}>
    <Logo />
    <div>
      <div style={{fontFamily: INTER, fontSize: 28, fontWeight: 600, letterSpacing: "-.025em"}}>Sentinel</div>
      <div style={{fontFamily: INTER, fontSize: 17, color: light ? "#A8A8A4" : C.muted, marginTop: 2}}>Autonomous freight desk</div>
    </div>
  </div>
);

const Grain = ({dark = false}: {dark?: boolean}) => (
  <AbsoluteFill style={{pointerEvents: "none", opacity: dark ? 0.045 : 0.018, mixBlendMode: dark ? "screen" : "multiply", backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.75'/%3E%3C/svg%3E\")"}} />
);

const Shell = ({children, dark = false}: {children: React.ReactNode; dark?: boolean}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: dark ? C.dark : C.paper, color: dark ? C.paper : C.ink, fontFamily: INTER}}>
      <div
        style={{
          position: "absolute",
          width: 920,
          height: 920,
          borderRadius: 999,
          left: -320,
          top: -410,
          background: dark ? "rgba(234,88,12,.08)" : "rgba(234,88,12,.035)",
          filter: "blur(90px)",
          translate: `${interpolate(frame, [0, 600], [-70, 190], clamp)}px ${interpolate(frame, [0, 600], [20, 100], clamp)}px`,
          scale: interpolate(frame, [0, 300, 600], [0.94, 1.06, 0.98], clamp),
        }}
      />
      {children}
      <Grain dark={dark} />
    </AbsoluteFill>
  );
};

const TopBrand = ({dark = false}: {dark?: boolean}) => (
  <div style={{position: "absolute", left: 104, top: 72, zIndex: 10}}><AppBrand light={dark} /></div>
);

const Victor = ({large = false}: {large?: boolean}) => (
  <svg width={large ? 520 : 170} height={large ? 570 : 185} viewBox="0 0 520 570">
    <circle cx="260" cy="182" r="104" fill="#9B6849" />
    <path d="M150 165 C160 22 365 15 378 166 C315 95 214 90 150 165 Z" fill="#141416" />
    <path d="M46 570 C52 365 458 360 474 570 Z" fill="#242428" />
  </svg>
);

const VictorLineArt = () => {
  const frame = useCurrentFrame();
  const paths = [
    "M260 72 C186 72 143 127 149 205 C154 279 199 329 260 329 C321 329 366 279 371 205 C377 127 334 72 260 72 Z",
    "M150 190 C159 59 358 45 371 190 C320 129 207 122 150 190 Z",
    "M216 329 L205 375 M304 329 L315 375",
    "M58 585 C70 419 169 363 260 363 C351 363 450 419 462 585",
    "M130 585 L154 458 M390 585 L366 458",
  ];
  return (
    <svg width="520" height="610" viewBox="0 0 520 610" style={{overflow: "visible"}}>
      <circle
        cx="260"
        cy="203"
        r="132"
        fill="#F8EFE8"
        opacity={interpolate(frame, [72, 145], [0, 0.7], clamp)}
        style={{transformOrigin: "260px 203px", scale: interpolate(frame, [72, 145], [0.9, 1], clamp)}}
      />
      {paths.map((path, index) => (
        <path
          key={path}
          d={path}
          fill="none"
          stroke={index === 1 ? C.orange : "#494947"}
          strokeWidth={index === 1 ? 3 : 2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="900"
          strokeDashoffset={interpolate(frame, [35 + index * 10, 118 + index * 10], [900, 0], {...clamp, easing: ease})}
          opacity={interpolate(frame, [30 + index * 9, 54 + index * 9], [0, 1], clamp)}
        />
      ))}
      <circle cx="221" cy="215" r="3.5" fill="#494947" opacity={interpolate(frame, [108, 136], [0, 1], clamp)} />
      <circle cx="299" cy="215" r="3.5" fill="#494947" opacity={interpolate(frame, [114, 142], [0, 1], clamp)} />
      <path d="M232 268 C248 278 274 278 290 268" fill="none" stroke="#494947" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="90" strokeDashoffset={interpolate(frame, [122, 154], [90, 0], clamp)} />
    </svg>
  );
};

function ColdOpen() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: C.white, color: C.ink, fontFamily: INTER}}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 42,
          translate: "-50% 0",
          opacity: interpolate(frame, [28, 48], [0, 1], clamp),
        }}
      >
        <VictorLineArt />
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 605,
          translate: "-50% 0",
          width: 700,
          textAlign: "center",
          opacity: interpolate(frame, [104, 142], [0, 1], {...clamp, easing: ease}),
        }}
      >
        <div style={{fontSize: 28, fontWeight: 400, letterSpacing: ".02em"}}>Victor Amaya</div>
        <div style={{fontSize: 19, fontWeight: 400, color: C.muted, marginTop: 8}}>owner-operator · one truck</div>
      </div>
      <div style={{position: "absolute", left: 260, right: 260, top: 760}}>
        <WordReveal
          text="His driving shift ended. The business did not."
          start={110}
          step={13}
          fontSize={56}
          fontWeight={400}
          letterSpacing="-.025em"
          lineHeight={1.18}
          align="center"
          accent={["business", "not"]}
        />
      </div>
    </AbsoluteFill>
  );
}

function Pressure() {
  const frame = useCurrentFrame();
  const rows = [["Mortgage", "$2,640"], ["Truck note", "$2,180"], ["Insurance", "$1,180"], ["Home costs", "$520"]];
  const total = money(interpolate(frame, [70, 250], [0, 6520], clamp));
  return (
    <Shell>
      <TopBrand />
      <div style={{position: "absolute", left: 105, top: 205, width: 720, ...appear(frame, 4)}}>
        <div style={{fontFamily: GEIST_MONO, fontSize: 25, color: C.orange, letterSpacing: ".04em", ...appear(frame, 2, 20)}}>THIS IS VICTOR</div>
        <div style={{marginTop: 20}}><WordReveal text="One truck. One new home. No room for a bad month." start={8} step={11} fontSize={83} accent={["no", "room", "bad", "month"]} /></div>
        <div style={{display: "flex", alignItems: "center", gap: 22, marginTop: 40, opacity: interpolate(frame, [112, 142], [0, 1], clamp), translate: `0 ${interpolate(frame, [112, 142], [18, 0], clamp)}px`}}>
          <div style={{width: 112, height: 112, borderRadius: 999, background: "#F4E5D8", overflow: "hidden", display: "grid", placeItems: "center", scale: interpolate(frame, [112, 142], [.82, 1], {...clamp, easing: ease})}}><Victor /></div>
          <div><div style={{fontSize: 35, fontWeight: 650}}>Victor Amaya</div><div style={{fontSize: 24, color: C.sub, marginTop: 6}}>Owner-operator · first year</div></div>
        </div>
      </div>
      <div style={{position: "absolute", right: 105, top: 188, width: 800, background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 70px rgba(10,10,10,.07)", ...appear(frame, 16)}}>
        <div style={{padding: "29px 38px", borderBottom: `1px solid ${C.hair}`, fontFamily: GEIST_MONO, color: C.orange, fontSize: 23}}>EVERY MONTH · BEFORE DIESEL</div>
        <div style={{padding: "11px 38px 8px"}}>{rows.map(([k,v],i) => <div key={k} style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 0", borderBottom: `1px solid ${C.hair}`, opacity: interpolate(frame,[22+i*14,40+i*14],[0,1],clamp), translate: `${interpolate(frame,[22+i*14,40+i*14],[36,0],clamp)}px 0`}}><span style={{fontSize: 30, color: C.body}}>{k}</span><span style={{fontFamily: GEIST_MONO, fontSize: 36, fontWeight: 600}}>{v}</span></div>)}</div>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "27px 38px 33px", background: C.orangeTint, boxShadow: `inset ${interpolate(frame, [72, 240], [0, 800], clamp)}px 0 rgba(234,88,12,.055)`}}><span style={{fontSize: 27, fontWeight: 650, color: C.orangeDark}}>FIXED</span><span style={{fontFamily: GEIST_MONO, fontSize: 68, color: C.orange, fontWeight: 700}}>{total}</span></div>
      </div>
    </Shell>
  );
}

function BackOffice() {
  const frame = useCurrentFrame();
  const rows = [["Dispatcher · 10%", "$1,760"], ["Factoring · 3%", "$530"], ["Compliance + billing", "$550"]];
  return (
    <Shell>
      <TopBrand />
      <div style={{position: "absolute", left: 115, right: 115, top: 215, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 95, alignItems: "center"}}>
        <div style={{...appear(frame, 3)}}><div style={{fontFamily: GEIST_MONO, fontSize: 25, color: C.muted}}>YEAR ONE</div><div style={{marginTop: 18}}><WordReveal text="He paid for a back office." start={8} step={13} fontSize={80} /></div><div style={{fontSize: 34, color: C.body, lineHeight: 1.45, marginTop: 30}}>{["Find the loads.","Check the brokers.","Chase the money."].map((line,i)=><div key={line} style={{opacity:interpolate(frame,[82+i*18,103+i*18],[0,1],clamp),translate:`${interpolate(frame,[82+i*18,103+i*18],[-22,0],clamp)}px 0`}}>{line}</div>)}</div></div>
        <div style={{position: "relative", background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, padding: "23px 38px 31px", boxShadow: "0 24px 70px rgba(10,10,10,.07)", ...appear(frame, 15)}}>
          {rows.map(([k,v],i) => <div key={k} style={{display: "flex", justifyContent: "space-between", padding: "23px 0", borderBottom: `1px solid ${C.hair}`, opacity:interpolate(frame,[35+i*18,55+i*18],[0,1],clamp),translate:`${interpolate(frame,[35+i*18,55+i*18],[30,0],clamp)}px 0`}}><span style={{fontSize: 29, color: C.body}}>{k}</span><b style={{fontFamily: GEIST_MONO, fontSize: 32}}>{v}</b></div>)}
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 28}}><span style={{fontSize: 26, fontWeight: 650}}>PER MONTH</span><b style={{fontFamily: GEIST_MONO, fontSize: 61, color: C.orange}}>$2,840</b></div>
          <div style={{position: "absolute", inset: 25, display: "grid", placeItems: "center", opacity: interpolate(frame,[180,218],[0,1],clamp)}}><div style={{padding: "16px 25px", border: `6px solid ${C.red}`, color: C.red, fontFamily: GEIST_MONO, fontSize: 35, fontWeight: 700, rotate: `${interpolate(frame,[180,218],[-18,-7],clamp)}deg`, scale:interpolate(frame,[180,205,225],[1.28,.96,1],clamp), background: "rgba(255,255,255,.92)"}}>MONTH 9 · CANCELLED</div></div>
        </div>
      </div>
      <div style={{position: "absolute", left: 115, right: 115, bottom: 88}}><WordReveal text="The work did not disappear. It moved into the cab." start={226} step={7} fontSize={51} align="center" accent={["moved", "cab"]} /></div>
    </Shell>
  );
}

function Fraud() {
  const frame = useCurrentFrame();
  const phase = frame < sec(6) ? 0 : frame < sec(12) ? 1 : frame < sec(16) ? 2 : 3;
  const phaseStart = [0, sec(6), sec(12), sec(16)][phase];
  const phaseFrame = frame - phaseStart;
  return (
    <Shell>
      <TopBrand />
      <div style={{position: "absolute", right: 105, top: 85, fontFamily: GEIST_MONO, fontSize: 23, color: C.muted}}>MARCH · TOLEDO → CHARLOTTE</div>
      {phase === 0 && <div style={{position: "absolute", left: 120, right: 120, top: 210, bottom: 110, display: "grid", gridTemplateColumns: "1fr .9fr", gap: 85, alignItems: "center"}}>
        <div><WordReveal text="The load looked clean." start={4} step={14} fontSize={80} accent={["clean"]} /><div style={{fontFamily: GEIST_MONO, fontSize: 43, marginTop: 40, ...appear(frame, 55, 24)}}>540 MI · $1,450</div><div style={{fontSize: 29, color: C.sub, marginTop: 15}}>{["Delivered.","Signed.","Invoiced."].map((word,i)=><span key={word} style={{display:"inline-block",marginRight:12,opacity:interpolate(frame,[82+i*15,99+i*15],[0,1],clamp),translate:`0 ${interpolate(frame,[82+i*15,99+i*15],[15,0],clamp)}px`}}>{word}</span>)}</div></div>
        <div style={{background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 70px rgba(10,10,10,.08)", opacity:interpolate(frame,[18,42],[0,1],clamp),translate:`${interpolate(frame,[18,42],[60,0],clamp)}px 0`,scale:interpolate(frame,[18,42],[.97,1],clamp)}}><div style={{padding: "29px 34px", borderBottom: `1px solid ${C.hair}`, display: "flex", justifyContent: "space-between"}}><span style={{fontFamily: GEIST_MONO, color: C.muted, fontSize: 23}}>LOAD P-90388</span><span style={{background: C.greenTint, color: C.green, borderRadius: 8, padding: "8px 12px", fontSize: 21, boxShadow:`0 0 ${interpolate(frame,[35,95],[0,24],clamp)}px rgba(22,163,74,.25)`}}>MC VERIFIED ✓</span></div><div style={{padding: 34}}>{[["Authority","ACTIVE"],["Insurance","ON FILE"],["Operating since","2011"],["Rate con","9 MIN"]].map(([k,v],i) => <div key={k} style={{display: "flex", justifyContent: "space-between", padding: "17px 0", borderBottom: `1px solid ${C.hair}`, fontSize: 27,opacity:interpolate(frame,[45+i*12,61+i*12],[0,1],clamp),translate:`${interpolate(frame,[45+i*12,61+i*12],[22,0],clamp)}px 0`}}><span style={{color: C.sub}}>{k}</span><b style={{fontFamily: GEIST_MONO}}>{v}</b></div>)}</div></div>
      </div>}
      {phase === 1 && <div style={{position: "absolute", inset: "220px 150px 145px", display: "flex", alignItems: "center", justifyContent: "center", gap: 45}}>{[["DAY 0","INVOICED"],["DAY 30","NOTHING"],["DAY 60","UNPAID"]].map(([d,s],i)=><React.Fragment key={d}><div style={{width: 380, height: 300, borderRadius: 19, border: `1px solid ${i===2?"#FECACA":C.border}`, background: i===2?C.redTint:C.white, display: "grid", placeItems: "center", textAlign: "center", opacity: interpolate(phaseFrame,[i*24,i*24+18],[0,1],clamp), translate:`0 ${interpolate(phaseFrame,[i*24,i*24+18],[45,0],clamp)}px`,scale:interpolate(phaseFrame,[i*24,i*24+18],[.93,1],clamp),boxShadow:i===2?`0 0 ${interpolate(phaseFrame,[48,110],[0,45],clamp)}px rgba(220,38,38,.16)`:"0 16px 45px rgba(10,10,10,.05)"}}><div><div style={{fontFamily: GEIST_MONO, color: i===2?C.red:C.muted, fontSize: 25}}>{d}</div><div style={{fontSize: 50, fontWeight: 700, color: i===2?C.red:C.ink, marginTop: 22}}>{s}</div>{i===2&&<div style={{fontFamily:GEIST_MONO,color:C.red,fontSize:21,marginTop:18,opacity:interpolate(phaseFrame,[68,92],[0,1],clamp)}}>PHONE DISCONNECTED</div>}</div></div>{i<2&&<div style={{fontSize:48,color:C.border,translate:`${interpolate(phaseFrame,[i*24+16,i*24+42],[-15,8],clamp)}px 0`,opacity:interpolate(phaseFrame,[i*24+15,i*24+32],[0,1],clamp)}}>→</div>}</React.Fragment>)}</div>}
      {phase === 2 && <div style={{position: "absolute", inset: 0, display: "grid", placeItems: "center"}}><div style={{textAlign: "center"}}><div style={{fontFamily: GEIST_MONO, fontSize: 28, color: C.red, letterSpacing:".04em",...appear(phaseFrame,2)}}>DOUBLE BROKERED</div><div style={{fontFamily: GEIST_MONO, fontSize: 210, fontWeight: 700, color: C.red, letterSpacing: "-.09em", lineHeight: .95, marginTop: 18,opacity:interpolate(phaseFrame,[8,28],[0,1],clamp),scale:interpolate(phaseFrame,[8,42],[1.22,1],{...clamp,easing:ease}),filter:`blur(${interpolate(phaseFrame,[8,30],[12,0],clamp)}px)`}}>−{money(interpolate(phaseFrame,[8,70],[0,4000],clamp))}</div><div style={{marginTop:34}}><WordReveal text="He hauled the freight. Someone else took the money." start={sec(12)+42} step={6} fontSize={35} align="center" accent={["else", "money"]}/></div></div></div>}
      {phase === 3 && <div style={{position: "absolute", left: 220, right: 220, top: 230, bottom: 130, display: "grid", gridTemplateColumns: ".8fr 1.2fr", gap: 80, alignItems: "center"}}><div><WordReveal text="The tell was one phone call away." start={sec(16)+3} step={10} fontSize={74} accent={["away"]}/></div><div style={{background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, padding: 38, boxShadow: "0 24px 70px rgba(10,10,10,.08)",opacity:interpolate(phaseFrame,[10,32],[0,1],clamp),translate:`${interpolate(phaseFrame,[10,32],[55,0],clamp)}px 0`}}>{[["MC authority","REAL ✓",C.green],["Callback number","STRANGER ✕",C.red]].map(([k,v,tone],i)=><div key={k} style={{display: "flex", justifyContent: "space-between", padding: "23px 0", borderBottom:i===0?`1px solid ${C.hair}`:"none", fontSize: 32,opacity:interpolate(phaseFrame,[28+i*35,48+i*35],[0,1],clamp),translate:`${interpolate(phaseFrame,[28+i*35,48+i*35],[28,0],clamp)}px 0`}}><span>{k}</span><b style={{fontFamily: GEIST_MONO, color:tone}}>{v}</b></div>)}</div></div>}
    </Shell>
  );
}

function Detention() {
  const frame = useCurrentFrame();
  const clock = interpolate(frame,[20,220],[6.67,13.25],clamp); const h=Math.floor(clock); const m=Math.round((clock-h)*60);
  const owed = Math.round(interpolate(frame,[80,230],[0,292],clamp));
  return <Shell dark><div style={{position:"absolute",inset:0,background:"linear-gradient(120deg,#171719,#2A292C)"}}/><TopBrand dark/><div style={{position:"absolute",right:105,top:85,fontFamily:GEIST_MONO,fontSize:23,color:C.muted}}>MAY · LAREDO</div><div style={{position:"absolute",left:115,right:115,top:230,bottom:135,display:"grid",gridTemplateColumns:"1fr .86fr",gap:90,alignItems:"center"}}><div style={{opacity:interpolate(frame,[4,28],[0,1],clamp),translate:`${interpolate(frame,[4,28],[-45,0],clamp)}px 0`}}><div style={{fontFamily:GEIST_MONO,fontSize:138,fontWeight:600,letterSpacing:"-.08em",textShadow:`0 0 ${interpolate(frame,[20,220],[0,32],clamp)}px rgba(249,115,22,.18)`}}>{String(h).padStart(2,"0")}:{String(m).padStart(2,"0")}</div><div style={{fontSize:33,color:"#C2C2BE",marginTop:15}}>Arrived 06:40 · Loaded 13:15</div><div style={{height:14,borderRadius:10,background:C.raised,overflow:"hidden",marginTop:50}}><div style={{width:`${interpolate(frame,[20,220],[0,100],clamp)}%`,height:"100%",background:C.orange,boxShadow:"0 0 22px rgba(249,115,22,.55)"}}/></div><div style={{display:"flex",justifyContent:"space-between",fontFamily:GEIST_MONO,fontSize:21,color:C.muted,marginTop:13}}><span>2 HOURS FREE</span><span>4.5 HOURS OWED</span></div></div><div style={{background:C.raised,border:"1px solid rgba(255,255,255,.1)",borderRadius:20,padding:38,opacity:interpolate(frame,[35,62],[0,1],clamp),translate:`${interpolate(frame,[35,62],[55,0],clamp)}px 0`}}><div style={{fontFamily:GEIST_MONO,fontSize:24,color:C.muted}}>DETENTION · $65 / HR</div><div style={{fontFamily:GEIST_MONO,fontSize:112,fontWeight:700,color:C.orange,marginTop:18}}>${owed}</div><div style={{padding:22,borderRadius:11,background:"rgba(220,38,38,.14)",border:"1px solid rgba(248,113,113,.35)",color:"#FCA5A5",fontFamily:GEIST_MONO,fontSize:27,fontWeight:600,marginTop:24,opacity:interpolate(frame,[240,275],[0,1],clamp),scale:interpolate(frame,[240,265,285],[1.14,.97,1],clamp),rotate:`${interpolate(frame,[240,285],[-5,0],clamp)}deg`}}>CLAIM DENIED<br/><span style={{fontSize:20,fontWeight:400}}>NO PROOF OF ARRIVAL</span></div></div></div></Shell>;
}

function Impact() {
  const frame=useCurrentFrame();
  return <Shell dark><div style={{position:"absolute",inset:0,display:"grid",placeItems:"center"}}><div style={{textAlign:"center"}}><div style={{fontFamily:GEIST_MONO,fontSize:142,fontWeight:700,letterSpacing:"-.08em",color:C.red,opacity:interpolate(frame,[18,54],[0,1],clamp),scale:interpolate(frame,[18,58],[1.2,1],{...clamp,easing:ease}),filter:`blur(${interpolate(frame,[18,50],[16,0],clamp)}px)`}}>−{money(interpolate(frame,[18,95],[0,4292],clamp))}</div><div style={{marginTop:35}}><WordReveal text="The mortgage was still due." start={72} step={16} fontSize={67} align="center" accent={["mortgage", "due"]}/></div><div style={{fontFamily:GEIST_MONO,fontSize:24,color:C.muted,marginTop:30,letterSpacing:".08em",opacity:interpolate(frame,[155,190],[0,1],clamp)}}>THE DAMAGE COMPOUNDS</div></div></div></Shell>;
}

const AGENTS=[["01","FINDER","Find the margin"],["02","VERIFIER","Prove the broker"],["03","CLOSER","Lock the terms"],["04","PAYDAY","Document the money"]];

function FourAgents(){const frame=useCurrentFrame();return <Shell><TopBrand/><div style={{position:"absolute",left:105,right:105,top:205}}><div style={{display:"flex",justifyContent:"center"}}><WordReveal text="Four fights. Four agents." start={2} step={16} fontSize={76} align="center" accent={["agents"]}/></div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:20,marginTop:70}}>{AGENTS.map(([n,name,job],i)=><div key={name} style={{height:375,borderRadius:18,background:C.white,border:`1px solid ${C.border}`,padding:28,boxShadow:`0 16px ${48+interpolate(frame,[80+i*12,150+i*12],[0,28],clamp)}px rgba(10,10,10,.07)`,opacity:interpolate(frame,[36+i*18,60+i*18],[0,1],clamp),translate:`0 ${interpolate(frame,[36+i*18,60+i*18],[55,0],clamp)}px`,scale:interpolate(frame,[36+i*18,60+i*18],[.93,1],{...clamp,easing:ease}),rotate:`${interpolate(frame,[36+i*18,60+i*18],[i%2===0?-2:2,0],clamp)}deg`}}><div style={{width:62,height:62,borderRadius:14,display:"grid",placeItems:"center",background:C.dark,color:C.paper,fontFamily:GEIST_MONO,fontSize:22,scale:interpolate(frame,[62+i*18,88+i*18],[.7,1],clamp)}}>{n}</div><div style={{fontSize:38,fontWeight:700,marginTop:53,opacity:interpolate(frame,[78+i*18,98+i*18],[0,1],clamp)}}>{name}</div><div style={{fontSize:25,color:C.sub,marginTop:16,opacity:interpolate(frame,[92+i*18,112+i*18],[0,1],clamp)}}>{job}</div><div style={{height:5,borderRadius:5,background:C.orange,marginTop:70,width:`${interpolate(frame,[112+i*16,158+i*16],[0,100],clamp)}%`,boxShadow:"0 0 18px rgba(234,88,12,.35)"}}/></div>)}</div></div></Shell>}

function AgentTabs({active}:{active:number}){return <div style={{display:"flex",gap:8}}>{AGENTS.map(([n,name],i)=><div key={name} style={{display:"flex",gap:9,alignItems:"center",padding:"10px 14px",borderRadius:8,border:`1px solid ${i===active?"#FED7AA":C.border}`,background:i===active?C.orangeTint:C.paper,color:i===active?C.orangeDark:C.muted}}><span style={{fontFamily:GEIST_MONO,fontSize:16}}>{n}</span><b style={{fontSize:17}}>{name}</b></div>)}</div>}

function Product(){const frame=useCurrentFrame();const active=Math.min(3,Math.floor(frame/sec(5)));const local=frame-active*sec(5);const steps=[
  {title:"Finder proves the margin",big:"$2.34 / MI",tone:C.orange,rows:[["Route miles","540 LIVE"],["Regional diesel","$3.71 / GAL"],["True floor","$2.08 / MI"]]},
  {title:"Verifier catches the tell",big:"REFUSE",tone:C.red,rows:[["FMCSA authority","PASS"],["Registered callback","FAIL"],["Bank memory","MATCH"]]},
  {title:"Closer locks the deal",big:"RATE LOCKED",tone:C.green,rows:[["Lane anchor","$1,620"],["Follow-up","2H → 6H → 18H"],["Driver approval","VOICE"]]},
  {title:"Payday makes proof",big:"$292 FILED",tone:C.orange,rows:[["GPS arrival","06:40"],["Free time ended","09:00"],["Evidence","GPS IN / OUT"]]},
];const s=steps[active];return <Shell><div style={{position:"absolute",left:60,right:60,top:54,bottom:54,border:`1px solid ${C.border}`,borderRadius:21,overflow:"hidden",background:C.white,boxShadow:"0 28px 90px rgba(10,10,10,.08)",opacity:interpolate(frame,[0,20],[0,1],clamp),scale:interpolate(frame,[0,24],[.985,1],clamp)}}><div style={{height:94,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 28px"}}><AppBrand/><AgentTabs active={active}/><div style={{fontFamily:GEIST_MONO,fontSize:17,color:C.green,opacity:interpolate(frame,[0,20,40],[.35,1,.35],clamp)}}>● LIVE RUN</div></div><div style={{display:"grid",gridTemplateColumns:"300px 1fr 490px",height:"calc(100% - 94px)"}}><div style={{background:C.paper,borderRight:`1px solid ${C.border}`,padding:24}}><div style={{fontFamily:GEIST_MONO,fontSize:17,color:C.muted}}>YARD BOSS</div><div style={{marginTop:23,background:C.dark,color:C.paper,borderRadius:11,padding:19,fontSize:21,lineHeight:1.42,opacity:interpolate(frame,[10,36],[0,1],clamp),translate:`0 ${interpolate(frame,[10,36],[24,0],clamp)}px`}}>Protect the rate.<br/>Protect the truck.<br/>Get me paid.</div><div style={{fontSize:19,color:C.sub,lineHeight:1.58,marginTop:25,opacity:interpolate(frame,[26,52],[0,1],clamp)}}>Truck 12 · Toledo<br/>8h 24m HOS left<br/>Empty in 2h 06m</div></div><div style={{padding:"43px 48px",position:"relative"}}><div style={{position:"absolute",left:0,top:0,bottom:0,width:7,background:s.tone,scale:`1 ${interpolate(local,[0,28],[0,1],clamp)}`,transformOrigin:"top"}}/><div style={{fontFamily:GEIST_MONO,fontSize:20,color:s.tone,opacity:interpolate(local,[0,15],[0,1],clamp)}}>AGENT {active+1} / 4</div><div style={{marginTop:13}}><WordReveal text={s.title} start={active*sec(5)+4} step={6} fontSize={55} accent={active===1?["tell"]:active===3?["proof"]:[]}/></div><div style={{fontFamily:GEIST_MONO,fontSize:86,fontWeight:700,color:s.tone,marginTop:45,opacity:interpolate(local,[10,26],[0,1],clamp),scale:interpolate(local,[10,34],[1.12,1],{...clamp,easing:ease}),filter:`blur(${interpolate(local,[10,28],[10,0],clamp)}px)`}}>{s.big}</div><div style={{marginTop:42,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",boxShadow:`0 10px ${interpolate(local,[20,80],[0,36],clamp)}px rgba(10,10,10,.07)`}}>{s.rows.map(([k,v],i)=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"17px 21px",background:C.paper,borderBottom:i<2?`1px solid ${C.border}`:"none",fontSize:21,opacity:interpolate(local,[20+i*12,36+i*12],[0,1],clamp),translate:`${interpolate(local,[20+i*12,36+i*12],[30,0],clamp)}px 0`}}><span style={{color:C.sub}}>{k}</span><b style={{fontFamily:GEIST_MONO,color:v==="FAIL"||v==="MATCH"?C.red:C.ink}}>{v}</b></div>)}</div></div><div style={{background:C.dark,color:C.paper,borderLeft:`1px solid ${C.border}`,padding:25}}><div style={{fontFamily:GEIST_MONO,fontSize:17,color:C.muted}}>DECISION TRACE</div><div style={{display:"grid",gap:15,marginTop:26}}>{["tool.call","policy.pass","memory.read","decision","evidence","guardrail","complete"].map((k,i)=><div key={k} style={{display:"flex",gap:12,opacity:interpolate(local,[i*10,i*10+12],[0,1],clamp),translate:`${interpolate(local,[i*10,i*10+12],[22,0],clamp)}px 0`}}><div style={{width:7,height:7,borderRadius:8,background:i===5&&active===1?C.red:i===6?C.green:C.orange,marginTop:7,boxShadow:`0 0 ${interpolate(local,[i*10,i*10+20],[0,15],clamp)}px currentColor`}}/><div><div style={{fontFamily:GEIST_MONO,fontSize:16,color:"#B8B8B3"}}>{k}</div><div style={{fontSize:17,marginTop:3}}>{active===0?["maps.route","scope verified","lane history","true margin","diesel attached","floor enforced","3 survive"][i]:active===1?["fmcsa.lookup","authority active","bank graph","identity mismatch","callback failed","LOAD REFUSED","risk saved"][i]:active===2?["lane.anchor","terms bounded","contact history","counter sent","approval heard","rate locked","handoff"][i]:["geofence.in","notice armed","clock running","free window","gps attached","invoice filed","aging active"][i]}</div></div></div>)}</div></div></div></div></Shell>}

function Close(){const frame=useCurrentFrame();return <Shell dark><div style={{position:"absolute",inset:0,background:"radial-gradient(circle at 50% 44%,rgba(249,115,22,.16),transparent 26%),#1E1E1E"}}/><div style={{position:"absolute",inset:0,display:"grid",placeItems:"center"}}><div style={{textAlign:"center"}}><div style={{display:"flex",justifyContent:"center",opacity:interpolate(frame,[6,36],[0,1],clamp),scale:interpolate(frame,[6,42],[.72,1],{...clamp,easing:ease}),filter:`drop-shadow(0 0 ${interpolate(frame,[18,120],[0,34],clamp)}px rgba(249,115,22,.35))`}}><Logo size={132}/></div><div style={{fontSize:74,fontWeight:700,letterSpacing:"-.055em",marginTop:35,opacity:interpolate(frame,[32,62],[0,1],clamp),translate:`0 ${interpolate(frame,[32,62],[24,0],clamp)}px`}}>Sentinel</div><div style={{marginTop:22,width:1120}}><WordReveal text="The back office a one-truck carrier could never afford." start={62} step={10} fontSize={38} align="center" accent={["back", "office", "afford"]}/></div><div style={{fontFamily:GEIST_MONO,fontSize:22,color:C.orange,marginTop:34,letterSpacing:".08em",opacity:interpolate(frame,[158,195],[0,1],clamp)}}>FOUR AGENTS · ONE BUSINESS MEMORY</div></div></div></Shell>}

export const SilentStory = () => (
  <AbsoluteFill style={{background:C.paper,fontFamily:INTER}}>
    <Audio src={staticFile("emotional-score.mp3")} trimAfter={sec(110)} volume={(f)=>interpolate(f,[0,45,sec(102),sec(110)],[0,.92,.92,0],clamp)} />
    {TIMELINE.map(({from,duration,component:Comp}) => <Sequence key={from} name={`Scene ${from}s`} from={sec(from)} durationInFrames={sec(duration)}><SceneFade duration={sec(duration)} noFadeIn={from===0}><Comp/></SceneFade></Sequence>)}
  </AbsoluteFill>
);

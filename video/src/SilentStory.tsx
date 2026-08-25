import React from "react";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C } from "./design";

const { fontFamily: INTER } = loadInter("normal", {
  weights: ["400"],
  subsets: ["latin"],
});
const { fontFamily: GEIST_MONO } = loadGeistMono("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

const FPS = 30;
const sec = (n: number) => Math.round(n * FPS);
const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const TIMELINE = [
  { from: 0, duration: 8, component: ColdOpen },
  { from: 8, duration: 12, component: Pressure },
  { from: 20, duration: 12, component: BackOffice },
  { from: 32, duration: 20, component: Fraud },
  { from: 52, duration: 12, component: Detention },
  { from: 64, duration: 8, component: Impact },
  { from: 72, duration: 10, component: FourAgents },
  { from: 82, duration: 20, component: Product },
  { from: 102, duration: 8, component: Close },
] as const;

const appear = (frame: number, start = 0, duration = 18) => ({
  opacity: interpolate(frame, [start, start + duration], [0, 1], {
    ...clamp,
    easing: ease,
  }),
  translate: `0 ${interpolate(frame, [start, start + duration], [24, 0], { ...clamp, easing: ease })}px`,
});

const money = (value: number) =>
  `$${Math.round(value).toLocaleString("en-US")}`;

const WordReveal = ({
  text,
  start = 0,
  step = 10,
  fontSize = 72,
  color,
  align = "left",
  lineHeight = 1.05,
  fontWeight = 400,
  letterSpacing = "-.052em",
}: {
  text: string;
  start?: number;
  step?: number;
  fontSize?: number;
  color?: string;
  align?: "left" | "center";
  lineHeight?: number;
  fontWeight?: number;
  letterSpacing?: string;
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        fontSize,
        fontWeight,
        letterSpacing,
        lineHeight,
        color,
        textAlign: align,
      }}
    >
      {text.split(" ").map((word, index) => {
        const at = start + index * step;
        const mode = index % 3;
        return (
          <span
            key={`${word}-${index}`}
            style={{
              display: "inline-block",
              marginRight: "0.23em",
              opacity: interpolate(frame, [at, at + 22], [0, 1], {
                ...clamp,
                easing: ease,
              }),
              filter: `blur(${interpolate(frame, [at, at + 24], [mode === 1 ? 13 : 8, 0], { ...clamp, easing: ease })}px)`,
              translate: `${interpolate(frame, [at, at + 24], [mode === 2 ? 24 : mode === 1 ? -16 : 0, 0], { ...clamp, easing: ease })}px ${interpolate(frame, [at, at + 24], [mode === 0 ? 30 : 12, 0], { ...clamp, easing: ease })}px`,
              scale: interpolate(
                frame,
                [at, at + 24],
                [mode === 1 ? 1.08 : 0.96, 1],
                { ...clamp, easing: ease },
              ),
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

const SceneFade = ({
  children,
  duration,
  noFadeIn = false,
}: {
  children: React.ReactNode;
  duration: number;
  noFadeIn?: boolean;
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: noFadeIn
          ? interpolate(frame, [duration - 15, duration], [1, 0], {
              ...clamp,
              easing: ease,
            })
          : interpolate(frame, [0, 13, duration - 15, duration], [0, 1, 1, 0], {
              ...clamp,
              easing: ease,
            }),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Logo = ({ size = 58 }: { size?: number }) => (
  <Img
    src={staticFile("icon.svg")}
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.22,
      boxShadow: "0 8px 24px rgba(0,0,0,.16)",
    }}
  />
);

const Grain = ({ dark = false }: { dark?: boolean }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      opacity: dark ? 0.045 : 0.018,
      mixBlendMode: dark ? "screen" : "multiply",
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.75'/%3E%3C/svg%3E\")",
    }}
  />
);

const Shell = ({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: dark ? C.dark : C.paper,
        color: dark ? C.paper : C.ink,
        fontFamily: INTER,
      }}
    >
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

const Victor = ({ large = false }: { large?: boolean }) => (
  <svg
    width={large ? 520 : 170}
    height={large ? 570 : 185}
    viewBox="0 0 520 570"
  >
    <circle cx="260" cy="182" r="104" fill="#9B6849" />
    <path
      d="M150 165 C160 22 365 15 378 166 C315 95 214 90 150 165 Z"
      fill="#141416"
    />
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
    <svg
      width="520"
      height="610"
      viewBox="0 0 520 610"
      style={{ overflow: "visible" }}
    >
      <circle
        cx="260"
        cy="203"
        r="132"
        fill="#F8EFE8"
        opacity={interpolate(frame, [72, 145], [0, 0.7], clamp)}
        style={{
          transformOrigin: "260px 203px",
          scale: interpolate(frame, [72, 145], [0.9, 1], clamp),
        }}
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
          strokeDashoffset={interpolate(
            frame,
            [35 + index * 10, 118 + index * 10],
            [900, 0],
            { ...clamp, easing: ease },
          )}
          opacity={interpolate(
            frame,
            [30 + index * 9, 54 + index * 9],
            [0, 1],
            clamp,
          )}
        />
      ))}
      <circle
        cx="221"
        cy="215"
        r="3.5"
        fill="#494947"
        opacity={interpolate(frame, [108, 136], [0, 1], clamp)}
      />
      <circle
        cx="299"
        cy="215"
        r="3.5"
        fill="#494947"
        opacity={interpolate(frame, [114, 142], [0, 1], clamp)}
      />
      <path
        d="M232 268 C248 278 274 278 290 268"
        fill="none"
        stroke="#494947"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="90"
        strokeDashoffset={interpolate(frame, [122, 154], [90, 0], clamp)}
      />
    </svg>
  );
};

function ColdOpen() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{ background: C.white, color: C.ink, fontFamily: INTER }}
    >
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
          opacity: interpolate(frame, [104, 142], [0, 1], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: ".02em" }}>
          Victor Amaya
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 400,
            color: C.muted,
            marginTop: 8,
          }}
        >
          owner-operator · one truck
        </div>
      </div>
      <div style={{ position: "absolute", left: 260, right: 260, top: 760 }}>
        <WordReveal
          text="Victor drives the truck. He also runs the business."
          start={110}
          step={11}
          fontSize={56}
          fontWeight={400}
          letterSpacing="-.025em"
          lineHeight={1.18}
          align="center"
        />
      </div>
    </AbsoluteFill>
  );
}

function Pressure() {
  const frame = useCurrentFrame();
  const rows = [
    ["Mortgage", "$2,640"],
    ["Truck note", "$2,180"],
    ["Insurance", "$1,180"],
    ["Home costs", "$520"],
  ];
  const total = money(interpolate(frame, [70, 250], [0, 6520], clamp));
  return (
    <Shell>
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 205,
          width: 720,
          ...appear(frame, 4),
        }}
      >
        <div
          style={{
            fontFamily: GEIST_MONO,
            fontSize: 25,
            color: C.orange,
            letterSpacing: ".04em",
            ...appear(frame, 2, 20),
          }}
        >
          THIS IS VICTOR
        </div>
        <div style={{ marginTop: 20 }}>
          <WordReveal
            text="He owes $6,520 every month. Before diesel."
            start={8}
            step={12}
            fontSize={83}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            marginTop: 40,
            opacity: interpolate(frame, [112, 142], [0, 1], clamp),
            translate: `0 ${interpolate(frame, [112, 142], [18, 0], clamp)}px`,
          }}
        >
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 999,
              background: "#F4E5D8",
              overflow: "hidden",
              display: "grid",
              placeItems: "center",
              scale: interpolate(frame, [112, 142], [0.82, 1], {
                ...clamp,
                easing: ease,
              }),
            }}
          >
            <Victor />
          </div>
          <div>
            <div style={{ fontSize: 35, fontWeight: 400 }}>Victor Amaya</div>
            <div style={{ fontSize: 24, color: C.sub, marginTop: 6 }}>
              Owner-operator · first year
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 105,
          top: 188,
          width: 800,
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 70px rgba(10,10,10,.07)",
          ...appear(frame, 16),
        }}
      >
        <div
          style={{
            padding: "29px 38px",
            borderBottom: `1px solid ${C.hair}`,
            fontFamily: GEIST_MONO,
            color: C.orange,
            fontSize: 23,
          }}
        >
          EVERY MONTH · BEFORE DIESEL
        </div>
        <div style={{ padding: "11px 38px 8px" }}>
          {rows.map(([k, v], i) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "22px 0",
                borderBottom: `1px solid ${C.hair}`,
                opacity: interpolate(
                  frame,
                  [22 + i * 14, 40 + i * 14],
                  [0, 1],
                  clamp,
                ),
                translate: `${interpolate(frame, [22 + i * 14, 40 + i * 14], [36, 0], clamp)}px 0`,
              }}
            >
              <span style={{ fontSize: 30, color: C.body }}>{k}</span>
              <span
                style={{
                  fontFamily: GEIST_MONO,
                  fontSize: 36,
                  fontWeight: 400,
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "27px 38px 33px",
            background: C.orangeTint,
            boxShadow: `inset ${interpolate(frame, [72, 240], [0, 800], clamp)}px 0 rgba(234,88,12,.055)`,
          }}
        >
          <span style={{ fontSize: 27, fontWeight: 400, color: C.orangeDark }}>
            FIXED
          </span>
          <span
            style={{
              fontFamily: GEIST_MONO,
              fontSize: 68,
              color: C.orange,
              fontWeight: 400,
            }}
          >
            {total}
          </span>
        </div>
      </div>
    </Shell>
  );
}

function BackOffice() {
  const frame = useCurrentFrame();
  const rows = [
    ["Dispatcher · 10%", "$1,760"],
    ["Factoring · 3%", "$530"],
    ["Compliance + billing", "$550"],
  ];
  return (
    <Shell>
      <div
        style={{
          position: "absolute",
          left: 115,
          right: 115,
          top: 215,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 95,
          alignItems: "center",
        }}
      >
        <div style={{ ...appear(frame, 3) }}>
          <div style={{ fontFamily: GEIST_MONO, fontSize: 25, color: C.muted }}>
            YEAR ONE
          </div>
          <div style={{ marginTop: 18 }}>
            <WordReveal
              text="His back office cost $2,840 a month."
              start={8}
              step={11}
              fontSize={72}
            />
          </div>
          <div
            style={{
              fontSize: 32,
              color: C.body,
              lineHeight: 1.45,
              marginTop: 30,
            }}
          >
            {[
              "Dispatch found loads.",
              "Verification checked brokers.",
              "Billing chased payments.",
            ].map((line, i) => (
              <div
                key={line}
                style={{
                  opacity: interpolate(
                    frame,
                    [82 + i * 18, 103 + i * 18],
                    [0, 1],
                    clamp,
                  ),
                  translate: `${interpolate(frame, [82 + i * 18, 103 + i * 18], [-22, 0], clamp)}px 0`,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            position: "relative",
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            padding: "23px 38px 31px",
            boxShadow: "0 24px 70px rgba(10,10,10,.07)",
            ...appear(frame, 15),
          }}
        >
          {rows.map(([k, v], i) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "23px 0",
                borderBottom: `1px solid ${C.hair}`,
                opacity: interpolate(
                  frame,
                  [35 + i * 18, 55 + i * 18],
                  [0, 1],
                  clamp,
                ),
                translate: `${interpolate(frame, [35 + i * 18, 55 + i * 18], [30, 0], clamp)}px 0`,
              }}
            >
              <span style={{ fontSize: 29, color: C.body }}>{k}</span>
              <span style={{ fontFamily: GEIST_MONO, fontSize: 32 }}>{v}</span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              paddingTop: 28,
            }}
          >
            <span style={{ fontSize: 26, fontWeight: 400 }}>PER MONTH</span>
            <span
              style={{ fontFamily: GEIST_MONO, fontSize: 61, color: C.orange }}
            >
              $2,840
            </span>
          </div>
          <div
            style={{
              position: "absolute",
              inset: 25,
              display: "grid",
              placeItems: "center",
              opacity: interpolate(frame, [180, 218], [0, 1], clamp),
            }}
          >
            <div
              style={{
                padding: "16px 25px",
                border: `6px solid ${C.red}`,
                color: C.red,
                fontFamily: GEIST_MONO,
                fontSize: 35,
                fontWeight: 400,
                rotate: `${interpolate(frame, [180, 218], [-18, -7], clamp)}deg`,
                scale: interpolate(
                  frame,
                  [180, 205, 225],
                  [1.28, 0.96, 1],
                  clamp,
                ),
                background: "rgba(255,255,255,.92)",
              }}
            >
              MONTH 9 · CANCELLED
            </div>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 115, right: 115, bottom: 88 }}>
        <WordReveal
          text="He cancelled it in month 9. Then he did the work himself."
          start={214}
          step={6}
          fontSize={47}
          align="center"
        />
      </div>
    </Shell>
  );
}

function Fraud() {
  const frame = useCurrentFrame();
  const phase =
    frame < sec(6) ? 0 : frame < sec(12) ? 1 : frame < sec(16) ? 2 : 3;
  const phaseStart = [0, sec(6), sec(12), sec(16)][phase];
  const phaseFrame = frame - phaseStart;
  return (
    <Shell>
      <div
        style={{
          position: "absolute",
          right: 105,
          top: 85,
          fontFamily: GEIST_MONO,
          fontSize: 23,
          color: C.muted,
        }}
      >
        MARCH · TOLEDO → CHARLOTTE
      </div>
      {phase === 0 && (
        <div
          style={{
            position: "absolute",
            left: 120,
            right: 120,
            top: 210,
            bottom: 110,
            display: "grid",
            gridTemplateColumns: "1fr .9fr",
            gap: 85,
            alignItems: "center",
          }}
        >
          <div>
            <WordReveal
              text="The broker's MC number was real."
              start={4}
              step={12}
              fontSize={74}
            />
            <div
              style={{
                fontFamily: GEIST_MONO,
                fontSize: 43,
                marginTop: 40,
                ...appear(frame, 55, 24),
              }}
            >
              540 MI · $1,450
            </div>
            <div style={{ fontSize: 29, color: C.sub, marginTop: 15 }}>
              {["Victor hauled it.", "Delivered it.", "Sent the invoice."].map(
                (word, i) => (
                  <span
                    key={word}
                    style={{
                      display: "inline-block",
                      marginRight: 12,
                      opacity: interpolate(
                        frame,
                        [82 + i * 15, 99 + i * 15],
                        [0, 1],
                        clamp,
                      ),
                      translate: `0 ${interpolate(frame, [82 + i * 15, 99 + i * 15], [15, 0], clamp)}px`,
                    }}
                  >
                    {word}
                  </span>
                ),
              )}
            </div>
          </div>
          <div
            style={{
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 24px 70px rgba(10,10,10,.08)",
              opacity: interpolate(frame, [18, 42], [0, 1], clamp),
              translate: `${interpolate(frame, [18, 42], [60, 0], clamp)}px 0`,
              scale: interpolate(frame, [18, 42], [0.97, 1], clamp),
            }}
          >
            <div
              style={{
                padding: "29px 34px",
                borderBottom: `1px solid ${C.hair}`,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{ fontFamily: GEIST_MONO, color: C.muted, fontSize: 23 }}
              >
                LOAD P-90388
              </span>
              <span
                style={{
                  background: C.greenTint,
                  color: C.green,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 21,
                  boxShadow: `0 0 ${interpolate(frame, [35, 95], [0, 24], clamp)}px rgba(22,163,74,.25)`,
                }}
              >
                MC VERIFIED ✓
              </span>
            </div>
            <div style={{ padding: 34 }}>
              {[
                ["Authority", "ACTIVE"],
                ["Insurance", "ON FILE"],
                ["Operating since", "2011"],
                ["Rate con", "9 MIN"],
              ].map(([k, v], i) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "17px 0",
                    borderBottom: `1px solid ${C.hair}`,
                    fontSize: 27,
                    opacity: interpolate(
                      frame,
                      [45 + i * 12, 61 + i * 12],
                      [0, 1],
                      clamp,
                    ),
                    translate: `${interpolate(frame, [45 + i * 12, 61 + i * 12], [22, 0], clamp)}px 0`,
                  }}
                >
                  <span style={{ color: C.sub }}>{k}</span>
                  <span style={{ fontFamily: GEIST_MONO }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {phase === 1 && (
        <div
          style={{
            position: "absolute",
            inset: "220px 150px 145px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 45,
          }}
        >
          {[
            ["DAY 0", "INVOICED"],
            ["DAY 30", "NOTHING"],
            ["DAY 60", "UNPAID"],
          ].map(([d, s], i) => (
            <React.Fragment key={d}>
              <div
                style={{
                  width: 380,
                  height: 300,
                  borderRadius: 19,
                  border: `1px solid ${i === 2 ? "#FECACA" : C.border}`,
                  background: i === 2 ? C.redTint : C.white,
                  display: "grid",
                  placeItems: "center",
                  textAlign: "center",
                  opacity: interpolate(
                    phaseFrame,
                    [i * 24, i * 24 + 18],
                    [0, 1],
                    clamp,
                  ),
                  translate: `0 ${interpolate(phaseFrame, [i * 24, i * 24 + 18], [45, 0], clamp)}px`,
                  scale: interpolate(
                    phaseFrame,
                    [i * 24, i * 24 + 18],
                    [0.93, 1],
                    clamp,
                  ),
                  boxShadow:
                    i === 2
                      ? `0 0 ${interpolate(phaseFrame, [48, 110], [0, 45], clamp)}px rgba(220,38,38,.16)`
                      : "0 16px 45px rgba(10,10,10,.05)",
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: GEIST_MONO,
                      color: i === 2 ? C.red : C.muted,
                      fontSize: 25,
                    }}
                  >
                    {d}
                  </div>
                  <div
                    style={{
                      fontSize: 50,
                      fontWeight: 400,
                      color: i === 2 ? C.red : C.ink,
                      marginTop: 22,
                    }}
                  >
                    {s}
                  </div>
                  {i === 2 && (
                    <div
                      style={{
                        fontFamily: GEIST_MONO,
                        color: C.red,
                        fontSize: 21,
                        marginTop: 18,
                        opacity: interpolate(
                          phaseFrame,
                          [68, 92],
                          [0, 1],
                          clamp,
                        ),
                      }}
                    >
                      PHONE DISCONNECTED
                    </div>
                  )}
                </div>
              </div>
              {i < 2 && (
                <div
                  style={{
                    fontSize: 48,
                    color: C.border,
                    translate: `${interpolate(phaseFrame, [i * 24 + 16, i * 24 + 42], [-15, 8], clamp)}px 0`,
                    opacity: interpolate(
                      phaseFrame,
                      [i * 24 + 15, i * 24 + 32],
                      [0, 1],
                      clamp,
                    ),
                  }}
                >
                  →
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      {phase === 2 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontFamily: GEIST_MONO,
                fontSize: 28,
                color: C.red,
                letterSpacing: ".04em",
                ...appear(phaseFrame, 2),
              }}
            >
              DOUBLE BROKERED
            </div>
            <div
              style={{
                fontFamily: GEIST_MONO,
                fontSize: 210,
                fontWeight: 400,
                color: C.red,
                letterSpacing: "-.09em",
                lineHeight: 0.95,
                marginTop: 18,
                opacity: interpolate(phaseFrame, [8, 28], [0, 1], clamp),
                scale: interpolate(phaseFrame, [8, 42], [1.22, 1], {
                  ...clamp,
                  easing: ease,
                }),
                filter: `blur(${interpolate(phaseFrame, [8, 30], [12, 0], clamp)}px)`,
              }}
            >
              −{money(interpolate(phaseFrame, [8, 70], [0, 4000], clamp))}
            </div>
            <div style={{ marginTop: 34 }}>
              <WordReveal
                text="Victor hauled two loads. The fake broker kept $4,000."
                start={sec(12) + 38}
                step={6}
                fontSize={35}
                align="center"
              />
            </div>
          </div>
        </div>
      )}
      {phase === 3 && (
        <div
          style={{
            position: "absolute",
            left: 220,
            right: 220,
            top: 230,
            bottom: 130,
            display: "grid",
            gridTemplateColumns: ".8fr 1.2fr",
            gap: 80,
            alignItems: "center",
          }}
        >
          <div>
            <WordReveal
              text="The phone number did not match the broker."
              start={sec(16) + 3}
              step={8}
              fontSize={66}
            />
          </div>
          <div
            style={{
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 20,
              padding: 38,
              boxShadow: "0 24px 70px rgba(10,10,10,.08)",
              opacity: interpolate(phaseFrame, [10, 32], [0, 1], clamp),
              translate: `${interpolate(phaseFrame, [10, 32], [55, 0], clamp)}px 0`,
            }}
          >
            {[
              ["Broker authority", "REAL ✓", C.green],
              ["Posted phone number", "NO MATCH ✕", C.red],
            ].map(([k, v, tone], i) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "23px 0",
                  borderBottom: i === 0 ? `1px solid ${C.hair}` : "none",
                  fontSize: 32,
                  opacity: interpolate(
                    phaseFrame,
                    [28 + i * 35, 48 + i * 35],
                    [0, 1],
                    clamp,
                  ),
                  translate: `${interpolate(phaseFrame, [28 + i * 35, 48 + i * 35], [28, 0], clamp)}px 0`,
                }}
              >
                <span>{k}</span>
                <span style={{ fontFamily: GEIST_MONO, color: tone }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Detention() {
  const frame = useCurrentFrame();
  const clock = interpolate(frame, [20, 220], [6.67, 13.25], clamp);
  const h = Math.floor(clock);
  const m = Math.round((clock - h) * 60);
  const owed = Math.round(interpolate(frame, [80, 230], [0, 292], clamp));
  return (
    <Shell dark>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(120deg,#171719,#2A292C)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 105,
          top: 85,
          fontFamily: GEIST_MONO,
          fontSize: 23,
          color: C.muted,
        }}
      >
        MAY · LAREDO
      </div>
      <div
        style={{
          position: "absolute",
          left: 115,
          right: 115,
          top: 230,
          bottom: 135,
          display: "grid",
          gridTemplateColumns: "1fr .86fr",
          gap: 90,
          alignItems: "center",
        }}
      >
        <div
          style={{
            opacity: interpolate(frame, [4, 28], [0, 1], clamp),
            translate: `${interpolate(frame, [4, 28], [-45, 0], clamp)}px 0`,
          }}
        >
          <div
            style={{
              fontFamily: GEIST_MONO,
              fontSize: 138,
              fontWeight: 400,
              letterSpacing: "-.08em",
              textShadow: `0 0 ${interpolate(frame, [20, 220], [0, 32], clamp)}px rgba(249,115,22,.18)`,
            }}
          >
            {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}
          </div>
          <div style={{ fontSize: 33, color: "#C2C2BE", marginTop: 15 }}>
            Arrived 06:40 · Loaded 13:15
          </div>
          <div
            style={{
              height: 14,
              borderRadius: 10,
              background: C.raised,
              overflow: "hidden",
              marginTop: 50,
            }}
          >
            <div
              style={{
                width: `${interpolate(frame, [20, 220], [0, 100], clamp)}%`,
                height: "100%",
                background: C.orange,
                boxShadow: "0 0 22px rgba(249,115,22,.55)",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: GEIST_MONO,
              fontSize: 21,
              color: C.muted,
              marginTop: 13,
            }}
          >
            <span>2 HOURS FREE</span>
            <span>4.5 HOURS OWED</span>
          </div>
        </div>
        <div
          style={{
            background: C.raised,
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 20,
            padding: 38,
            opacity: interpolate(frame, [35, 62], [0, 1], clamp),
            translate: `${interpolate(frame, [35, 62], [55, 0], clamp)}px 0`,
          }}
        >
          <div style={{ fontFamily: GEIST_MONO, fontSize: 24, color: C.muted }}>
            DETENTION · $65 / HR
          </div>
          <div
            style={{
              fontFamily: GEIST_MONO,
              fontSize: 112,
              fontWeight: 400,
              color: C.orange,
              marginTop: 18,
            }}
          >
            ${owed}
          </div>
          <div
            style={{
              padding: 22,
              borderRadius: 11,
              background: "rgba(220,38,38,.14)",
              border: "1px solid rgba(248,113,113,.35)",
              color: "#FCA5A5",
              fontFamily: GEIST_MONO,
              fontSize: 27,
              fontWeight: 400,
              marginTop: 24,
              opacity: interpolate(frame, [240, 275], [0, 1], clamp),
              scale: interpolate(
                frame,
                [240, 265, 285],
                [1.14, 0.97, 1],
                clamp,
              ),
              rotate: `${interpolate(frame, [240, 285], [-5, 0], clamp)}deg`,
            }}
          >
            CLAIM DENIED
            <br />
            <span style={{ fontSize: 20, fontWeight: 400 }}>
              NO PROOF OF ARRIVAL
            </span>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Impact() {
  const frame = useCurrentFrame();
  return (
    <Shell dark>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: GEIST_MONO,
              fontSize: 142,
              fontWeight: 400,
              letterSpacing: "-.08em",
              color: C.red,
              opacity: interpolate(frame, [18, 54], [0, 1], clamp),
              scale: interpolate(frame, [18, 58], [1.2, 1], {
                ...clamp,
                easing: ease,
              }),
              filter: `blur(${interpolate(frame, [18, 50], [16, 0], clamp)}px)`,
            }}
          >
            −{money(interpolate(frame, [18, 95], [0, 4292], clamp))}
          </div>
          <div style={{ marginTop: 35 }}>
            <WordReveal
              text="His mortgage was still due."
              start={72}
              step={16}
              fontSize={67}
              align="center"
            />
          </div>
          <div
            style={{
              fontFamily: GEIST_MONO,
              fontSize: 24,
              color: C.muted,
              marginTop: 30,
              letterSpacing: ".08em",
              opacity: interpolate(frame, [155, 190], [0, 1], clamp),
            }}
          >
            DOUBLE BROKERING + UNPAID DETENTION
          </div>
        </div>
      </div>
    </Shell>
  );
}

function FourAgents() {
  const frame = useCurrentFrame();
  return (
    <Shell>
      <div style={{ position: "absolute", left: 105, right: 105, top: 82 }}>
        <WordReveal
          text="Four agents now handle Victor's back office."
          start={2}
          step={10}
          fontSize={64}
          align="center"
        />
      </div>

      <svg
        width="1920"
        height="1080"
        viewBox="0 0 1920 1080"
        style={{ position: "absolute", inset: 0, opacity: 0.58 }}
      >
        {[
          "M 490 470 C 690 330, 760 580, 905 585",
          "M 950 555 C 1110 410, 1180 400, 1325 420",
          "M 1405 490 C 1540 530, 1585 650, 1600 735",
        ].map((d, i) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke={i === 1 ? C.orange : C.border}
            strokeWidth={i === 1 ? 3 : 2}
            strokeDasharray="520"
            strokeDashoffset={interpolate(
              frame,
              [58 + i * 38, 138 + i * 38],
              [520, 0],
              clamp,
            )}
          />
        ))}
      </svg>

      <div
        style={{
          position: "absolute",
          left: 105,
          top: 300,
          width: 470,
          padding: "27px 30px 31px",
          borderLeft: `5px solid ${C.orange}`,
          background: "rgba(255,255,255,.72)",
          opacity: interpolate(frame, [36, 64], [0, 1], clamp),
          translate: `${interpolate(frame, [36, 70], [-120, 0], clamp)}px 0`,
        }}
      >
        <div style={{ fontFamily: GEIST_MONO, color: C.orange }}>
          01 · FINDER
        </div>
        <div style={{ fontSize: 29, marginTop: 13 }}>Find profitable loads</div>
        <svg
          width="410"
          height="92"
          viewBox="0 0 410 92"
          style={{ marginTop: 18 }}
        >
          <path
            d="M 12 69 C 95 0, 218 93, 395 20"
            fill="none"
            stroke={C.ink}
            strokeWidth="3"
            strokeDasharray="500"
            strokeDashoffset={interpolate(frame, [70, 145], [500, 0], clamp)}
          />
          <circle cx="12" cy="69" r="7" fill={C.orange} />
          <circle cx="395" cy="20" r="7" fill={C.orange} />
        </svg>
      </div>

      <div
        style={{
          position: "absolute",
          left: 720,
          top: 420,
          width: 365,
          height: 300,
          borderRadius: 999,
          border: `1px solid ${C.border}`,
          background: C.white,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          opacity: interpolate(frame, [78, 106], [0, 1], clamp),
          scale: interpolate(frame, [78, 116], [0.62, 1], {
            ...clamp,
            easing: ease,
          }),
          rotate: `${interpolate(frame, [78, 116], [-9, 0], clamp)}deg`,
          boxShadow: `0 0 ${interpolate(frame, [95, 180], [0, 55], clamp)}px rgba(220,38,38,.11)`,
        }}
      >
        <div>
          <div style={{ fontFamily: GEIST_MONO, color: C.red }}>02</div>
          <div style={{ fontSize: 36, marginTop: 9 }}>VERIFIER</div>
          <div style={{ fontSize: 22, color: C.sub, marginTop: 10 }}>
            Check broker identity
          </div>
          <div
            style={{
              display: "inline-block",
              fontFamily: GEIST_MONO,
              color: C.red,
              marginTop: 19,
              opacity: interpolate(frame, [118, 152], [0, 1], clamp),
            }}
          >
            PHONE ≠ MC
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 375,
          top: 270,
          width: 430,
          opacity: interpolate(frame, [116, 145], [0, 1], clamp),
          translate: `0 ${interpolate(frame, [116, 150], [-75, 0], clamp)}px`,
        }}
      >
        <div style={{ fontFamily: GEIST_MONO, color: C.green }}>
          03 · CLOSER
        </div>
        <div style={{ fontSize: 29, marginTop: 10 }}>
          Negotiate and follow up
        </div>
        {["$1,450 offered", "$1,620 countered", "RATE LOCKED"].map(
          (text, i) => (
            <div
              key={text}
              style={{
                width: i === 1 ? 330 : 270,
                marginLeft: i === 1 ? 70 : i === 2 ? 145 : 0,
                marginTop: 14,
                padding: "12px 17px",
                borderRadius: i === 2 ? 999 : 13,
                background: i === 2 ? C.greenTint : C.white,
                border: `1px solid ${i === 2 ? "#BBF7D0" : C.border}`,
                color: i === 2 ? C.green : C.body,
                fontFamily: i === 2 ? GEIST_MONO : INTER,
                opacity: interpolate(
                  frame,
                  [145 + i * 24, 165 + i * 24],
                  [0, 1],
                  clamp,
                ),
                translate: `${interpolate(frame, [145 + i * 24, 168 + i * 24], [i % 2 ? 42 : -42, 0], clamp)}px 0`,
              }}
            >
              {text}
            </div>
          ),
        )}
      </div>

      <div
        style={{
          position: "absolute",
          right: 95,
          bottom: 92,
          width: 330,
          minHeight: 265,
          padding: 26,
          background: C.dark,
          color: C.paper,
          clipPath: "polygon(0 0,100% 0,100% 88%,92% 100%,0 100%)",
          opacity: interpolate(frame, [160, 190], [0, 1], clamp),
          translate: `0 ${interpolate(frame, [160, 198], [110, 0], clamp)}px`,
        }}
      >
        <div style={{ fontFamily: GEIST_MONO, color: C.orange }}>
          04 · PAYDAY
        </div>
        <div style={{ fontSize: 27, marginTop: 14 }}>Document detention</div>
        {["06:40 · GPS IN", "13:15 · GPS OUT", "$292 · FILED"].map(
          (line, i) => (
            <div
              key={line}
              style={{
                fontFamily: GEIST_MONO,
                fontSize: 18,
                color: i === 2 ? C.orange : "#B8B8B3",
                paddingTop: 14,
                marginTop: 4,
                borderTop: `1px solid rgba(255,255,255,.12)`,
                opacity: interpolate(
                  frame,
                  [188 + i * 18, 204 + i * 18],
                  [0, 1],
                  clamp,
                ),
              }}
            >
              {line}
            </div>
          ),
        )}
      </div>
    </Shell>
  );
}

const productFade = (local: number) =>
  interpolate(local, [0, 14, 136, 150], [0, 1, 1, 0], clamp);

function FinderDemo({ local }: { local: number }) {
  return (
    <AbsoluteFill style={{ opacity: productFade(local) }}>
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 70,
          fontFamily: GEIST_MONO,
          color: C.orange,
          fontSize: 22,
        }}
      >
        01 · FINDER
      </div>
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 118,
          fontSize: 68,
          letterSpacing: "-.05em",
        }}
      >
        Find the load that pays.
      </div>
      <svg
        width="1210"
        height="570"
        viewBox="0 0 1210 570"
        style={{ position: "absolute", left: 55, top: 285 }}
      >
        <path
          d="M 70 390 C 235 75, 600 510, 1125 130"
          fill="none"
          stroke={C.hair}
          strokeWidth="44"
          strokeLinecap="round"
        />
        <path
          d="M 70 390 C 235 75, 600 510, 1125 130"
          fill="none"
          stroke={C.orange}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="1500"
          strokeDashoffset={interpolate(local, [12, 100], [1500, 0], clamp)}
        />
        <circle cx="70" cy="390" r="13" fill={C.ink} />
        <circle cx="1125" cy="130" r="13" fill={C.orange} />
      </svg>
      {[
        { x: 220, y: 600, rate: "$1.91 / MI", muted: true },
        { x: 620, y: 430, rate: "$2.08 / MI", muted: true },
        { x: 1025, y: 355, rate: "$2.34 / MI", muted: false },
      ].map((load, i) => (
        <div
          key={load.rate}
          style={{
            position: "absolute",
            left: load.x,
            top: load.y,
            padding: "15px 20px",
            borderRadius: 999,
            background: load.muted ? C.white : C.dark,
            color: load.muted ? C.muted : C.paper,
            border: `1px solid ${load.muted ? C.border : C.dark}`,
            fontFamily: GEIST_MONO,
            fontSize: 22,
            opacity: interpolate(
              local,
              [35 + i * 24, 55 + i * 24],
              [0, 1],
              clamp,
            ),
            scale: interpolate(
              local,
              [35 + i * 24, 60 + i * 24],
              [0.74, 1],
              clamp,
            ),
          }}
        >
          {load.rate}
        </div>
      ))}
      <div style={{ position: "absolute", right: 105, top: 300, width: 480 }}>
        <div style={{ color: C.sub, fontSize: 25 }}>
          Toledo → Charlotte · 540 miles
        </div>
        <div
          style={{
            fontFamily: GEIST_MONO,
            fontSize: 108,
            color: C.orange,
            letterSpacing: "-.08em",
            marginTop: 24,
            opacity: interpolate(local, [65, 94], [0, 1], clamp),
            translate: `${interpolate(local, [65, 96], [55, 0], clamp)}px 0`,
          }}
        >
          $2.34
        </div>
        <div style={{ fontSize: 34, marginTop: 6 }}>
          per mile after the math
        </div>
        <div style={{ height: 2, background: C.border, marginTop: 35 }}>
          <div
            style={{
              height: "100%",
              background: C.orange,
              width: `${interpolate(local, [85, 126], [0, 100], clamp)}%`,
            }}
          />
        </div>
        <div
          style={{
            fontFamily: GEIST_MONO,
            color: C.green,
            marginTop: 22,
            fontSize: 24,
            opacity: interpolate(local, [104, 126], [0, 1], clamp),
          }}
        >
          PROFIT FLOOR PASSED
        </div>
      </div>
    </AbsoluteFill>
  );
}

function VerifierDemo({ local }: { local: number }) {
  return (
    <AbsoluteFill
      style={{
        background: C.dark,
        color: C.paper,
        opacity: productFade(local),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 70,
          fontFamily: GEIST_MONO,
          color: "#FCA5A5",
          fontSize: 22,
        }}
      >
        02 · VERIFIER
      </div>
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 118,
          fontSize: 68,
          letterSpacing: "-.05em",
        }}
      >
        Check the person behind the MC.
      </div>
      <div
        style={{
          position: "absolute",
          left: 105,
          right: 105,
          top: 315,
          height: 390,
          display: "grid",
          gridTemplateColumns: "1fr 130px 1fr",
          alignItems: "center",
        }}
      >
        <div
          style={{
            padding: 38,
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 22,
            background: C.raised,
            opacity: interpolate(local, [18, 45], [0, 1], clamp),
            translate: `${interpolate(local, [18, 48], [-70, 0], clamp)}px 0`,
          }}
        >
          <div style={{ fontFamily: GEIST_MONO, color: C.green, fontSize: 22 }}>
            BROKER AUTHORITY
          </div>
          <div style={{ fontSize: 52, marginTop: 22 }}>MC 739201</div>
          <div
            style={{
              fontFamily: GEIST_MONO,
              color: C.green,
              fontSize: 28,
              marginTop: 60,
            }}
          >
            ACTIVE ✓
          </div>
        </div>
        <div style={{ display: "grid", placeItems: "center" }}>
          <div
            style={{
              width: 3,
              height: interpolate(local, [40, 85], [0, 260], clamp),
              background: C.red,
            }}
          />
        </div>
        <div
          style={{
            padding: 38,
            border: "1px solid rgba(248,113,113,.38)",
            borderRadius: 22,
            background: "rgba(127,29,29,.14)",
            opacity: interpolate(local, [48, 75], [0, 1], clamp),
            translate: `${interpolate(local, [48, 78], [70, 0], clamp)}px 0`,
          }}
        >
          <div
            style={{ fontFamily: GEIST_MONO, color: "#FCA5A5", fontSize: 22 }}
          >
            POSTED PHONE
          </div>
          <div style={{ fontFamily: GEIST_MONO, fontSize: 49, marginTop: 22 }}>
            (419) 555-0142
          </div>
          <div
            style={{
              fontFamily: GEIST_MONO,
              color: C.red,
              fontSize: 28,
              marginTop: 60,
            }}
          >
            NO MATCH ✕
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 100,
          textAlign: "center",
          fontFamily: GEIST_MONO,
          fontSize: 132,
          color: C.red,
          letterSpacing: "-.07em",
          opacity: interpolate(local, [82, 108], [0, 1], clamp),
          scale: interpolate(local, [82, 112], [1.18, 1], {
            ...clamp,
            easing: ease,
          }),
          filter: `blur(${interpolate(local, [82, 105], [12, 0], clamp)}px)`,
        }}
      >
        REFUSE
      </div>
    </AbsoluteFill>
  );
}

function CloserDemo({ local }: { local: number }) {
  const rates = [1450, 1540, 1620];
  return (
    <AbsoluteFill
      style={{ background: "#FFFDF9", opacity: productFade(local) }}
    >
      <div
        style={{
          position: "absolute",
          right: 105,
          top: 70,
          fontFamily: GEIST_MONO,
          color: C.green,
          fontSize: 22,
        }}
      >
        03 · CLOSER
      </div>
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 112,
          width: 720,
          fontSize: 68,
          letterSpacing: "-.05em",
          lineHeight: 1.02,
        }}
      >
        Keep the rate moving.
      </div>
      <div style={{ position: "absolute", left: 105, top: 330, width: 640 }}>
        {[
          "Broker: $1,450 is the max.",
          "Closer: I can hold the truck for $1,620.",
          "Broker: Send the rate con.",
        ].map((message, i) => (
          <div
            key={message}
            style={{
              width: i === 1 ? 560 : 420,
              marginLeft: i === 1 ? 78 : i === 2 ? 205 : 0,
              marginTop: i === 0 ? 0 : 24,
              padding: "20px 24px",
              borderRadius:
                i === 1 ? "22px 22px 5px 22px" : "22px 22px 22px 5px",
              background: i === 1 ? C.dark : C.white,
              color: i === 1 ? C.paper : C.body,
              border: `1px solid ${i === 1 ? C.dark : C.border}`,
              fontSize: 24,
              opacity: interpolate(
                local,
                [18 + i * 29, 40 + i * 29],
                [0, 1],
                clamp,
              ),
              translate: `${interpolate(local, [18 + i * 29, 42 + i * 29], [i === 1 ? 70 : -70, 0], clamp)}px 0`,
            }}
          >
            {message}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          right: 180,
          top: 285,
          width: 700,
          height: 590,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 70,
            top: 0,
            bottom: 0,
            width: 2,
            background: C.border,
          }}
        />
        {rates.map((rate, i) => (
          <div
            key={rate}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 70 + i * 175,
              display: "flex",
              alignItems: "center",
              gap: 35,
              opacity: interpolate(
                local,
                [28 + i * 28, 50 + i * 28],
                [0, 1],
                clamp,
              ),
              translate: `0 ${interpolate(local, [28 + i * 28, 52 + i * 28], [40, 0], clamp)}px`,
            }}
          >
            <div
              style={{
                width: 142,
                height: 142,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: i === 2 ? C.green : C.white,
                color: i === 2 ? C.paper : C.muted,
                border: `2px solid ${i === 2 ? C.green : C.border}`,
                fontFamily: GEIST_MONO,
                fontSize: 26,
              }}
            >
              ${rate.toLocaleString()}
            </div>
            <div
              style={{
                fontSize: i === 2 ? 42 : 27,
                color: i === 2 ? C.green : C.muted,
              }}
            >
              {i === 0 ? "offer" : i === 1 ? "counter" : "rate locked"}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function PaydayDemo({ local }: { local: number }) {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(120deg,#171719,#2A292C)",
        color: C.paper,
        opacity: productFade(local),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 70,
          fontFamily: GEIST_MONO,
          color: C.orange,
          fontSize: 22,
        }}
      >
        04 · PAYDAY
      </div>
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 118,
          fontSize: 68,
          letterSpacing: "-.05em",
        }}
      >
        Turn waiting into proof.
      </div>
      <div style={{ position: "absolute", left: 110, right: 110, top: 360 }}>
        <div style={{ height: 5, background: C.raised, borderRadius: 8 }}>
          <div
            style={{
              height: "100%",
              width: `${interpolate(local, [18, 98], [0, 100], clamp)}%`,
              background: C.orange,
              boxShadow: "0 0 24px rgba(249,115,22,.55)",
            }}
          />
        </div>
        {[
          { x: 0, time: "06:40", label: "GPS IN" },
          { x: 36, time: "09:00", label: "FREE TIME ENDS" },
          { x: 100, time: "13:15", label: "GPS OUT" },
        ].map((point, i) => (
          <div
            key={point.time}
            style={{
              position: "absolute",
              left: `${point.x}%`,
              top: -15,
              translate:
                point.x === 100
                  ? "-100% 0"
                  : point.x === 36
                    ? "-50% 0"
                    : undefined,
              opacity: interpolate(
                local,
                [25 + i * 27, 45 + i * 27],
                [0, 1],
                clamp,
              ),
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background: i === 1 ? C.dark : C.orange,
                border: `4px solid ${i === 1 ? C.muted : "#FDBA74"}`,
                margin: "0 auto",
              }}
            />
            <div
              style={{
                fontFamily: GEIST_MONO,
                fontSize: 31,
                marginTop: 22,
                textAlign: "center",
              }}
            >
              {point.time}
            </div>
            <div
              style={{
                fontFamily: GEIST_MONO,
                fontSize: 17,
                color: C.muted,
                marginTop: 7,
                whiteSpace: "nowrap",
              }}
            >
              {point.label}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 110,
          bottom: 105,
          display: "flex",
          gap: 18,
        }}
      >
        {["GEOFENCE", "TIMESTAMPS", "RATE CON"].map((proof, i) => (
          <div
            key={proof}
            style={{
              padding: "15px 20px",
              border: "1px solid rgba(255,255,255,.15)",
              borderRadius: 10,
              fontFamily: GEIST_MONO,
              color: i === 2 ? C.orange : "#B8B8B3",
              opacity: interpolate(
                local,
                [82 + i * 14, 100 + i * 14],
                [0, 1],
                clamp,
              ),
              translate: `0 ${interpolate(local, [82 + i * 14, 103 + i * 14], [25, 0], clamp)}px`,
            }}
          >
            {proof} ✓
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          right: 110,
          bottom: 80,
          textAlign: "right",
          opacity: interpolate(local, [93, 120], [0, 1], clamp),
          translate: `${interpolate(local, [93, 122], [65, 0], clamp)}px 0`,
        }}
      >
        <div style={{ fontFamily: GEIST_MONO, color: C.muted, fontSize: 22 }}>
          DETENTION INVOICE
        </div>
        <div
          style={{
            fontFamily: GEIST_MONO,
            color: C.orange,
            fontSize: 108,
            letterSpacing: "-.08em",
            marginTop: 9,
          }}
        >
          $292
        </div>
        <div style={{ fontFamily: GEIST_MONO, color: C.green, fontSize: 25 }}>
          FILED WITH PROOF
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Product() {
  const frame = useCurrentFrame();
  const active = Math.min(3, Math.floor(frame / sec(5)));
  const local = frame - active * sec(5);
  return (
    <Shell>
      {active === 0 && <FinderDemo local={local} />}
      {active === 1 && <VerifierDemo local={local} />}
      {active === 2 && <CloserDemo local={local} />}
      {active === 3 && <PaydayDemo local={local} />}
    </Shell>
  );
}

function Close() {
  const frame = useCurrentFrame();
  return (
    <Shell dark>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 44%,rgba(249,115,22,.16),transparent 26%),#1E1E1E",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              opacity: interpolate(frame, [6, 36], [0, 1], clamp),
              scale: interpolate(frame, [6, 42], [0.72, 1], {
                ...clamp,
                easing: ease,
              }),
              filter: `drop-shadow(0 0 ${interpolate(frame, [18, 120], [0, 34], clamp)}px rgba(249,115,22,.35))`,
            }}
          >
            <Logo size={132} />
          </div>
          <div
            style={{
              fontSize: 74,
              fontWeight: 400,
              letterSpacing: "-.055em",
              marginTop: 35,
              opacity: interpolate(frame, [32, 62], [0, 1], clamp),
              translate: `0 ${interpolate(frame, [32, 62], [24, 0], clamp)}px`,
            }}
          >
            Sentinel
          </div>
          <div style={{ marginTop: 22, width: 1120 }}>
            <WordReveal
              text="Four agents run the back office for one-truck carriers."
              start={62}
              step={9}
              fontSize={38}
              align="center"
            />
          </div>
          <div
            style={{
              fontFamily: GEIST_MONO,
              fontSize: 22,
              color: C.orange,
              marginTop: 34,
              letterSpacing: ".08em",
              opacity: interpolate(frame, [158, 195], [0, 1], clamp),
            }}
          >
            FIND · VERIFY · NEGOTIATE · GET PAID
          </div>
        </div>
      </div>
    </Shell>
  );
}

export const SilentStory = () => (
  <AbsoluteFill
    style={{ background: C.paper, fontFamily: INTER, fontWeight: 400 }}
  >
    <style>{`b, strong { font-weight: 400 !important; }`}</style>
    <Audio
      src={staticFile("emotional-score.mp3")}
      trimAfter={sec(110)}
      volume={(f) =>
        interpolate(f, [0, 45, sec(102), sec(110)], [0, 0.92, 0.92, 0], clamp)
      }
    />
    {TIMELINE.map(({ from, duration, component: Comp }) => (
      <Sequence
        key={from}
        name={`Scene ${from}s`}
        from={sec(from)}
        durationInFrames={sec(duration)}
      >
        <SceneFade duration={sec(duration)} noFadeIn={from === 0}>
          <Comp />
        </SceneFade>
      </Sequence>
    ))}
  </AbsoluteFill>
);

const cloudRows = [
  { x: 120, y: 118, s: 1 },
  { x: 470, y: 66, s: 1.35 },
  { x: 790, y: 148, s: 0.9 },
  { x: 980, y: 58, s: 0.72 },
  { x: 250, y: 300, s: 0.7 },
  { x: 1090, y: 280, s: 0.8 },
];

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity="0.95">
      <rect x="24" y="0" width="70" height="18" fill="#eaf7ff" />
      <rect x="8" y="18" width="120" height="22" fill="#f7fcff" />
      <rect x="0" y="40" width="150" height="18" fill="#dff2fd" />
      <rect x="96" y="30" width="38" height="10" fill="#d2ecfb" />
      <rect x="36" y="8" width="40" height="10" fill="#ffffff" />
      <rect x="120" y="48" width="34" height="10" fill="#cce8fa" />
      <rect x="42" y="58" width="64" height="8" fill="#e7f7ff" />
    </g>
  );
}

const trees = [
  { x: 1190, y: 120, s: 1.05 },
  { x: 1360, y: 260, s: 0.72 },
  { x: 80, y: 405, s: 0.65 },
];

function Tree({ x, y, s = 1, className }: { x: number; y: number; s?: number; className?: string }) {
  return (
    <g className={className} transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="54" y="158" width="24" height="190" fill="#6a5136" />
      <rect x="46" y="158" width="8" height="190" fill="#806447" />
      <rect x="62" y="182" width="10" height="166" fill="#513d28" />
      <rect x="18" y="74" width="96" height="98" fill="#2f6f33" />
      <rect x="0" y="98" width="34" height="66" fill="#3f8b3d" />
      <rect x="112" y="88" width="38" height="82" fill="#357a35" />
      <rect x="30" y="48" width="70" height="40" fill="#4a9b43" />
      <rect x="46" y="26" width="48" height="34" fill="#5cae4c" />
      <rect x="14" y="64" width="28" height="22" fill="#5cae4c" />
      <rect x="100" y="58" width="34" height="26" fill="#3f8b3d" />
      <rect x="34" y="110" width="22" height="18" fill="#66b956" />
      <rect x="78" y="102" width="26" height="16" fill="#4a9b43" />
      <rect x="22" y="140" width="30" height="14" fill="#2f6f33" />
      <rect x="86" y="140" width="34" height="16" fill="#2a642e" />
      <rect x="34" y="178" width="16" height="14" fill="#6a5136" />
      <rect x="16" y="206" width="22" height="10" fill="#2f6f33" />
      <rect x="96" y="212" width="30" height="10" fill="#2a642e" />
    </g>
  );
}

const cityBlocks = [
  { x: 30, y: 438, w: 26, h: 58, c: "#9db8ca" },
  { x: 62, y: 422, w: 20, h: 74, c: "#8caac0" },
  { x: 88, y: 448, w: 30, h: 48, c: "#a8c0d1" },
  { x: 124, y: 410, w: 22, h: 86, c: "#8caac0" },
  { x: 152, y: 440, w: 34, h: 56, c: "#9db8ca" },
  { x: 192, y: 426, w: 18, h: 70, c: "#8caac0" },
  { x: 216, y: 452, w: 28, h: 44, c: "#a8c0d1" },
  { x: 250, y: 400, w: 20, h: 96, c: "#7f9fb6" },
  { x: 276, y: 438, w: 32, h: 58, c: "#9db8ca" },
  { x: 314, y: 424, w: 22, h: 72, c: "#8caac0" },
  { x: 342, y: 446, w: 26, h: 50, c: "#a8c0d1" },
  { x: 374, y: 412, w: 18, h: 84, c: "#8caac0" },
  { x: 398, y: 440, w: 30, h: 56, c: "#9db8ca" },
  { x: 434, y: 428, w: 20, h: 68, c: "#8caac0" },
  { x: 460, y: 450, w: 26, h: 46, c: "#a8c0d1" },
  { x: 492, y: 418, w: 18, h: 78, c: "#8caac0" },
  { x: 516, y: 442, w: 28, h: 54, c: "#9db8ca" },
];

function City() {
  return (
    <g>
      {cityBlocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.c} />
          {Array.from({ length: Math.max(1, Math.floor(b.h / 18)) }).map((_, r) => (
            <rect
              key={r}
              x={b.x + 5}
              y={b.y + 8 + r * 16}
              width={Math.max(4, b.w - 12)}
              height="3"
              fill="rgba(255,255,255,0.38)"
            />
          ))}
        </g>
      ))}
      <rect x="166" y="360" width="8" height="52" fill="#7f9fb6" />
      <rect x="160" y="352" width="20" height="12" fill="#7f9fb6" />
      <rect x="168" y="334" width="4" height="20" fill="#7f9fb6" />
    </g>
  );
}

const flowers = [
  { x: 300, y: 618, c: "#f1cf55" },
  { x: 742, y: 704, c: "#f1cf55" },
  { x: 1030, y: 664, c: "#f1cf55" },
  { x: 1120, y: 700, c: "#f1cf55" },
  { x: 1206, y: 628, c: "#e7b94c" },
];

function Flower({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="4" y="8" width="2" height="22" fill="#3a7d2e" />
      <rect x="0" y="4" width="10" height="10" fill={c} />
      <rect x="3" y="1" width="4" height="4" fill="#fff0a8" />
      <rect x="1" y="14" width="3" height="3" fill="#2f6f33" />
      <rect x="8" y="16" width="3" height="3" fill="#2f6f33" />
    </g>
  );
}

export function HeroLandscape({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 780"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#48acf0" />
          <stop offset="58%" stopColor="#7bcdf8" />
          <stop offset="100%" stopColor="#b9e6fb" />
        </linearGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#78c44b" />
          <stop offset="100%" stopColor="#3d8f34" />
        </linearGradient>
        <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8dd8fb" />
          <stop offset="100%" stopColor="#5ab9ef" />
        </linearGradient>
      </defs>

      <rect width="1440" height="780" fill="url(#sky)" />
      <circle cx="1080" cy="92" r="52" fill="#fff6cf" opacity="0.5" />

      {cloudRows.map((c, i) => (
        <Cloud key={i} {...c} />
      ))}

      <g className="hero-city">
        <City />
      </g>

      <path
        d="M0 470 C 150 430 260 452 390 468 C 540 486 650 430 790 448 C 950 468 1090 432 1200 458 C 1310 484 1380 462 1440 470 L1440 780 L0 780 Z"
        fill="#6dbb43"
      />
      <path
        d="M0 520 C 170 478 300 512 460 520 C 620 528 720 488 880 506 C 1040 524 1180 494 1300 512 C 1370 522 1410 516 1440 520 L1440 780 L0 780 Z"
        fill="url(#grass)"
      />
      <path
        d="M0 596 C 180 560 300 594 470 592 C 640 590 780 552 940 574 C 1100 596 1250 562 1440 590 L1440 780 L0 780 Z"
        fill="#3d8f34"
      />
      <path
        d="M0 660 C 220 626 360 654 540 656 C 720 658 860 620 1040 644 C 1200 666 1330 638 1440 656 L1440 780 L0 780 Z"
        fill="#2f7c2b"
      />

      {trees.map((t, i) => (
        <Tree key={i} {...t} className={i === 2 ? "hero-tree hero-tree-left" : "hero-tree"} />
      ))}

      <g className="hero-laptop" transform="translate(742 424)">
        <rect x="0" y="0" width="292" height="184" rx="6" fill="#2f3230" />
        <rect x="8" y="8" width="276" height="162" rx="3" fill="#3f4340" />
        <rect x="14" y="14" width="264" height="146" fill="url(#screen)" />
        <rect x="30" y="30" width="104" height="10" fill="#ffffff" opacity="0.78" />
        <rect x="30" y="50" width="150" height="8" fill="#ffffff" opacity="0.6" />
        <rect x="30" y="70" width="86" height="8" fill="#ffffff" opacity="0.5" />
        <rect x="30" y="96" width="210" height="46" fill="#ffffff" opacity="0.18" />
        <rect x="38" y="104" width="92" height="8" fill="#ffffff" opacity="0.55" />
        <rect x="38" y="118" width="128" height="6" fill="#ffffff" opacity="0.4" />
        <rect x="-18" y="184" width="328" height="18" rx="3" fill="#d7d9d5" />
        <rect x="-6" y="202" width="304" height="9" rx="2" fill="#aeb1ac" />
        <rect x="10" y="211" width="272" height="5" rx="2" fill="#8f938d" />
        <rect x="120" y="190" width="52" height="5" fill="#b9bcb7" />
      </g>

      <g className="hero-notebook" transform="translate(930 622)">
        <rect x="0" y="0" width="186" height="112" rx="5" fill="#7a5c37" />
        <rect x="8" y="8" width="170" height="96" rx="3" fill="#a37d4b" />
        <rect x="20" y="22" width="82" height="9" fill="#c9a369" opacity="0.8" />
        <rect x="20" y="40" width="120" height="6" fill="#c9a369" opacity="0.55" />
        <rect x="20" y="54" width="100" height="6" fill="#c9a369" opacity="0.5" />
        <rect x="20" y="68" width="130" height="6" fill="#c9a369" opacity="0.45" />
        <rect x="146" y="10" width="8" height="94" fill="#5e462b" />
      </g>

      {flowers.map((f, i) => (
        <Flower key={i} {...f} />
      ))}

      <g transform="translate(516 700)">
        <rect x="0" y="0" width="20" height="14" rx="3" fill="#d64535" />
        <rect x="4" y="-4" width="12" height="6" rx="2" fill="#b93528" />
        <rect x="4" y="3" width="4" height="4" fill="#2b1a18" />
        <rect x="12" y="3" width="4" height="4" fill="#2b1a18" />
        <rect x="-4" y="6" width="4" height="2" fill="#2b1a18" />
        <rect x="20" y="6" width="4" height="2" fill="#2b1a18" />
      </g>

      <g opacity="0.45">
        <rect x="42" y="742" width="120" height="3" fill="#8edc62" />
        <rect x="210" y="728" width="80" height="3" fill="#8edc62" />
        <rect x="360" y="752" width="140" height="3" fill="#8edc62" />
        <rect x="600" y="736" width="110" height="3" fill="#8edc62" />
        <rect x="860" y="752" width="150" height="3" fill="#8edc62" />
        <rect x="1100" y="736" width="110" height="3" fill="#8edc62" />
      </g>
    </svg>
  );
}

export function AuthLandscape({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 760 760"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <defs>
        <linearGradient id="auth-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f9fe3" />
          <stop offset="60%" stopColor="#79c9f2" />
          <stop offset="100%" stopColor="#b8e2f8" />
        </linearGradient>
      </defs>
      <rect width="760" height="760" fill="url(#auth-sky)" />
      {[
        { x: 40, y: 90, s: 0.8 },
        { x: 300, y: 140, s: 1.05 },
        { x: 520, y: 60, s: 0.65 },
      ].map((c, i) => (
        <Cloud key={i} {...c} />
      ))}
      <path
        d="M0 450 C 120 410 220 440 330 452 C 460 466 560 416 660 442 C 710 454 740 446 760 452 L760 760 L0 760 Z"
        fill="#6dbb43"
      />
      <path
        d="M0 540 C 130 500 240 540 360 540 C 480 540 560 508 700 532 L760 540 L760 760 L0 760 Z"
        fill="#3d8f34"
      />
      <path
        d="M0 640 C 180 610 320 646 480 640 C 590 636 690 612 760 628 L760 760 L0 760 Z"
        fill="#2f7c2b"
      />
      <g transform="translate(470 300) scale(0.72)">
        <Tree x={0} y={0} />
      </g>
      <g transform="translate(300 510) scale(0.64)">
        <rect x="0" y="0" width="292" height="184" rx="6" fill="#2f3230" />
        <rect x="8" y="8" width="276" height="162" rx="3" fill="#3f4340" />
        <rect x="14" y="14" width="264" height="146" fill="#7bcdf8" />
        <rect x="30" y="30" width="104" height="10" fill="#ffffff" opacity="0.75" />
        <rect x="30" y="50" width="150" height="8" fill="#ffffff" opacity="0.55" />
        <rect x="-18" y="184" width="328" height="18" rx="3" fill="#d7d9d5" />
      </g>
      {[
        { x: 120, y: 620, c: "#f1cf55" },
        { x: 640, y: 600, c: "#f1cf55" },
        { x: 220, y: 700, c: "#f1cf55" },
      ].map((f, i) => (
        <Flower key={i} {...f} />
      ))}
    </svg>
  );
}

export function BlueDecor({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <g opacity="0.85">
        {[
          { x: 40, y: 120, s: 0.9 },
          { x: 200, y: 60, s: 0.6 },
          { x: 1180, y: 90, s: 0.9 },
          { x: 1300, y: 220, s: 0.55 },
        ].map((c, i) => (
          <Cloud key={i} {...c} />
        ))}
      </g>
      <g transform="translate(-40 330)">
        <Tree x={0} y={0} s={1.3} />
      </g>
      <g transform="translate(1240 330)">
        <Tree x={0} y={0} s={1.2} />
      </g>
      <path
        d="M0 560 C 160 512 260 550 390 552 C 520 554 600 520 740 538 C 880 556 1000 522 1140 544 C 1260 562 1360 540 1440 552 L1440 640 L0 640 Z"
        fill="#4c9f38"
        opacity="0.55"
      />
      <path
        d="M0 600 C 200 570 340 606 520 600 C 700 594 840 566 1020 588 C 1180 608 1320 584 1440 596 L1440 640 L0 640 Z"
        fill="#3d8f34"
        opacity="0.45"
      />
    </svg>
  );
}

export function FooterSky({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 500"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <defs>
        <linearGradient id="footer-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5f5f2" />
          <stop offset="70%" stopColor="#e9f3fb" />
          <stop offset="100%" stopColor="#cfe8f8" />
        </linearGradient>
      </defs>
      <rect width="1440" height="500" fill="url(#footer-sky)" />
      {[
        { x: 90, y: 80, s: 0.95 },
        { x: 360, y: 150, s: 0.6 },
        { x: 980, y: 60, s: 0.8 },
        { x: 1260, y: 140, s: 0.55 },
      ].map((c, i) => (
        <Cloud key={i} {...c} />
      ))}
      <path
        d="M0 400 C 140 356 250 390 380 396 C 520 402 620 370 760 386 C 900 402 1020 370 1160 388 C 1280 404 1370 384 1440 392 L1440 500 L0 500 Z"
        fill="#d7efc9"
      />
      <path
        d="M0 448 C 180 414 320 446 480 444 C 640 442 760 412 920 430 C 1080 448 1220 420 1340 438 C 1390 446 1420 440 1440 444 L1440 500 L0 500 Z"
        fill="#bfe6ae"
      />
    </svg>
  );
}

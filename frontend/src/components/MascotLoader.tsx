'use client';

import { useEffect, useState } from 'react';

const MASCOTS = [
  { delay: '0s',    duration: '7s',  top: '60%', size: 64,  dir: 1  },
  { delay: '2s',    duration: '9s',  top: '72%', size: 48,  dir: -1 },
  { delay: '1.2s',  duration: '6s',  top: '50%', size: 40,  dir: 1  },
  { delay: '3.5s',  duration: '8s',  top: '78%', size: 56,  dir: -1 },
];

export default function MascotLoader({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) setVisible(true);
    else {
      const t = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(t);
    }
  }, [active]);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes walkRight {
          0%   { left: -80px;  transform: scaleX(1); }
          49%  { left: 110%;   transform: scaleX(1); }
          50%  { left: 110%;   transform: scaleX(-1); }
          99%  { left: -80px;  transform: scaleX(-1); }
          100% { left: -80px;  transform: scaleX(1); }
        }
        @keyframes walkLeft {
          0%   { right: -80px; transform: scaleX(-1); }
          49%  { right: 110%;  transform: scaleX(-1); }
          50%  { right: 110%;  transform: scaleX(1); }
          99%  { right: -80px; transform: scaleX(1); }
          100% { right: -80px; transform: scaleX(-1); }
        }
        @keyframes bounce {
          0%, 100% { margin-top: 0px; }
          50%       { margin-top: -10px; }
        }
        .mascot-walk {
          position: fixed;
          pointer-events: none;
          z-index: 20;
          animation: bounce 0.6s ease-in-out infinite;
          transition: opacity 0.5s;
        }
      `}</style>

      {MASCOTS.map((m, i) => (
        <div
          key={i}
          className="mascot-walk"
          style={{
            top: m.top,
            width: m.size,
            height: m.size,
            opacity: active ? 0.85 : 0,
            animationDelay: m.delay,
            animationDuration: '0.5s',
            ...(m.dir === 1
              ? { animation: `walkRight ${m.duration} ${m.delay} linear infinite, bounce 0.5s ease-in-out infinite` }
              : { animation: `walkLeft  ${m.duration} ${m.delay} linear infinite, bounce 0.5s ease-in-out infinite` }),
          }}
        >
          <img
            src="/mascot.png"
            alt=""
            style={{
              width: m.size,
              height: m.size,
              objectFit: 'contain',
              transform: m.dir === -1 ? 'scaleX(-1)' : undefined,
            }}
          />
        </div>
      ))}
    </>
  );
}

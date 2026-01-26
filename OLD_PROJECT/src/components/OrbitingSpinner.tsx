import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";

const loadingTexts = ["feeling", "hearing", "listening", "tuning"];

// Tilted ellipse path coordinates (pre-calculated for smooth orbit)
// Ellipse: a=38, b=16, tilted -25 degrees
const orbitPath = (() => {
  const a = 38, b = 16, tilt = -25 * Math.PI / 180;
  const points = 60;
  const coords: { x: number; y: number }[] = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 2 * Math.PI;
    const ex = a * Math.cos(t);
    const ey = b * Math.sin(t);
    // Rotate by tilt angle
    coords.push({
      x: ex * Math.cos(tilt) - ey * Math.sin(tilt),
      y: ex * Math.sin(tilt) + ey * Math.cos(tilt),
    });
  }
  return coords;
})();

export function OrbitingSpinner() {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTextIndex((prev) => (prev + 1) % loadingTexts.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px",
        padding: "40px 0",
      }}
    >
      {/* Orbiting Spinner */}
      <div
        style={{
          position: "relative",
          width: "90px",
          height: "90px",
        }}
      >
        {/* Planet behind (z-index 0) */}
        <motion.div
          animate={{
            x: orbitPath.map(p => p.x),
            y: orbitPath.map(p => p.y),
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "12px",
            height: "12px",
            marginTop: "-6px",
            marginLeft: "-6px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #00d4ff, #0099ff)",
            boxShadow: "0 0 0 2px rgba(0, 0, 0, 0.8), 0 0 12px rgba(0, 212, 255, 0.6), 0 0 24px rgba(0, 212, 255, 0.3)",
            zIndex: 0,
          }}
        />

        {/* Main Circle - filled */}
        <div
          style={{
            position: "absolute",
            inset: "20px",
            borderRadius: "50%",
            background: "radial-gradient(circle at 30% 30%, rgba(0, 40, 60, 0.95), rgba(0, 15, 25, 1))",
            border: "2px solid rgba(0, 212, 255, 0.3)",
            zIndex: 1,
          }}
        />

        {/* Planet in front (z-index 2) - only visible on front half */}
        <motion.div
          animate={{
            x: orbitPath.map(p => p.x),
            y: orbitPath.map(p => p.y),
            opacity: orbitPath.map((_, i) => {
              // Visible when y > 0 (front of orbit)
              const t = (i / (orbitPath.length - 1)) * 2 * Math.PI;
              const ey = 16 * Math.sin(t);
              const tilt = -25 * Math.PI / 180;
              const rotatedY = 38 * Math.cos(t) * Math.sin(tilt) + ey * Math.cos(tilt);
              return rotatedY > -2 ? 1 : 0;
            }),
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "12px",
            height: "12px",
            marginTop: "-6px",
            marginLeft: "-6px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #00d4ff, #0099ff)",
            boxShadow: "0 0 0 2px rgba(0, 0, 0, 0.8), 0 0 12px rgba(0, 212, 255, 0.6), 0 0 24px rgba(0, 212, 255, 0.3)",
            zIndex: 2,
          }}
        />
      </div>

      {/* Animated Text */}
      <div
        style={{
          height: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.p
            key={currentTextIndex}
            initial={{ opacity: 0, filter: "blur(10px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(10px)" }}
            transition={{ duration: 0.5 }}
            style={{
              color: "#00d4ff",
              fontSize: "18px",
              fontWeight: 600,
              margin: 0,
              textTransform: "lowercase",
              letterSpacing: "1px",
            }}
          >
            {loadingTexts[currentTextIndex]}...
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}


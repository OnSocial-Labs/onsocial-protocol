'use client'

import { motion } from 'framer-motion'

export function GradientMesh() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Animated gradient orbs - Slower, more organic movement */}
      {/* Neon Green orb #00ec96 */}
      <motion.div
        animate={{
          x: [0, 80, 0],
          y: [0, -60, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          background: 'rgba(0, 236, 150, 0.15)',
        }}
        className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full blur-3xl"
      />
      {/* Purple orb #A05CFF */}
      <motion.div
        animate={{
          x: [0, -70, 0],
          y: [0, 100, 0],
          scale: [1, 1.25, 1],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 3,
        }}
        style={{
          background: 'rgba(160, 92, 255, 0.12)',
        }}
        className="absolute top-1/4 right-1/4 w-[450px] h-[450px] rounded-full blur-3xl"
      />
      {/* Neon Green orb 2 */}
      <motion.div
        animate={{
          x: [0, 90, 0],
          y: [0, -40, 0],
          scale: [1, 1.3, 1],
        }}
        transition={{
          duration: 32,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 6,
        }}
        style={{
          background: 'rgba(0, 236, 150, 0.1)',
        }}
        className="absolute bottom-0 left-1/4 w-[480px] h-[480px] rounded-full blur-3xl"
      />
      {/* Purple orb 2 */}
      <motion.div
        animate={{
          x: [0, 100, 0],
          y: [0, -70, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 9,
        }}
        style={{
          background: 'rgba(160, 92, 255, 0.08)',
        }}
        className="absolute top-1/2 left-1/3 w-[420px] h-[420px] rounded-full blur-3xl"
      />
    </div>
  )
}

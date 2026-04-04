"use client";

import { motion } from "framer-motion";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  type EdgeProps,
} from "@xyflow/react";

export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const isActive = (data as { active?: boolean } | undefined)?.active ?? false;
  const isHighlighted = (data as { highlighted?: boolean } | undefined)?.highlighted ?? false;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: isHighlighted ? "#6366f1" : isActive ? "#818cf8" : "#374151",
          strokeWidth: isHighlighted ? 2.5 : isActive ? 2 : 1.5,
          transition: "all 0.3s ease",
        }}
        markerEnd={markerEnd}
      />

      {/* Animated flow dot */}
      {isActive && (
        <EdgeLabelRenderer>
          <motion.div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${sourceX}px, ${sourceY}px)`,
              pointerEvents: "none",
            }}
            animate={{
              x: [0, targetX - sourceX],
              y: [0, targetY - sourceY],
            }}
            transition={{
              duration: 2,
              ease: "linear",
              repeat: Infinity,
              repeatDelay: 0.5,
            }}
          >
            <motion.div
              className="h-2 w-2 rounded-full bg-indigo-500"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.8, 1, 0.8],
              }}
              transition={{
                duration: 1,
                ease: "easeInOut",
                repeat: Infinity,
              }}
            />
          </motion.div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

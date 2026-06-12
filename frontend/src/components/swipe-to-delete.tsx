"use client";

import { useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Trash2 } from "lucide-react";

interface SwipeToDeleteProps {
  onDelete: () => void;
  /** Fires on tap/click when the row is not swiped open (works with drag on touch). */
  onPress?: () => void;
  children: React.ReactNode;
  /** Distinct accessible name so swipe delete does not clash with in-form delete buttons. */
  deleteAriaLabel?: string;
}

const DELETE_THRESHOLD = -72;

export function SwipeToDelete({
  onDelete,
  onPress,
  children,
  deleteAriaLabel = "Swipe to delete",
}: SwipeToDeleteProps) {
  const x = useMotionValue(0);
  const [swiped, setSwiped] = useState(false);

  const deleteOpacity = useTransform(x, [0, DELETE_THRESHOLD], [0, 1]);
  const deleteScale = useTransform(x, [0, DELETE_THRESHOLD], [0.7, 1]);

  const handleDragEnd = () => {
    if (x.get() <= DELETE_THRESHOLD) {
      setSwiped(true);
      animate(x, DELETE_THRESHOLD, { type: "spring", stiffness: 300, damping: 30 });
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 35 });
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    animate(x, -400, {
      type: "tween",
      duration: 0.25,
      onComplete: onDelete,
    });
  };

  const handleTapOutside = () => {
    if (swiped) {
      setSwiped(false);
      animate(x, 0, { type: "spring", stiffness: 400, damping: 35 });
    }
  };

  return (
    <div className="relative overflow-hidden" onClick={swiped ? handleTapOutside : undefined}>
      {/* Delete button revealed behind */}
      <motion.div
        style={{ opacity: deleteOpacity, scale: deleteScale }}
        className="absolute right-0 top-0 bottom-0 w-[72px] flex items-center justify-center bg-red-500/90 rounded-r-lg"
      >
        <button
          onClick={handleDelete}
          aria-label={deleteAriaLabel}
          className="flex flex-col items-center gap-0.5"
        >
          <Trash2 className="h-4 w-4 text-white" strokeWidth={1.5} />
          <span className="text-[0.6rem] text-white font-medium" aria-hidden="true">Delete</span>
        </button>
      </motion.div>

      {/* Draggable content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: DELETE_THRESHOLD, right: 0 }}
        dragElastic={{ left: 0.1, right: 0.05 }}
        dragDirectionLock
        style={{ x, touchAction: "pan-y" }}
        onDragEnd={handleDragEnd}
        onTap={() => {
          if (!swiped && onPress) onPress();
        }}
        role={onPress ? "button" : undefined}
        tabIndex={onPress ? 0 : undefined}
        onKeyDown={
          onPress
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!swiped) onPress();
                }
              }
            : undefined
        }
        className={`relative bg-transparent ${
          onPress ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        {children}
      </motion.div>
    </div>
  );
}

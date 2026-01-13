import { useRef, useCallback, useEffect } from 'react';

interface TouchPoint {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  touchType: 'direct' | 'stylus'; // Track if finger or Apple Pencil
}

interface GestureCallbacks {
  onUndo: () => void;
  onRedo: () => void;
  onTransformChange: (scale: number, offsetX: number, offsetY: number, rotation: number) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onMultiTouchStart: () => void; // Called immediately when 2+ fingers detected (before gesture/tap detection)
}

// Increased thresholds for more forgiving detection
const TAP_MOVEMENT_THRESHOLD = 35; // px
const TAP_MAX_DURATION = 400; // ms - increased for better multi-finger detection
const GESTURE_MOVEMENT_THRESHOLD = 15; // px
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

// Check if device is mobile (disable rotation on mobile for cleaner pan/zoom)
const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Helper to get touch type (finger vs stylus)
const getTouchType = (touch: Touch): 'direct' | 'stylus' => {
  // touchType is available on iOS Safari
  return (touch as any).touchType === 'stylus' ? 'stylus' : 'direct';
};

// Helper to count only finger touches (not stylus)
const countFingerTouches = (touches: TouchList): number => {
  let count = 0;
  for (let i = 0; i < touches.length; i++) {
    if (getTouchType(touches[i]) === 'direct') count++;
  }
  return count;
};

export const useMultiTouchGestures = (
  elementRef: React.RefObject<HTMLElement>,
  callbacks: GestureCallbacks,
  initialTransform: { scale: number; offsetX: number; offsetY: number; rotation: number }
) => {
  const touchesRef = useRef<Map<number, TouchPoint>>(new Map());
  // iOS often fires touchend per-finger; we accumulate ended touches until the session ends.
  const endedTouchesRef = useRef<Map<number, TouchPoint>>(new Map());
  const maxTouchCountRef = useRef<number>(0);
  // Track if this session ever had 2+ fingers (to ignore single-finger drawing sessions)
  const isMultiTouchSessionRef = useRef(false);
  // Track when the multi-touch session started (for session-based tap timing)
  const sessionStartTimeRef = useRef<number>(0);

  const isGesturingRef = useRef(false);
  const gestureStartedRef = useRef(false);


  // RAF throttling for gesture updates
  const gestureRafIdRef = useRef<number | null>(null);
  const pendingTransformRef = useRef<{ scale: number; offsetX: number; offsetY: number; rotation: number } | null>(null);

  const gestureStartRef = useRef({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    distance: 0,
    angle: 0,
    centerX: 0,
    centerY: 0,
  });

  const transformRef = useRef(initialTransform);

  useEffect(() => {
    transformRef.current = initialTransform;
  }, [initialTransform]);

  const getDistance = (t1: TouchPoint, t2: TouchPoint) => {
    const dx = t2.x - t1.x;
    const dy = t2.y - t1.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getAngle = (t1: TouchPoint, t2: TouchPoint) => {
    return Math.atan2(t2.y - t1.y, t2.x - t1.x) * (180 / Math.PI);
  };

  const getCenter = (t1: TouchPoint, t2: TouchPoint) => {
    return {
      x: (t1.x + t2.x) / 2,
      y: (t1.y + t2.y) / 2,
    };
  };

  // Check if a touch qualifies as a tap (minimal movement only - timing handled at session level)
  const isTapMovement = (touch: TouchPoint) => {
    const dx = Math.abs(touch.x - touch.startX);
    const dy = Math.abs(touch.y - touch.startY);
    return dx < TAP_MOVEMENT_THRESHOLD && dy < TAP_MOVEMENT_THRESHOLD;
  };

  const hasMovedEnoughForGesture = (touches: Map<number, TouchPoint>) => {
    for (const touch of touches.values()) {
      const dx = Math.abs(touch.x - touch.startX);
      const dy = Math.abs(touch.y - touch.startY);
      if (dx > GESTURE_MOVEMENT_THRESHOLD || dy > GESTURE_MOVEMENT_THRESHOLD) return true;
    }
    return false;
  };

  const resetSessionTracking = () => {
    endedTouchesRef.current.clear();
    maxTouchCountRef.current = 0;
    gestureStartedRef.current = false;
    isMultiTouchSessionRef.current = false;
    sessionStartTimeRef.current = 0;
  };

  // RAF-throttled transform update
  const scheduleTransformUpdate = useCallback(() => {
    if (gestureRafIdRef.current !== null) return; // Already scheduled
    
    gestureRafIdRef.current = requestAnimationFrame(() => {
      gestureRafIdRef.current = null;
      const pending = pendingTransformRef.current;
      if (pending) {
        callbacks.onTransformChange(pending.scale, pending.offsetX, pending.offsetY, pending.rotation);
        pendingTransformRef.current = null;
      }
    });
  }, [callbacks]);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      // Only add the new touches; do not reset existing touches' start times/positions.
      const changed = e.changedTouches;
      for (let i = 0; i < changed.length; i++) {
        const t = changed[i];
        const touchType = getTouchType(t);
        touchesRef.current.set(t.identifier, {
          id: t.identifier,
          x: t.clientX,
          y: t.clientY,
          startX: t.clientX,
          startY: t.clientY,
          startTime: Date.now(),
          touchType,
        });
      }

      // Count only finger touches for gesture detection
      const fingerCount = countFingerTouches(e.touches);
      maxTouchCountRef.current = Math.max(maxTouchCountRef.current, fingerCount);

      // Mark this as a multi-touch session if 2+ FINGERS are down (ignore stylus)
      if (fingerCount >= 2) {
        // Cancel any active stroke IMMEDIATELY when second finger detected
        if (!isMultiTouchSessionRef.current) {
          sessionStartTimeRef.current = Date.now();
          callbacks.onMultiTouchStart();
        }
        isMultiTouchSessionRef.current = true;
        
        // Prepare for potential transform gesture (but don't start until movement)
        // Only use finger touches for gestures
        const fingerTouches = Array.from(touchesRef.current.values()).filter(t => t.touchType === 'direct');
        if (fingerTouches.length >= 2) {
          const [t1, t2] = fingerTouches;
          const center = getCenter(t1, t2);
          gestureStartRef.current = {
            scale: transformRef.current.scale,
            offsetX: transformRef.current.offsetX,
            offsetY: transformRef.current.offsetY,
            rotation: transformRef.current.rotation,
            distance: getDistance(t1, t2),
            angle: getAngle(t1, t2),
            centerX: center.x,
            centerY: center.y,
          };
        }
        e.preventDefault();
      }
    },
    [callbacks]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      const touches = e.touches;

      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        const existing = touchesRef.current.get(t.identifier);
        if (existing) {
          existing.x = t.clientX;
          existing.y = t.clientY;
        }
      }

      // Count only finger touches
      const fingerCount = countFingerTouches(touches);
      maxTouchCountRef.current = Math.max(maxTouchCountRef.current, fingerCount);

      // Only process gestures with 2+ finger touches
      if (fingerCount >= 2) {
        const fingerTouches = Array.from(touchesRef.current.values()).filter(t => t.touchType === 'direct');
        
        if (!gestureStartedRef.current && hasMovedEnoughForGesture(new Map(fingerTouches.map(t => [t.id, t])))) {
          gestureStartedRef.current = true;
          isGesturingRef.current = true;
          // If it became a gesture, it's not a tap session.
          endedTouchesRef.current.clear();
          callbacks.onGestureStart();
        }

        if (gestureStartedRef.current && fingerTouches.length >= 2) {
          e.preventDefault();

          const [t1, t2] = fingerTouches;

          const currentDistance = getDistance(t1, t2);
          const currentAngle = getAngle(t1, t2);
          const currentCenter = getCenter(t1, t2);

          const scaleRatio = currentDistance / gestureStartRef.current.distance;
          const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, gestureStartRef.current.scale * scaleRatio));

          // Disable rotation on mobile for cleaner pan/zoom experience
          const isMobile = isMobileDevice();
          let newRotation = gestureStartRef.current.rotation;
          if (!isMobile) {
            const angleDelta = currentAngle - gestureStartRef.current.angle;
            newRotation = gestureStartRef.current.rotation + angleDelta;
          }

          const panDeltaX = currentCenter.x - gestureStartRef.current.centerX;
          const panDeltaY = currentCenter.y - gestureStartRef.current.centerY;
          const newOffsetX = gestureStartRef.current.offsetX + panDeltaX;
          const newOffsetY = gestureStartRef.current.offsetY + panDeltaY;

          transformRef.current = {
            scale: newScale,
            offsetX: newOffsetX,
            offsetY: newOffsetY,
            rotation: newRotation,
          };

          // RAF-throttle the callback to avoid 240Hz updates
          pendingTransformRef.current = transformRef.current;
          scheduleTransformUpdate();
        }
      }
    },
    [callbacks, scheduleTransformUpdate]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      const changedTouches = e.changedTouches;
      const remainingFingerTouches = countFingerTouches(e.touches);

      // Update final positions + accumulate ended FINGER touches for this session
      for (let i = 0; i < changedTouches.length; i++) {
        const t = changedTouches[i];
        const stored = touchesRef.current.get(t.identifier);
        if (stored) {
          stored.x = t.clientX;
          stored.y = t.clientY;
          // Only track ended finger touches for tap detection
          if (stored.touchType === 'direct') {
            endedTouchesRef.current.set(t.identifier, { ...stored });
          }
        }
        touchesRef.current.delete(t.identifier);
      }

      // End transform gesture if we were in one
      if (remainingFingerTouches < 2 && isGesturingRef.current) {
        isGesturingRef.current = false;
        // Flush any pending transform update
        if (pendingTransformRef.current) {
          callbacks.onTransformChange(
            pendingTransformRef.current.scale,
            pendingTransformRef.current.offsetX,
            pendingTransformRef.current.offsetY,
            pendingTransformRef.current.rotation
          );
          pendingTransformRef.current = null;
        }
        if (gestureRafIdRef.current !== null) {
          cancelAnimationFrame(gestureRafIdRef.current);
          gestureRafIdRef.current = null;
        }
        callbacks.onGestureEnd();
      }

      // Evaluate tap gesture ONLY when all FINGER touches end AND it was a multi-touch session.
      // This prevents single-finger drawing from interfering with tap detection.
      if (remainingFingerTouches === 0) {
        // Only process tap logic if this was a multi-touch session (2+ fingers)
        if (isMultiTouchSessionRef.current) {
          // Only consider finger touches for tap detection
          const ended = Array.from(endedTouchesRef.current.values()).filter(t => t.touchType === 'direct');
          const tapFingerCount = ended.length;
          
          // Session-based timing: check duration from when 2+ fingers were first detected
          const sessionDuration = Date.now() - sessionStartTimeRef.current;
          
          // Check if all ended touches had minimal movement
          const allTouchesTapped = ended.every(isTapMovement);

          // Check if this was a tap session:
          // - No gesture movement started
          // - At least 2 fingers participated
          // - Session was quick enough
          // - All touches had minimal movement
          const isMultiFingerTapSession =
            !gestureStartedRef.current && 
            tapFingerCount >= 2 &&
            sessionDuration < TAP_MAX_DURATION &&
            allTouchesTapped;

          if (isMultiFingerTapSession) {
            if (tapFingerCount === 2) callbacks.onUndo();
            if (tapFingerCount >= 3) callbacks.onRedo(); // 3+ fingers triggers redo
          }
        }

        resetSessionTracking();
      }
    },
    [callbacks]
  );

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
      // Clean up any pending RAF
      if (gestureRafIdRef.current !== null) {
        cancelAnimationFrame(gestureRafIdRef.current);
      }
    };
  }, [elementRef, handleTouchStart, handleTouchMove, handleTouchEnd]);

  const resetTransform = useCallback(() => {
    transformRef.current = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
    callbacks.onTransformChange(1, 0, 0, 0);
  }, [callbacks]);

  return {
    isGesturing: isGesturingRef.current,
    resetTransform,
  };
};

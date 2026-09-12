import React, { useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { ChatPane } from './ChatPane';
import { WorkspacePane } from './WorkspacePane';

export const DualPaneContainer: React.FC = () => {
  const {
    paneViewState,
    setPaneViewState,
    openMenu,
    setDrawerGestureOffset,
  } = useApp();

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Direct gesture tracking refs - zero React re-renders during active drag
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const gestureLockRef = useRef<'horizontal' | 'vertical' | null>(null);
  const isMouseActiveRef = useRef<boolean>(false);
  const isGesturingRef = useRef<boolean>(false);
  const isDrawerPortalMountedRef = useRef<boolean>(false);
  const animationTimerRef = useRef<number | null>(null);

  // Keep track in sync with paneViewState
  useEffect(() => {
    if (trackRef.current && !isGesturingRef.current) {
      const targetTransform =
        paneViewState === 'chat-only'
          ? 'translate3d(0%, 0, 0)'
          : 'translate3d(-50%, 0, 0)';

      trackRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
      trackRef.current.style.transform = targetTransform;

      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
      }
      animationTimerRef.current = window.setTimeout(() => {
        if (trackRef.current && !isGesturingRef.current) {
          trackRef.current.style.transition = 'none';
        }
        animationTimerRef.current = null;
      }, 320);
    }
  }, [paneViewState]);

  useEffect(() => {
    return () => {
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
      }
    };
  }, []);

  // Exclude interactive elements from triggering swipe navigation
  const isIgnoredTarget = (target: HTMLElement | null): boolean => {
    if (!target) return false;

    // Full-surface swipe navigation: from anywhere on the code/workspace interface,
    // swiping in the return direction back to chat works across the entire surface.
    if (
      paneViewState === 'workspace-only' ||
      Boolean(target.closest('#dual-pane-right, #workspace-pane'))
    ) {
      return false;
    }

    return Boolean(
      target.closest(
        'input, textarea, select, button, [contenteditable="true"], .no-swipe-gesture, #chat-input-bar, #chat-bottom-dock, #chat-bottom-shortcut-bar, #edit-shortcuts-modal, [data-no-swipe], pre, code'
      )
    );
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isIgnoredTarget(e.target as HTMLElement | null)) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      gestureLockRef.current = null;
      return;
    }

    if (e.touches.length === 1) {
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }

      if (trackRef.current) {
        trackRef.current.style.transition = 'none';
      }

      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchStartTimeRef.current = Date.now();
      gestureLockRef.current = null;
      isGesturingRef.current = false;
      isDrawerPortalMountedRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null || e.touches.length !== 1) {
      return;
    }

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartXRef.current;
    const diffY = currentY - touchStartYRef.current;

    // Lock direction on first threshold pass
    if (gestureLockRef.current === null) {
      if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 8) {
        gestureLockRef.current = 'vertical';
        return;
      }
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
        gestureLockRef.current = 'horizontal';
        isGesturingRef.current = true;
      }
    }

    if (gestureLockRef.current === 'horizontal') {
      if (e.cancelable) {
        e.preventDefault();
      }

      const isChat = paneViewState === 'chat-only';

      if (isChat) {
        if (diffX <= 0) {
          // Dragging left moves towards workspace in real time on compositor thread
          if (trackRef.current) {
            trackRef.current.style.transition = 'none';
            trackRef.current.style.transform = `translate3d(${diffX}px, 0, 0)`;
          }
        } else {
          // Dragging right from chat pane opens navigation drawer with real-time tracking
          if (trackRef.current) {
            trackRef.current.style.transition = 'none';
            trackRef.current.style.transform = 'translate3d(0%, 0, 0)';
          }

          if (!isDrawerPortalMountedRef.current) {
            isDrawerPortalMountedRef.current = true;
            setDrawerGestureOffset(0);
          }

          const drawer = document.getElementById('hamburger-drawer');
          const overlay = document.getElementById('hamburger-overlay');
          if (drawer && overlay) {
            const clamped = Math.min(320, Math.max(0, diffX));
            drawer.style.transition = 'none';
            drawer.style.transform = `translate3d(${-320 + clamped}px, 0, 0)`;
            overlay.style.transition = 'none';
            overlay.style.opacity = `${clamped / 320}`;
          }
        }
      } else {
        // Workspace view: dragging right moves towards chat in real time
        const offset = diffX >= 0 ? diffX : diffX * 0.18; // Rubber-band resistance on right boundary
        if (trackRef.current) {
          trackRef.current.style.transition = 'none';
          trackRef.current.style.transform = `translate3d(calc(-50% + ${offset}px), 0, 0)`;
        }
      }
    }
  };

  const finishGesture = useCallback((diffX: number, velocity: number) => {
    const containerWidth = containerRef.current?.clientWidth || window.innerWidth || 400;
    const halfwayThreshold = containerWidth * 0.45;
    const isChat = paneViewState === 'chat-only';

    if (gestureLockRef.current === 'horizontal') {
      if (isChat) {
        if (diffX > 0) {
          // Swiping right to open navigation drawer
          const shouldOpenDrawer = diffX > 55 || (velocity > 0.35 && diffX > 25);
          if (shouldOpenDrawer) {
            const drawer = document.getElementById('hamburger-drawer');
            const overlay = document.getElementById('hamburger-overlay');
            if (drawer && overlay) {
              drawer.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
              drawer.style.transform = 'translate3d(0px, 0, 0)';
              overlay.style.transition = 'opacity 0.22s ease-out';
              overlay.style.opacity = '1';
            }
            openMenu();
            setDrawerGestureOffset(null);
          } else {
            const drawer = document.getElementById('hamburger-drawer');
            const overlay = document.getElementById('hamburger-overlay');
            if (drawer && overlay) {
              drawer.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
              drawer.style.transform = 'translate3d(-320px, 0, 0)';
              overlay.style.transition = 'opacity 0.22s ease-out';
              overlay.style.opacity = '0';
            }
            setTimeout(() => {
              setDrawerGestureOffset(null);
            }, 220);
          }
        } else if (diffX < 0) {
          // Dragging left towards workspace:
          const shouldSwitch = -diffX >= halfwayThreshold || (velocity < -0.38 && diffX < -35);
          if (shouldSwitch) {
            if (trackRef.current) {
              trackRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
              trackRef.current.style.transform = 'translate3d(-50%, 0, 0)';
            }
            setPaneViewState('workspace-only');
          } else {
            if (trackRef.current) {
              trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
              trackRef.current.style.transform = 'translate3d(0%, 0, 0)';
            }
          }
        }
      } else {
        // In workspace view: dragging right towards chat:
        if (diffX > 0) {
          const shouldSwitch = diffX >= halfwayThreshold || (velocity > 0.38 && diffX > 35);
          if (shouldSwitch) {
            if (trackRef.current) {
              trackRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
              trackRef.current.style.transform = 'translate3d(0%, 0, 0)';
            }
            setPaneViewState('chat-only');
          } else {
            if (trackRef.current) {
              trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
              trackRef.current.style.transform = 'translate3d(-50%, 0, 0)';
            }
          }
        } else {
          // Rubber band spring-back
          if (trackRef.current) {
            trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
            trackRef.current.style.transform = 'translate3d(-50%, 0, 0)';
          }
        }
      }
    }

    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
    }
    animationTimerRef.current = window.setTimeout(() => {
      if (trackRef.current && !isGesturingRef.current) {
        trackRef.current.style.transition = 'none';
      }
      animationTimerRef.current = null;
    }, 320);

    isGesturingRef.current = false;
    isDrawerPortalMountedRef.current = false;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    gestureLockRef.current = null;
    isMouseActiveRef.current = false;
  }, [openMenu, paneViewState, setDrawerGestureOffset, setPaneViewState]);

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) {
      isGesturingRef.current = false;
      return;
    }

    if (gestureLockRef.current === 'horizontal') {
      const currentX = e.changedTouches[0].clientX;
      const diffX = currentX - touchStartXRef.current;
      const dt = Math.max(1, Date.now() - touchStartTimeRef.current);
      const velocity = diffX / dt;
      finishGesture(diffX, velocity);
    } else {
      isGesturingRef.current = false;
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      gestureLockRef.current = null;
      if (trackRef.current) {
        const target = paneViewState === 'chat-only' ? 'translate3d(0%, 0, 0)' : 'translate3d(-50%, 0, 0)';
        trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
        trackRef.current.style.transform = target;
      }
    }
  };

  const handleTouchCancel = () => {
    isGesturingRef.current = false;
    isDrawerPortalMountedRef.current = false;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    gestureLockRef.current = null;
    setDrawerGestureOffset(null);
    if (trackRef.current) {
      const target = paneViewState === 'chat-only' ? 'translate3d(0%, 0, 0)' : 'translate3d(-50%, 0, 0)';
      trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
      trackRef.current.style.transform = target;
    }
  };

  // Mouse drag support for desktop / pointer testing
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (isIgnoredTarget(e.target as HTMLElement | null)) return;

    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }

    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
    }

    touchStartXRef.current = e.clientX;
    touchStartYRef.current = e.clientY;
    touchStartTimeRef.current = Date.now();
    gestureLockRef.current = null;
    isMouseActiveRef.current = true;
    isGesturingRef.current = false;
    isDrawerPortalMountedRef.current = false;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseActiveRef.current || touchStartXRef.current === null || touchStartYRef.current === null) return;

      const diffX = e.clientX - touchStartXRef.current;
      const diffY = e.clientY - touchStartYRef.current;

      if (gestureLockRef.current === null) {
        if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 8) {
          gestureLockRef.current = 'vertical';
          return;
        }
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
          gestureLockRef.current = 'horizontal';
          isGesturingRef.current = true;
        }
      }

      if (gestureLockRef.current === 'horizontal') {
        const isChat = paneViewState === 'chat-only';

        if (isChat) {
          if (diffX <= 0) {
            if (trackRef.current) {
              trackRef.current.style.transition = 'none';
              trackRef.current.style.transform = `translate3d(${diffX}px, 0, 0)`;
            }
          } else {
            if (trackRef.current) {
              trackRef.current.style.transition = 'none';
              trackRef.current.style.transform = 'translate3d(0%, 0, 0)';
            }
            if (!isDrawerPortalMountedRef.current) {
              isDrawerPortalMountedRef.current = true;
              setDrawerGestureOffset(0);
            }
            const drawer = document.getElementById('hamburger-drawer');
            const overlay = document.getElementById('hamburger-overlay');
            if (drawer && overlay) {
              const clamped = Math.min(320, Math.max(0, diffX));
              drawer.style.transition = 'none';
              drawer.style.transform = `translate3d(${-320 + clamped}px, 0, 0)`;
              overlay.style.transition = 'none';
              overlay.style.opacity = `${clamped / 320}`;
            }
          }
        } else {
          const offset = diffX >= 0 ? diffX : diffX * 0.18;
          if (trackRef.current) {
            trackRef.current.style.transition = 'none';
            trackRef.current.style.transform = `translate3d(calc(-50% + ${offset}px), 0, 0)`;
          }
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isMouseActiveRef.current || touchStartXRef.current === null) return;

      if (gestureLockRef.current === 'horizontal') {
        const diffX = e.clientX - touchStartXRef.current;
        const dt = Math.max(1, Date.now() - touchStartTimeRef.current);
        const velocity = diffX / dt;
        finishGesture(diffX, velocity);
      } else {
        isGesturingRef.current = false;
        isDrawerPortalMountedRef.current = false;
        isMouseActiveRef.current = false;
        touchStartXRef.current = null;
        touchStartYRef.current = null;
        gestureLockRef.current = null;
        if (trackRef.current) {
          const target = paneViewState === 'chat-only' ? 'translate3d(0%, 0, 0)' : 'translate3d(-50%, 0, 0)';
          trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
          trackRef.current.style.transform = target;
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [finishGesture, paneViewState, setDrawerGestureOffset]);

  const initialTransform =
    paneViewState === 'chat-only'
      ? 'translate3d(0%, 0, 0)'
      : 'translate3d(-50%, 0, 0)';

  return (
    <div
      ref={containerRef}
      id="dual-pane-container"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onMouseDown={handleMouseDown}
      className="relative flex-1 min-h-0 w-full overflow-hidden bg-black isolate"
      style={{ touchAction: 'pan-y' }}
    >
      {/* 2-Screen Hardware-Accelerated Swipeable Slider Track (200% width, 100% per screen) */}
      <div
        ref={trackRef}
        id="dual-pane-track"
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '200%',
          height: '100%',
          flexShrink: 0,
          transform: initialTransform,
          willChange: 'transform',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          WebkitTransformStyle: 'flat',
          transformStyle: 'flat',
          isolation: 'isolate',
          backgroundColor: '#000000',
        }}
        className="h-full min-h-0 overflow-hidden"
      >
        {/* Left Screen: Chat (Full Screen with GPU layer isolation) */}
        <div
          id="dual-pane-left"
          style={{
            width: '50%',
            flexShrink: 0,
            position: 'relative',
            isolation: 'isolate',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
            WebkitTransform: 'translateZ(0)',
            transform: 'translateZ(0)',
            contain: 'layout paint',
            backgroundColor: '#000000',
          }}
          className="h-full min-h-0 overflow-hidden flex flex-col shrink-0"
        >
          <ChatPane />
        </div>

        {/* Right Screen: Workspace / Code (Full Screen with GPU layer isolation) */}
        <div
          id="dual-pane-right"
          style={{
            width: '50%',
            flexShrink: 0,
            position: 'relative',
            isolation: 'isolate',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
            WebkitTransform: 'translateZ(0)',
            transform: 'translateZ(0)',
            contain: 'layout paint',
            backgroundColor: '#000000',
          }}
          className="h-full min-h-0 overflow-hidden flex flex-col shrink-0"
        >
          <WorkspacePane />
        </div>
      </div>
    </div>
  );
};

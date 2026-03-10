import React from "react";

const MOTION_STYLE_PROPS = new Set([
  "x",
  "y",
  "z",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "rotateZ",
  "skewX",
  "skewY",
  "originX",
  "originY",
  "originZ",
  "perspective",
]);

const MOTION_PROPS = new Set([
  "animate",
  "initial",
  "exit",
  "transition",
  "layout",
  "layoutId",
  "layoutRoot",
  "variants",
  "whileTap",
  "whileHover",
  "whileFocus",
  "whileDrag",
  "whileInView",
  "onAnimationComplete",
  "onAnimationStart",
  "onLayoutAnimationStart",
  "onLayoutAnimationComplete",
  "viewport",
  "drag",
  "dragConstraints",
  "dragElastic",
  "dragMomentum",
]);

function filterMotionProps(props: Record<string, unknown>) {
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!MOTION_PROPS.has(key)) {
      filtered[key] = props[key];
    }
  }
  return filtered;
}

function createMotionComponent(tag: string) {
  const Component = React.forwardRef(
    (
      {
        children,
        style,
        ...rest
      }: Record<string, unknown> & {
        children?: React.ReactNode;
        style?: React.CSSProperties;
      },
      ref: React.Ref<unknown>
    ) => {
      const filtered = filterMotionProps(rest);
      const filteredStyle = style
        ? (Object.fromEntries(
            Object.entries(style).filter(([k]) => !MOTION_STYLE_PROPS.has(k))
          ) as React.CSSProperties)
        : undefined;
      return React.createElement(
        tag,
        { ...filtered, style: filteredStyle, ref },
        children
      );
    }
  );
  Component.displayName = `motion.${tag}`;
  return Component;
}

const cache = new Map<string, ReturnType<typeof createMotionComponent>>();

export const motion = new Proxy(
  {},
  {
    get(_: object, tag: string | symbol) {
      if (typeof tag !== "string") {
        return undefined;
      }
      if (!cache.has(tag)) {
        cache.set(tag, createMotionComponent(tag));
      }
      return cache.get(tag);
    },
  }
) as Record<string, ReturnType<typeof createMotionComponent>>;

export function AnimatePresence({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function MotionConfig({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function useMotionValue(initial: number) {
  const valueRef = React.useRef(initial);
  const instanceRef = React.useRef<{
    get: () => number;
    set: (v: number) => void;
    on: () => () => void;
    subscribe: () => () => void;
  }>();
  if (!instanceRef.current) {
    instanceRef.current = {
      get: () => valueRef.current,
      set: (v: number) => {
        valueRef.current = v;
      },
      // biome-ignore lint/suspicious/noEmptyBlockStatements: mock no-op
      on: () => () => {},
      // biome-ignore lint/suspicious/noEmptyBlockStatements: mock no-op
      subscribe: () => () => {},
    };
  }
  return instanceRef.current;
}

export function useSpring(value: unknown) {
  return value;
}

export function useTransform(value: unknown) {
  return value;
}

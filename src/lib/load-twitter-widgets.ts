let widgetsPromise: Promise<void> | null = null;

export function loadTwitterWidgets(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.twttr?.widgets?.load) {
    return Promise.resolve();
  }
  if (widgetsPromise) {
    return widgetsPromise;
  }

  widgetsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.charset = "utf-8";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load widgets.js"));
    document.head.appendChild(script);
  });

  return widgetsPromise;
}

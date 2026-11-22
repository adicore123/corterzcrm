"use client";
import { useEffect, useReducer } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { initialTour, tourReducer, type TourStep } from "./studio-state";

export function useProductTour(steps: TourStep[], ready = true) {
  const [state, dispatch] = useReducer(tourReducer, initialTour);
  const step = steps[state.index];
  useEffect(() => {
    if (!state.active || !state.playing || !step || !ready) return;
    const timer = window.setTimeout(() => dispatch({ type: "tick" }), step.durationMs ?? 8000);
    return () => window.clearTimeout(timer);
  }, [state.active, state.playing, state.index, step, ready]);
  useEffect(() => {
    const pause = () => { if (document.hidden) dispatch({ type: "pause" }); };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  return { state, step, dispatch };
}

export function ProductTour({ tour, steps, onStart, onExit, ready }: {
  tour: ReturnType<typeof useProductTour>; steps: TourStep[]; onStart: () => void; onExit: () => void; ready: boolean;
}) {
  const { state, step, dispatch } = tour;
  if (!state.active) return <button className="studio-tour-launch" disabled={!ready} onClick={onStart}><Play size={15} fill="currentColor" /><span>הכירו את הדגם בסיור קצר</span><small>{steps.length} תחנות</small></button>;
  return <section className="studio-tour" aria-label="סיור מודרך במוצר">
    <div className="studio-tour-top"><span>היכרות עם הדגם · {state.index + 1} מתוך {steps.length}</span><button onClick={onExit} aria-label="יציאה מהסיור"><X size={16} /></button></div>
    <div className="studio-tour-progress" aria-hidden>{steps.map((_, i) => <span key={i} className={i <= state.index ? "is-complete" : ""} />)}</div>
    <h3>{step?.title}</h3><p aria-live="polite">{step?.description}</p>
    <div className="studio-tour-nav"><button onClick={() => dispatch({ type: "previous" })} disabled={state.index === 0}><ChevronRight size={16} />הקודם</button><button onClick={() => dispatch({ type: state.playing ? "pause" : "resume" })} aria-label={state.playing ? "עצירת הסיור" : "המשך הסיור"}>{state.playing ? <Pause size={17} /> : <Play size={17} />}</button><button onClick={() => state.index === steps.length - 1 ? onExit() : dispatch({ type: "next" })}>{state.index === steps.length - 1 ? "סיום" : "הבא"}<ChevronLeft size={16} /></button></div>
  </section>;
}

import { useEffect, useRef, useState } from "react";
import "./styles/typewriter.css";

export default function Typewriter({ text, speed = 50, start = true, onDone }) {
  const [typed, setTyped] = useState("");
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const cursorVisible = start || typed.length > 0;

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!start) return undefined;

    doneRef.current = false;
    setTyped("");

    if (!text) {
      doneRef.current = true;
      onDoneRef.current?.();
      setTyped("");
      return undefined;
    }

    let i = 0;

    const tick = setInterval(() => {
      setTyped(prev => prev + text[i]);
      i += 1;
      if (i >= text.length) {
        clearInterval(tick);
        if (!doneRef.current) {
          doneRef.current = true;
          onDoneRef.current?.();
        }
      }
    }, speed);

    return () => clearInterval(tick);
  }, [text, speed, start]);

  return (
    <span className="type-wrap">
      {typed}
      <span className="cursor" style={{ visibility: cursorVisible ? "visible" : "hidden" }} />
    </span>
  );
}

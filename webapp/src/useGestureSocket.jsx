import { useEffect, useState } from "react";

export default function useGestureSocket() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8765");

    ws.onmessage = (msg) => {
      const parsed = JSON.parse(msg.data);
      setData(parsed);
    };

    return () => ws.close();
  }, []);

  return data;
}

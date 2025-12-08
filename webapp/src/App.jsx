import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import useGestureSocket from "./useGestureSocket";
import Typewriter from "./Typewriter";

function pinchDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function isPinching(hand, tipIndex) {
  if (!hand?.landmarks) return false;
  return pinchDistance(hand.landmarks[4], hand.landmarks[tipIndex]) < 0.045;
}

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // index
  [0, 9], [9, 10], [10, 11], [11, 12],  // middle
  [0, 13], [13, 14], [14, 15], [15, 16],// ring
  [0, 17], [17, 18], [18, 19], [19, 20] // pinky
];

export default function App() {
  const gesture = useGestureSocket();
  const instructions = [
    "⋆ Tap or press any key once to enable audio.",
    "⋆ Press fingers toward your palm to trigger notes.",
    "⋆ Pull right hand back to sustain pad, make a fist to stop it.",
  ];
  const [currentInstruction, setCurrentInstruction] = useState(0);

  const synthsLeft = useRef(null);   // bass/drums
  const synthsRight = useRef(null);  // piano/lead
  const pressedLeft = useRef({});
  const pressedRight = useRef({});
  const smoothedDistances = useRef({ left: {}, right: {} });
  const relaxedMax = useRef({ left: {}, right: {} });
  const smoothedLandmarks = useRef({});
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const sustainedNotes = useRef({});    
  const rightHandCenter = useRef({ x: 0.5, z: 0 });
  const depthBaseline = useRef({ left: null, right: null });

  // create synths
  useEffect(() => {
    // RIGHT HAND 
    const pluck = new Tone.FMSynth({
      harmonicity: 2.5,
      modulationIndex: 15,
      oscillator: { type: "sine" },
      modulation: { type: "triangle" },
      envelope: {
        attack: 0.01,
        decay: 0.4,
        sustain: 0.2,
        release: 1.8,
      },
    }).chain(
      new Tone.Chorus(4, 2.5, 0.4),
      new Tone.Reverb({ decay: 4, wet: 0.6 }),
      new Tone.FeedbackDelay(0.25, 0.3),
      Tone.Destination
    );

    const lead = new Tone.MonoSynth({
      oscillator: { type: "square" },
      filter: { type: "lowpass", frequency: 500, Q: 2 },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.4 },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.3,
        release: 0.2,
        baseFrequency: 200,
        octaves: 3,
      },
    }).chain(
      new Tone.Vibrato(8, 0.2),
      new Tone.BitCrusher(4),
      new Tone.PingPongDelay("8n", 0.3),
      Tone.Destination
    );

    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: {
        attack: 1.2,
        decay: 0.2,
        sustain: 0.9,
        release: 4,
      },
    }).chain(
      new Tone.AutoFilter("1n").start(),
      new Tone.Reverb(7),
      new Tone.Chorus(3, 1.5, 0.6),
      Tone.Destination
    );

    const sparkle = new Tone.MetalSynth({
      resonance: 5000,
      harmonicity: 5,
      modulationIndex: 20,
      envelope: { attack: 0.001, decay: 0.3, release: 0.2 },
    }).toDestination();

    const veridis = new Tone.MonoSynth({
      oscillator: { type: "square" },
      envelope: { attack: 0.03, decay: 0.2, sustain: 0.6, release: 1.2 },
      filterEnvelope: {
        attack: 0.02,
        decay: 0.3,
        sustain: 0.3,
        release: 1.0,
        baseFrequency: 400,
        octaves: 3.5
      }
    }).chain(
      new Tone.Chorus(4, 2.5, 0.5),
      new Tone.Reverb({ decay: 5, wet: 0.4 }),
      Tone.Destination
    );

    const shimmer = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 3 }
    }).chain(
      new Tone.PingPongDelay("8n", 0.3),
      new Tone.Reverb(8),
      Tone.Destination
    );

    const bass = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      filter: { Q: 2, type: "lowpass", frequency: 120 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3 },
      filterEnvelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.2,
        release: 0.3,
        baseFrequency: 50,
        octaves: 3
      }
    }).chain(
      new Tone.Distortion(0.2),
      new Tone.Filter(250, "lowpass"),
      Tone.Destination
    );

    synthsRight.current = {
      index: pluck,
      middle: lead,
      ring: pad,
      pinky: sparkle,
      pinchIndex: veridis,
      pinchMiddle: shimmer,
      pinchRing: bass,
    };


    // LEFT HAND
    synthsLeft.current = {
      thumb: new Tone.MembraneSynth().toDestination(),      // kick
      index: new Tone.NoiseSynth({
        envelope: { attack: 0.001, decay: 0.1 },
      }).toDestination(),                                   // snare
      middle: new Tone.MonoSynth({
        oscillator: { type: "square" },
        filter: { Q: 2, type: "lowpass", frequency: 120 },
      }).toDestination(),                                   // bass
      ring: new Tone.MetalSynth().toDestination(),          // tom
      pinky: new Tone.MembraneSynth({ pitchDecay: 0.05 }).toDestination(), // hi tom
    };

    console.log("🎛 Synths ready");
  }, []);

  // unlock audio on page interaction 
  useEffect(() => {
    const unlock = () => {
      Tone.start();
      console.log("🔊 Audio unlocked");
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }, []);

  // webcam preview
  useEffect(() => {
    let stream;
    const enableVideo = async () => {
      setVideoReady(false);
      setVideoError(null);
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia not supported in this browser");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          const playPromise = videoEl.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch((err) => {
              console.warn("Autoplay blocked; waiting for user gesture", err);
              setVideoError("Tap the preview or allow camera access to start.");
            });
          }
        }
      } catch (err) {
        console.warn("Camera unavailable for preview:", err);
        setVideoError("Camera unavailable. Check permissions or if it's in use elsewhere.");
      }
    };
    enableVideo();

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // smooth landmarks
  useEffect(() => {
    const incomingHands = gesture?.hands;
    if (!incomingHands || !Array.isArray(incomingHands)) return;

    const alpha = 0.35;
    const next = { ...smoothedLandmarks.current };

    incomingHands.forEach((hand, idx) => {
      const label = (hand.label || `hand${idx + 1}`).toLowerCase();
      const incoming = hand.landmarks;
      if (!incoming || !Array.isArray(incoming)) return;

      const prev = smoothedLandmarks.current[label] || [];
      next[label] = incoming.map((p, i) => {
        const prevP = prev[i];
        if (!prevP) return p;
        return {
          x: prevP.x * (1 - alpha) + p.x * alpha,
          y: prevP.y * (1 - alpha) + p.y * alpha,
          z: prevP.z * (1 - alpha) + p.z * alpha,
        };
      });
    });

    smoothedLandmarks.current = next;
  }, [gesture]);

  // gesture to sound
  useEffect(() => {
    const hands = gesture?.hands;
    if (!hands || !Array.isArray(hands)) return;

    const byLabel = {};
    hands.forEach((hand, idx) => {
      const label = (hand.label || (idx === 0 ? "left" : "right")).toLowerCase();
      byLabel[label] = hand;
    });

    const processFinger = (label, finger, reading, pressedRef, triggerFn) => {
      if (typeof reading !== "number") return;

      const prevSmooth = smoothedDistances.current[label]?.[finger];
      const smooth =
        prevSmooth == null ? reading : prevSmooth * 0.65 + reading * 0.35;
      smoothedDistances.current[label] = {
        ...smoothedDistances.current[label],
        [finger]: smooth,
      };

      const prevMax = relaxedMax.current[label]?.[finger];
      const decayedMax =
        prevMax == null ? smooth : Math.max(prevMax * 0.995, smooth);
      relaxedMax.current[label] = {
        ...relaxedMax.current[label],
        [finger]: decayedMax,
      };

      if (!decayedMax || Number.isNaN(decayedMax)) return;

      const onThreshold = decayedMax * 0.55;
      const offThreshold = decayedMax * 0.7;
      const shouldFire = smooth < onThreshold;
      const shouldRelease = smooth > offThreshold;

      const was = pressedRef.current[finger] ?? false;
      if (!was && shouldFire) {
        triggerFn();
        pressedRef.current[finger] = true;
      } else if (was && shouldRelease) {
        pressedRef.current[finger] = false;
      }

    // pinch detection helpers
    function pinchDistance(hand, a, b) {
      const pa = hand.landmarks[a];
      const pb = hand.landmarks[b];
      return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
    }

    function isPinching(hand, fingertip) {
      if (!hand?.landmarks) return false;
      return pinchDistance(hand, 4, fingertip) < 0.045; // thumb finger threshold
    }

    // RIGHT HAND: pinch detection
    const R = byLabel.right;

    if (R && synthsRight.current) {
      const PR = pressedRight.current;

      const pinchIndex  = isPinching(R, 8);   // thumb–index
      const pinchMiddle = isPinching(R, 12);  // thumb–middle
      const pinchRing   = isPinching(R, 16);  // thumb–ring

      // RIGHT HAND PINCH SOUNDS
      // right index pinch
      if (pinchIndex && !PR.pinchIndex) {
        synthsRight.current.pinchIndex.triggerAttackRelease("C5", "8n");
        PR.pinchIndex = true;
      } else if (!pinchIndex) {
        PR.pinchIndex = false;
      }

      // right middle pinch
      if (pinchMiddle && !PR.pinchMiddle) {
        synthsRight.current.pinchMiddle.triggerAttackRelease(
          ["E4","G4","B4"],
          "2n"
        );
        PR.pinchMiddle = true;
      } else if (!pinchMiddle) {
        PR.pinchMiddle = false;
      }

      // right ring pinch
      if (pinchRing && !PR.pinchRing) {
        synthsRight.current.pinchRing.triggerAttackRelease("C2", "8n");
        PR.pinchRing = true;
      } else if (!pinchRing) {
        PR.pinchRing = false;
      }
    }

    };

    // LEFT HAND: drums/bass
    const L = byLabel.left;
    if (L && synthsLeft.current) {
      const PL = pressedLeft.current;

      // left hand pinch detection 
      const pinchIndexL  = isPinching(L, 8);   // thumb–index
      const pinchMiddleL = isPinching(L, 12);  // thumb–middle
      const pinchRingL   = isPinching(L, 16);  // thumb–ring
      const pinchPinkyL  = isPinching(L, 20);  // thumb–pinky

      // LEFT HAND PINCH SOUNDS
      // left index pinch
      if (pinchIndexL && !PL.pinchIndex) {
        synthsLeft.current.index.triggerAttackRelease("16n");
        PL.pinchIndex = true;
      } else if (!pinchIndexL) {
        PL.pinchIndex = false;
      }

      // left middle pinch
      if (pinchMiddleL && !PL.pinchMiddle) {
        synthsLeft.current.middle.triggerAttackRelease("C2", "8n");
        PL.pinchMiddle = true;
      } else if (!pinchMiddleL) {
        PL.pinchMiddle = false;
      }

      // left ring pinch
      if (pinchRingL && !PL.pinchRing) {
        synthsLeft.current.ring.triggerAttackRelease("G2", "8n");
        PL.pinchRing = true;
      } else if (!pinchRingL) {
        PL.pinchRing = false;
      }

      // left pinky pinch
      if (pinchPinkyL && !PL.pinchPinky) {
        synthsLeft.current.pinky.triggerAttackRelease("C1", "8n");
        PL.pinchPinky = true;
      } else if (!pinchPinkyL) {
        PL.pinchPinky = false;
      }

      processFinger("left", "thumb", L.thumb, pressedLeft, () =>
        synthsLeft.current.thumb.triggerAttackRelease("C1", "8n")
      );
      processFinger("left", "index", L.index, pressedLeft, () =>
        synthsLeft.current.index.triggerAttackRelease("8n")
      );
      processFinger("left", "middle", L.middle, pressedLeft, () =>
        synthsLeft.current.middle.triggerAttackRelease("C2", "8n")
      );
      processFinger("left", "ring", L.ring, pressedLeft, () =>
        synthsLeft.current.ring.triggerAttackRelease("G2", "8n")
      );
      processFinger("left", "pinky", L.pinky, pressedLeft, () =>
        synthsLeft.current.pinky.triggerAttackRelease("C3", "8n")
      );
    }

    const R = byLabel.right;

    // track right-hand position for sustain + chords
    if (R?.landmarks && Array.isArray(R.landmarks)) {
      let sumX = 0;
      let sumZ = 0;

      R.landmarks.forEach((p) => {
        sumX += p.x;
        sumZ += p.z;
      });

      const avgX = sumX / R.landmarks.length;
      const avgZ = sumZ / R.landmarks.length;

      rightHandCenter.current = { x: avgX, z: avgZ };

      if (depthBaseline.current.right === null) {
        depthBaseline.current.right = avgZ; // initial position
      } else {
        depthBaseline.current.right = Math.min(
          depthBaseline.current.right,
          avgZ
        ); // update baseline if hand moves closer
      }
    }


    const chooseChord = () => {
      const x = rightHandCenter.current.x;
      if (x < 0.33) return ["A3", "C4", "E4"]; // low
      if (x < 0.66) return ["C4", "E4", "G4"]; // mid
      return ["E4", "G4", "B4"];               // high
    };

    if (R && synthsRight.current) {
      // pluck
      processFinger("right", "index", R.index, pressedRight, () =>
        synthsRight.current.index.triggerAttackRelease("D4", "8n")
      );

      // lead
      processFinger("right", "middle", R.middle, pressedRight, () =>
        synthsRight.current.middle.triggerAttackRelease("F4", "8n")
      );

      // pad depth sustain + fist to stop
      const baseline = depthBaseline.current.right ?? rightHandCenter.current.z;
      const handZ = rightHandCenter.current.z;
      const sustainActive = handZ < baseline - 0.06; // pull back to start
      const sustainReleaseDepth = handZ > baseline - 0.02;
      const isFist = R.gesture === "closed_fist";

      // start/update chord when ring curls 
      processFinger("right", "ring", R.ring, pressedRight, () => {
        const chord = chooseChord();
        if (!sustainedNotes.current.ring && sustainActive && !isFist) {
          synthsRight.current.ring.triggerAttack(chord);
          sustainedNotes.current.ring = chord;
        }
      });
      if (sustainedNotes.current.ring && (sustainReleaseDepth || isFist)) {
        synthsRight.current.ring.triggerRelease();
        sustainedNotes.current.ring = null;
      }

      // sparkle FX
      processFinger("right", "pinky", R.pinky, pressedRight, () =>
        synthsRight.current.pinky.triggerAttackRelease("16n")
      );
    } else if (synthsRight.current?.ring && sustainedNotes.current.ring) {
      // stop chord when hand disappears
      synthsRight.current.ring.triggerRelease();
      sustainedNotes.current.ring = null;
    }
  }, [gesture]);

  // draw skeleton hand 
  const CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const video = videoRef.current;
    if (!canvas || !ctx || !video) return;

    const width = video.videoWidth;
    const height = video.videoHeight;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const hands = gesture?.hands;
    if (!hands) return;

    ctx.save();

    hands.forEach(hand => {
      const landmarks =
        smoothedLandmarks.current[hand.label] || hand.landmarks;

      ctx.strokeStyle = "rgb(0, 255, 0)";
      ctx.lineWidth = 3;

      CONNECTIONS.forEach(([a, b]) => {
        const pA = landmarks[a];
        const pB = landmarks[b];
        ctx.beginPath();
        ctx.moveTo(pA.x * width, pA.y * height);
        ctx.lineTo(pB.x * width, pB.y * height);
        ctx.stroke();
      });

      ctx.fillStyle = "#ff0000ff";
      landmarks.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    ctx.restore();
  }, [gesture]);


  // keep canvas size synched
  useEffect(() => {
    if (!previewRef.current || !videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const videoEl = videoRef.current;

    const syncSize = () => {
      const w = videoEl.clientWidth;
      const h = videoEl.clientHeight;
      if (w && h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const observer = new ResizeObserver(syncSize);
    observer.observe(previewRef.current);
    videoEl.addEventListener("loadedmetadata", syncSize);

    return () => {
      observer.disconnect();
      videoEl.removeEventListener("loadedmetadata", syncSize);
    };
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h1>gesture controlled synth</h1>
      {instructions.map((line, idx) => (
        <p key={line}>
          <Typewriter
            text={line}
            start={idx <= currentInstruction}
            onDone={() => {
              if (idx === currentInstruction) {
                setCurrentInstruction(prev => Math.min(instructions.length, prev + 1));
              }
            }}
          />
        </p>
      ))}

      <pre style={{ fontSize: "1.2rem", maxHeight: 260, overflow: "auto" }}>
        {JSON.stringify(gesture, null, 2)}
      </pre>

      <div
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          width: 280,
          height: 220,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
          background: "#000",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <div
          ref={previewRef}
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            width="100%"
            height="100%"
            onCanPlay={() => setVideoReady(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: "scaleX(-1)",
            }}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          />
          {!videoReady && (
            <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 600,
              background: "rgba(0,0,0,0.4)",
            }}
          >
            {videoError || "Waiting for camera…"}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

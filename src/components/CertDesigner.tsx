import React, { useState, useRef, useEffect } from "react";
import { Upload, Type, Eye, Percent, Sliders, AlertCircle, Sparkles } from "lucide-react";

interface CertCoords {
  x: number;
  y: number;
  fontSize: number;
  fontColor: string;
}

interface CertDesignerProps {
  onCoordsChanged: (coords: CertCoords, imageBase64: string | null) => void;
  isEnabled: boolean;
  sampleName?: string;
}

const COLOR_MAP: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ef4444",
  blue: "#3b82f6",
  gold: "#eab308",
  green: "#22c55e",
  purple: "#a855f7",
  pink: "#ec4899",
  orange: "#f97316",
  teal: "#14b8a6",
};

const AVAILABLE_COLORS = [
  { id: "black", name: "Deep Black", dot: "bg-black border border-white/20" },
  { id: "white", name: "Snow White", dot: "bg-white border border-black/20" },
  { id: "red", name: "Crimson Red", dot: "bg-red-500" },
  { id: "blue", name: "Ocean Blue", dot: "bg-blue-500" },
  { id: "gold", name: "Luxury Gold", dot: "bg-yellow-500" },
  { id: "green", name: "Emerald Green", dot: "bg-emerald-500" },
  { id: "purple", name: "Amethyst Purple", dot: "bg-purple-500" },
  { id: "pink", name: "Hot Pink", dot: "bg-pink-500" },
  { id: "orange", name: "Sunset Orange", dot: "bg-orange-500" },
  { id: "teal", name: "Teal Green", dot: "bg-teal-500" },
];

export default function CertDesigner({ onCoordsChanged, isEnabled, sampleName }: CertDesignerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [intrinsicSize, setIntrinsicSize] = useState<{ width: number; height: number }>({ width: 1000, height: 700 });
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Layout target state (stored in terms of original/intrinsic image coordinates)
  const [coords, setCoords] = useState<CertCoords>({
    x: 500, // custom center x default
    y: 350, // center y default
    fontSize: 32,
    fontColor: "black",
  });

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure the display dimensions of the image to scale visual preview overlays correctly
  const updateDisplayMetrics = () => {
    if (imageRef.current) {
      setDisplaySize({
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
      });
      setIntrinsicSize({
        width: imageRef.current.naturalWidth || 1000,
        height: imageRef.current.naturalHeight || 700,
      });
    }
  };

  useEffect(() => {
    updateDisplayMetrics();
    window.addEventListener("resize", updateDisplayMetrics);
    return () => window.removeEventListener("resize", updateDisplayMetrics);
  }, [imageUrl]);

  // Handle uploaded background design file (converts to base64)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawResult = event.target?.result as string;
        setImageUrl(rawResult);
        setImageBase64(rawResult);
        // Default coordinates to the center of the loaded image
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || 1000;
          const h = img.naturalHeight || 700;
          setIntrinsicSize({ width: w, height: h });
          const defaultCoords: CertCoords = {
            x: Math.round(w / 2.5), // Offset slightly left for normal text alignment
            y: Math.round(h / 2),
            fontSize: 32,
            fontColor: "black",
          };
          setCoords(defaultCoords);
          onCoordsChanged(defaultCoords, rawResult);
        };
        img.src = rawResult;
      };
      reader.readAsDataURL(file);
    }
  };

  // Click on image to dynamically position target Name
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !imageUrl) return;

    const rect = imageRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert screen coordinates to intrinsic original coordinates
    const scaleX = intrinsicSize.width / rect.width;
    const scaleY = intrinsicSize.height / rect.height;

    const mappedX = Math.round(clickX * scaleX);
    const mappedY = Math.round(clickY * scaleY);

    const updated = {
      ...coords,
      x: Math.max(0, Math.min(intrinsicSize.width, mappedX)),
      y: Math.max(0, Math.min(intrinsicSize.height, mappedY)),
    };

    setCoords(updated);
    onCoordsChanged(updated, imageBase64);
  };

  const handleControlChange = (field: keyof CertCoords, val: any) => {
    const updated = {
      ...coords,
      [field]: val,
    };
    setCoords(updated);
    onCoordsChanged(updated, imageBase64);
  };

  // Convert intrinsic coordinate back to responsive display coordinate
  const getDisplayCoords = () => {
    if (intrinsicSize.width === 0 || displaySize.width === 0) {
      return { x: 0, y: 0 };
    }
    const ratioX = displaySize.width / intrinsicSize.width;
    const ratioY = displaySize.height / intrinsicSize.height;
    return {
      x: coords.x * ratioX,
      y: coords.y * ratioY,
    };
  };

  const displayPos = getDisplayCoords();

  return (
    <div id="certificate-designer-card" className={`bg-zinc-950 border border-purple-900/40 rounded-2xl p-6 shadow-xl relative overflow-hidden transition-opacity duration-300 ${!isEnabled ? "opacity-30 pointer-events-none" : ""}`}>
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 id="designer-title" className="text-base font-bold text-white font-sans tracking-tight flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
            3. Dynamic Certificate Layout Designer
          </h2>
          <p className="text-xs text-white/80 font-sans mt-0.5">
            Upload your blank background image, then click on the preview below to place the participant name placeholder.
          </p>
        </div>
      </div>

      {!imageUrl ? (
        <div className="relative border-2 border-dashed border-purple-900/40 hover:border-purple-500 bg-black hover:bg-purple-950/10 rounded-xl py-12 px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300">
          <input
            type="file"
            accept="image/png, image/jpeg, image/jpg"
            onChange={handleImageUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="p-3 bg-zinc-950 border border-purple-900/40 text-purple-400 rounded-xl mb-3 shadow">
            <Upload className="w-5 h-5 animate-pulse" />
          </div>
          <p className="text-sm font-bold text-white font-sans mb-1">
            Upload blank certificate design
          </p>
          <p className="text-xs text-white/50 font-mono">
            Supports High-Resolution .PNG, .JPG or .JPEG images
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Certificate Work-Stage */}
          <div className="lg:col-span-2 space-y-2">
            <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest font-sans flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-purple-400" />
              Visual Interactive Canvas (Click to Place Text)
            </p>

            <div
              ref={containerRef}
              onClick={handleImageClick}
              className="relative rounded-xl border border-purple-900/40 overflow-hidden bg-black cursor-crosshair shadow-2xl group"
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Certificate Template"
                onLoad={updateDisplayMetrics}
                className="w-full h-auto select-none block"
              />

              {/* Dynamic Coordinate Text Badge Overlaid */}
              <div
                style={{
                  position: "absolute",
                  left: `${displayPos.x}px`,
                  top: `${displayPos.y}px`,
                  transform: "translate(-50%, -50%)", // perfectly center to click anchor
                  pointerEvents: "none",
                }}
                className="flex flex-col items-center select-none transition-all duration-75"
              >
                <div
                  style={{
                    fontSize: `${Math.max(10, Math.min(24, (coords.fontSize / intrinsicSize.width) * displaySize.width * 1.5))}px`,
                    color: COLOR_MAP[coords.fontColor] || "#000000",
                    textShadow: (coords.fontColor === "black" || coords.fontColor === "blue" || coords.fontColor === "purple")
                      ? "0 0 2px rgba(255,255,255,0.85)"
                      : "0 0 2.5px rgba(0,0,0,0.85)",
                  }}
                  className="font-bold px-1 py-0.5 rounded-sm flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Type className="w-4 h-4 inline shrink-0" />
                  {sampleName || "John Doe (Sample Name)"}
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500 border border-black shadow-md mt-1 animate-ping"></div>
              </div>

              {/* Resolution Overlay Banner */}
              <div className="absolute bottom-2.5 right-2.5 bg-black/90 text-[10px] text-white px-2 py-1 border border-purple-900/40 rounded-md font-mono">
                Source Resolution: {intrinsicSize.width}x{intrinsicSize.height}px
              </div>
            </div>
            
            <p className="text-white/50 text-[10px] italic font-sans animate-fade">
              * Click directly on the image to position the text center point. Coordinates are auto-scaled for the final bulk generation.
            </p>
          </div>

          {/* Coordinate Sliders panel */}
          <div className="bg-black border border-purple-955 p-4 rounded-xl space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-widest font-sans flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-purple-400" />
              Coordinate Controls
            </h3>

            {/* X coordinate */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white/80">X Center</span>
                <span className="font-mono font-bold text-purple-400">{coords.x} px ({Math.round((coords.x / intrinsicSize.width) * 105 || 0)}%)</span>
              </div>
              <input
                type="range"
                min="0"
                max={intrinsicSize.width || 800}
                value={coords.x}
                onChange={(e) => handleControlChange("x", Number(e.target.value))}
                className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-purple-650"
              />
            </div>

            {/* Y coordinate */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white/80">Y Center</span>
                <span className="font-mono font-bold text-purple-400">{coords.y} px ({Math.round((coords.y / intrinsicSize.height) * 105 || 0)}%)</span>
              </div>
              <input
                type="range"
                min="0"
                max={intrinsicSize.height || 600}
                value={coords.y}
                onChange={(e) => handleControlChange("y", Number(e.target.value))}
                className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-purple-650"
              />
            </div>

            {/* Font size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white/80">Font Size</span>
                <span className="font-mono font-bold text-white">{coords.fontSize} pt</span>
              </div>
              <select
                value={coords.fontSize}
                onChange={(e) => handleControlChange("fontSize", Number(e.target.value))}
                className="w-full px-2.5 py-1.5 border border-purple-955 bg-black text-white hover:border-purple-800 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
              >
                <option value={16}>Tiny (16 pt)</option>
                <option value={32}>Medium (32 pt)</option>
                <option value={48}>Normal (48 pt)</option>
                <option value={64}>Large (64 pt)</option>
                <option value={80}>X-Large (80 pt)</option>
                <option value={128}>Display (128 pt)</option>
              </select>
            </div>

            {/* Font Color */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-white/80">Text Color</span>
              <div className="grid grid-cols-2 gap-1.5 mt-1 max-h-[160px] overflow-y-auto pr-1">
                {AVAILABLE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleControlChange("fontColor", c.id)}
                    className={`py-1.5 px-2 rounded-lg border text-xs font-bold font-sans flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                      coords.fontColor === c.id
                        ? "bg-purple-950/40 text-white border-purple-400 font-extrabold shadow-md ring-1 ring-purple-400"
                        : "bg-black text-white/60 border-zinc-800 hover:bg-zinc-900 hover:text-white hover:border-zinc-700"
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full shrink-0 ${c.dot}`} />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Template option */}
            <button
              type="button"
              onClick={() => {
                setImageUrl(null);
                setImageBase64(null);
                onCoordsChanged(coords, null);
              }}
              className="w-full mt-2 py-1.5 px-3 rounded-lg border border-red-900/40 text-red-400 bg-red-950/10 hover:bg-red-950/35 text-xs font-bold font-sans transition-all cursor-pointer"
            >
              Reset Background Design
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

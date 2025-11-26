/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';

// --- Simulation Constants (Real Lab Setup) ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const CENTER_Y = CANVAS_HEIGHT / 2;
const FLOOR_Y = CANVAS_HEIGHT - 20;

// Scale: 4 pixels = 1 cm
const PX_PER_CM = 4;

const SOURCE_X = 80; // Left side
const SOURCE_TO_PMMA_CM = 10;
const PMMA_X = SOURCE_X + (SOURCE_TO_PMMA_CM * PX_PER_CM); // 10cm gap

const PMMA_THICKNESS = 5 * (PX_PER_CM / 10); // 5mm scaled (2 pixels - strictly visual, made slightly thicker for visibility)
const PMMA_VISUAL_THICKNESS = 10; 
const PMMA_HEIGHT = 150;

const DETECTOR_WIDTH = 30;
const DETECTOR_HEIGHT = 60;

// Physics Constants provided by user
const K_CONST = 0.170; // m^2 * uSv/h
const K_ERROR = 0.024;
const MU_CONST = 0.02; // m^-1
const B_CONST = 0.15; // uSv/h (Background)

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: 'beta' | 'photon' | 'background_photon';
  life: number;
  history: {x: number, y: number}[];
}

const App: React.FC = () => {
  // State
  const [distanceCm, setDistanceCm] = useState<number>(80); // cm from PMMA
  const [counts, setCounts] = useState<number>(0); // Visual counts
  const [sourceOpen, setSourceOpen] = useState<boolean>(true);
  const [doseRate, setDoseRate] = useState<string>("0.150");
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);

  // Refs for simulation
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const requestRef = useRef<number>();
  const countsRef = useRef<number>(0);

  // --- Physics Calculation (The Formula) ---
  useEffect(() => {
    // Formula: H*(d) = K * e^(-mu * d) / d^2 + b
    const calculateDose = () => {
        let currentDose = B_CONST; // Base background radiation

        if (sourceOpen) {
            // d is distance in meters
            // Prevent division by zero. clamp min distance to 1cm
            const d = Math.max(distanceCm, 1) / 100; 
            
            const attenuation = Math.exp(-MU_CONST * d);
            const geometricLoss = d * d;
            
            const sourceContribution = (K_CONST * attenuation) / geometricLoss;
            currentDose += sourceContribution;
        }

        // Add +/- 2% noise for realism (simulating detector fluctuation)
        const noise = 1 + (Math.random() * 0.04 - 0.02);
        
        setDoseRate((currentDose * noise).toFixed(3));
    };

    // Update dose rate every 500ms to show fluctuation
    const interval = setInterval(calculateDose, 500);
    calculateDose(); // Immediate update on slide
    return () => clearInterval(interval);

  }, [distanceCm, sourceOpen]);


  // --- Simulation Logic (Visuals) ---
  const spawnParticle = () => {
    // 20 MBq source simulation (scaled down for browser performance)
    // Beta particles emit in a cone towards the PMMA
    const spreadY = (Math.random() - 0.5) * 2; 
    
    const p: Particle = {
      id: Math.random(),
      x: SOURCE_X + 10,
      y: CENTER_Y, 
      vx: 6 + Math.random() * 2, // Fast Beta
      vy: spreadY,
      type: 'beta',
      life: 200,
      history: []
    };
    particlesRef.current.push(p);
  };

  const spawnBackgroundParticle = () => {
    // Background photons appear from random directions (ambient radiation)
    const speed = 3 + Math.random(); 
    let startX, startY, vx, vy;
    
    const edge = Math.floor(Math.random() * 4);
    switch(edge) {
        case 0: // Top
            startX = Math.random() * CANVAS_WIDTH;
            startY = -10;
            vx = (Math.random() - 0.5) * speed;
            vy = Math.random() * speed;
            break;
        case 1: // Right
            startX = CANVAS_WIDTH + 10;
            startY = Math.random() * CANVAS_HEIGHT;
            vx = -Math.random() * speed;
            vy = (Math.random() - 0.5) * speed;
            break;
        case 2: // Bottom
            startX = Math.random() * CANVAS_WIDTH;
            startY = CANVAS_HEIGHT + 10;
            vx = (Math.random() - 0.5) * speed;
            vy = -Math.random() * speed;
            break;
        case 3: // Left
            startX = -10;
            startY = Math.random() * CANVAS_HEIGHT;
            vx = Math.random() * speed;
            vy = (Math.random() - 0.5) * speed;
            break;
        default:
            startX = 0; startY=0; vx=1; vy=1;
    }

    const p: Particle = {
        id: Math.random(),
        x: startX!,
        y: startY!,
        vx: vx!,
        vy: vy!,
        type: 'background_photon',
        life: 400, // Long life to cross screen
        history: []
    };
    particlesRef.current.push(p);
  };

  const updateParticles = () => {
    // Calculate detector position in pixels
    const detectorX = PMMA_X + PMMA_VISUAL_THICKNESS + (distanceCm * PX_PER_CM);
    const detectorYMin = CENTER_Y - DETECTOR_HEIGHT / 2;
    const detectorYMax = CENTER_Y + DETECTOR_HEIGHT / 2;

    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      // Update history for trails
      p.history.push({x: p.x, y: p.y});
      if (p.history.length > 10) {
        p.history.shift();
      }

      // Interaction with PMMA (Only for Source Betas)
      if (p.type === 'beta' && 
          p.x >= PMMA_X && 
          p.x <= PMMA_X + PMMA_VISUAL_THICKNESS && 
          p.y > CENTER_Y - PMMA_HEIGHT/2 && 
          p.y < CENTER_Y + PMMA_HEIGHT/2) {
        
        // Beta -> Bremsstrahlung (Photon)
        // Physics: Beta hits PMMA, stops, emits X-rays/Photons in various directions
        p.type = 'photon';
        p.history = []; // Clear trail so blue doesn't bleed into yellow
        
        // Scattering: Photons are emitted forward but with significant spread
        const angle = (Math.random() - 0.5) * (Math.PI / 1.5); 
        const speed = 4; // Photons constant speed
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
      }

      // Interaction with Detector (Source Photons + Background Photons)
      if (p.type === 'photon' || p.type === 'background_photon') {
        if (
          p.x >= detectorX &&
          p.x <= detectorX + DETECTOR_WIDTH &&
          p.y >= detectorYMin &&
          p.y <= detectorYMax
        ) {
          // Hit!
          countsRef.current += 1;
          setCounts(countsRef.current);
          p.life = 0; // Absorb particle
        }
      }

      // Cleanup boundaries
      if (p.x < -20 || p.x > CANVAS_WIDTH + 20 || p.y < -20 || p.y > CANVAS_HEIGHT + 20) {
        p.life = 0;
      }
    });

    // Remove dead particles
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
  };

  const drawHeatmap = (ctx: CanvasRenderingContext2D) => {
    // Optimisation: Draw low-res blocks
    const blockSize = 8;
    const cols = Math.ceil(CANVAS_WIDTH / blockSize);
    const rows = Math.ceil(CANVAS_HEIGHT / blockSize);

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const x = i * blockSize;
            const y = j * blockSize;
            
            // Calculate field at center of block
            let fieldValue = B_CONST;

            if (sourceOpen) {
                // Distance from PMMA Center (Source of Bremsstrahlung)
                // PMMA is roughly the emission point for H(10) photons
                const pmmaCenterX = PMMA_X + PMMA_VISUAL_THICKNESS / 2;
                const pmmaCenterY = CENTER_Y;
                
                const dx = x - pmmaCenterX;
                const dy = y - pmmaCenterY;
                const distPx = Math.sqrt(dx*dx + dy*dy);
                
                // Convert to meters
                const distM = Math.max(distPx / PX_PER_CM / 100, 0.01); // Avoid singularity
                
                const attenuation = Math.exp(-MU_CONST * distM);
                const geometricLoss = distM * distM;
                
                // Add source component
                fieldValue += (K_CONST * attenuation) / geometricLoss;
            }

            // Map value to Color (Heatmap)
            // Scale: 0.15 (blue) -> ~5.0 (green) -> >20 (red)
            // Logarithmic mapping helps visualize inverse square better
            const logVal = Math.log10(fieldValue);
            const minLog = Math.log10(B_CONST);
            const maxLog = Math.log10(50); // Cap at reasonably high dose for visual
            
            let t = (logVal - minLog) / (maxLog - minLog);
            t = Math.max(0, Math.min(1, t)); // Clamp 0-1
            
            // HSL: Blue (240) -> Cyan (180) -> Green (120) -> Yellow (60) -> Red (0)
            const hue = 240 - (t * 240);
            
            ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.4)`;
            ctx.fillRect(x, y, blockSize, blockSize);
        }
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // OPTIONAL: Draw Heatmap layer
    if (showHeatmap) {
        drawHeatmap(ctx);
    }

    // 0. Draw Floor Line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, FLOOR_Y);
    ctx.lineTo(CANVAS_WIDTH, FLOOR_Y);
    ctx.stroke();

    // 1. Draw "Percha" (Floor Stand) - Left Side
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 5;
    ctx.beginPath();
    
    // Base on floor
    ctx.moveTo(SOURCE_X - 30, FLOOR_Y);
    ctx.lineTo(SOURCE_X + 30, FLOOR_Y);
    
    // Vertical stand
    ctx.moveTo(SOURCE_X, FLOOR_Y);
    ctx.lineTo(SOURCE_X, CENTER_Y);
    
    // Holder Arm (Curve or clamp)
    ctx.moveTo(SOURCE_X, CENTER_Y);
    ctx.lineTo(SOURCE_X + 15, CENTER_Y); // Little arm holding source
    ctx.stroke();

    // 2. Draw Source (Sr-90 20MBq)
    ctx.fillStyle = '#222';
    // Housing
    ctx.fillRect(SOURCE_X + 15, CENTER_Y - 8, 20, 16);
    
    // Active element
    ctx.fillStyle = sourceOpen ? '#00ffaa' : '#333'; 
    ctx.beginPath();
    ctx.arc(SOURCE_X + 35, CENTER_Y, 4, 0, Math.PI * 2); 
    ctx.fill();
    
    // Label Source
    ctx.fillStyle = '#888';
    ctx.font = '10px Inter';
    ctx.fillText("Sr-90 (20 MBq)", SOURCE_X - 20, CENTER_Y - 20);

    // 3. Draw PMMA (Target)
    ctx.fillStyle = 'rgba(200, 230, 255, 0.3)'; // Glassy
    ctx.strokeStyle = 'rgba(200, 230, 255, 0.6)';
    ctx.lineWidth = 1;
    
    const pmmaTop = CENTER_Y - PMMA_HEIGHT / 2;
    ctx.fillRect(PMMA_X, pmmaTop, PMMA_VISUAL_THICKNESS, PMMA_HEIGHT);
    ctx.strokeRect(PMMA_X, pmmaTop, PMMA_VISUAL_THICKNESS, PMMA_HEIGHT);
    
    // Label PMMA
    ctx.fillStyle = '#aaddee';
    ctx.textAlign = 'center';
    ctx.fillText("PMMA (5mm)", PMMA_X + 5, pmmaTop - 10);
    
    // Draw 10cm marker arrow
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(SOURCE_X + 35, CENTER_Y + 50);
    ctx.lineTo(PMMA_X, CENTER_Y + 50);
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.fillText("10 cm", SOURCE_X + 35 + ((PMMA_X - (SOURCE_X+35))/2), CENTER_Y + 65);

    // 4. Draw Detector
    const detectorX = PMMA_X + PMMA_VISUAL_THICKNESS + (distanceCm * PX_PER_CM);
    const detectorTop = CENTER_Y - DETECTOR_HEIGHT / 2;

    // Stand for detector
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(detectorX + DETECTOR_WIDTH/2, FLOOR_Y);
    ctx.lineTo(detectorX + DETECTOR_WIDTH/2, detectorTop + DETECTOR_HEIGHT);
    ctx.stroke();

    // Detector Head
    ctx.fillStyle = '#222';
    ctx.fillRect(detectorX, detectorTop, DETECTOR_WIDTH, DETECTOR_HEIGHT);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.strokeRect(detectorX, detectorTop, DETECTOR_WIDTH, DETECTOR_HEIGHT);

    // Sensor Face
    ctx.fillStyle = '#114411';
    ctx.fillRect(detectorX, detectorTop + 2, 4, DETECTOR_HEIGHT - 4);
    
    // Label Detector
    ctx.fillStyle = '#fff';
    ctx.fillText("Probe", detectorX + 15, detectorTop - 10);

    // Distance Marker (from PMMA)
    ctx.fillStyle = '#fff';
    ctx.fillText(`${distanceCm} cm`, detectorX + 15, FLOOR_Y - 5);

    // 5. Draw Particles (Only if heatmap is OFF)
    if (!showHeatmap) {
        particlesRef.current.forEach(p => {
            if (p.type === 'beta') {
            // Beta: Blue fast streaks with trail
            if (p.history.length > 1) {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                // Draw backward through history
                for (let i = p.history.length - 1; i >= 0; i--) {
                    ctx.lineTo(p.history[i].x, p.history[i].y);
                }
                ctx.strokeStyle = `rgba(0, 136, 255, ${p.life/200})`; 
                ctx.lineWidth = 1.5;
                ctx.stroke();
            } else {
                // Fallback for new particles
                ctx.strokeStyle = '#0088ff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(p.x - p.vx*1.5, p.y - p.vy*1.5); 
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
            }
            } else if (p.type === 'photon') {
            // Bremsstrahlung Photon: Yellow dots/waves with subtle trail
            if (p.history.length > 1) {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                for (let i = p.history.length - 1; i >= 0; i--) {
                    ctx.lineTo(p.history[i].x, p.history[i].y);
                }
                ctx.strokeStyle = `rgba(255, 255, 0, ${p.life/400})`; // Very subtle yellow trail
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }

            ctx.fillStyle = `rgba(255, 255, 0, ${p.life/100})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2);
            ctx.fill();
            } else if (p.type === 'background_photon') {
            // Background Photon: Trail
            if (p.history.length > 1) {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                for (let i = p.history.length - 1; i >= 0; i--) {
                    ctx.lineTo(p.history[i].x, p.history[i].y);
                }
                ctx.strokeStyle = `rgba(255, 255, 100, ${p.life/500})`; // Faint trail
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }

            ctx.fillStyle = `rgba(255, 255, 100, ${Math.min(0.8, p.life/100)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2);
            ctx.fill();
            }
        });
    }
  };

  const tick = useCallback(() => {
    // 1. Source Emissions
    if (sourceOpen) {
        // High emission rate for "20 MBq" simulation feel
        for(let i=0; i<3; i++) spawnParticle(); 
    }
    
    // 2. Background Emissions (Always active)
    // ~0.3 probability per tick provides a nice sparse background
    if (Math.random() < 0.3) {
        spawnBackgroundParticle();
    }

    updateParticles();
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) draw(ctx);
    }
    requestRef.current = requestAnimationFrame(tick);
  }, [distanceCm, sourceOpen, showHeatmap]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(tick);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [tick]);

  // --- Handlers ---

  const handleReset = () => {
    setCounts(0);
    countsRef.current = 0;
    particlesRef.current = [];
  };

  return (
    <div className="min-h-screen text-gray-100 flex flex-col font-sans">
      <Header />
      
      <main className="flex-grow flex flex-col xl:flex-row items-start justify-center p-6 gap-6 max-w-[1600px] mx-auto w-full">
        
        {/* Left Column: Simulation Canvas */}
        <div className="flex-grow w-full xl:w-2/3 bg-black/40 border border-gray-700 rounded-xl overflow-hidden shadow-2xl relative backdrop-blur-sm flex flex-col">
            <div className="absolute top-4 right-4 z-10 bg-gray-900/90 p-4 rounded-lg border border-gray-500 shadow-lg min-w-[160px]">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Dose Rate (H*(10))</div>
                <div className="text-3xl font-mono text-yellow-400 font-bold tracking-tighter">
                  {doseRate} <span className="text-sm font-normal text-gray-400">µSv/h</span>
                </div>
                <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-800">
                   Particles Detected: {counts}
                </div>
            </div>

             {/* Heatmap Legend (Only visible if heatmap is on) */}
             {showHeatmap && (
                <div className="absolute bottom-20 right-4 z-10 bg-gray-900/80 p-3 rounded border border-gray-700 backdrop-blur text-xs flex flex-col gap-2">
                    <div className="text-gray-300 font-bold mb-1">Dose Intensity</div>
                    <div className="h-24 w-4 rounded-full bg-gradient-to-t from-[hsl(240,100%,50%)] via-[hsl(120,100%,50%)] to-[hsl(0,100%,50%)] mx-auto"></div>
                    <div className="flex flex-col justify-between h-24 absolute left-10 top-8 text-[10px] text-gray-400">
                        <span>High</span>
                        <span>Low</span>
                    </div>
                </div>
            )}

            <canvas 
                ref={canvasRef} 
                width={CANVAS_WIDTH} 
                height={CANVAS_HEIGHT}
                className="w-full h-auto object-contain bg-gradient-to-b from-[#151b25] to-[#0d0e12]"
            />
            
            <div className="p-4 bg-gray-900/50 border-t border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-500 font-mono">
                <div>
                  <span className="block text-gray-400 font-bold mb-1">FORMULA</span>
                  H*(d) = K · e^(-μd) / d² + b
                </div>
                <div className="md:text-right">
                   <span className="block text-blue-400/80">K = {K_CONST.toFixed(3)} ± {K_ERROR} m²·µSv/h</span>
                   <span className="block text-blue-400/80">μ = {MU_CONST} m⁻¹</span>
                   <span className="block text-blue-400/80">b = {B_CONST} µSv/h (Background)</span>
                </div>
            </div>
        </div>

        {/* Right Column: Controls */}
        <div className="w-full xl:w-1/3 flex flex-col gap-6">
            
            {/* Control Panel */}
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-6 backdrop-blur-md">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Lab Controls
                </h2>

                <div className="mb-8">
                    <label className="flex justify-between text-sm font-medium text-gray-300 mb-4">
                        <span>Detector Position (d from PMMA)</span>
                        <span className="text-blue-400 font-mono">{distanceCm} cm</span>
                    </label>
                    <input 
                        type="range" 
                        min="0" 
                        max="150" 
                        value={distanceCm} 
                        onChange={(e) => setDistanceCm(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-2 font-mono">
                        <span>| 0 cm</span>
                        <span>| 75 cm</span>
                        <span>| 150 cm</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                     <div className="flex items-center justify-between bg-gray-900/40 p-3 rounded-lg border border-gray-700/50 mb-2">
                        <span className="text-sm font-medium text-gray-300">View Mode</span>
                        <label className="inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} className="sr-only peer" />
                            <div className="relative w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            <span className="ms-3 text-sm font-medium text-gray-400">{showHeatmap ? "Heatmap" : "Particles"}</span>
                        </label>
                    </div>

                    <div className="flex gap-3">
                        <button 
                            onClick={() => setSourceOpen(!sourceOpen)}
                            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                                sourceOpen 
                                ? 'bg-green-500/20 text-green-300 border border-green-500/50 hover:bg-green-500/30' 
                                : 'bg-red-500/20 text-red-300 border border-red-500/50 hover:bg-red-500/30'
                            }`}
                        >
                            {sourceOpen ? '● Source OPEN' : '○ Source SHIELDED'}
                        </button>
                        <button 
                            onClick={handleReset}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 py-3 px-4 rounded-lg font-semibold transition-colors"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;
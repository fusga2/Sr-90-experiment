
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI } from "@google/genai";

export const explainExperiment = async (
    distance: number,
    uSvh: number
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    // distance is in cm
    const r_meters = Math.max(distance, 1) / 100;
    
    const prompt = `
    You are a Senior Physics Lab Supervisor. Analyze the current data from a student's Bremsstrahlung experiment.
    
    Experiment Parameters:
    - Source: Strontium-90 (Sr-90) beta emitter (~20 MBq).
    - Target: 5mm thick PMMA.
    - Detector Position: d = ${distance} cm (${r_meters} m) from PMMA.
    - Current Reading: ${uSvh} µSv/h.
    
    Theoretical Model:
    The net dose rate H*(d) follows the formula:
    H*(d) = (K * e^(-μ * d)) / d^2 + b
    
    Where:
    - K = 0.170 ± 0.024 m²·µSv/h (Depth dose constant)
    - μ = 0.02 m⁻¹ (Attenuation coefficient)
    - b = 0.15 µSv/h (Background radiation)
    - d is distance in meters
    
    Please provide a short lab report covering:
    1. Verification: Calculate the expected value for d=${r_meters}m using the formula and compare with the reading.
    2. Physics: Briefly explain the terms: inverse square law, exponential attenuation, and background radiation.
    3. Safety: Is this level significantly above background?
    
    Keep the tone professional, scientific, and concise.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text || "No explanation available.";
    } catch (error) {
        console.error("AI Error:", error);
        return "Unable to contact the lab AI assistant at this moment.";
    }
};
